// supabase-client.js
// Modified to work without a bundler or module system (file:// protocol compatible)

(function() {
  // Ensure Supabase library is loaded from CDN in HTML
  if (!window.supabase || !window.supabase.createClient) {
    console.error('Supabase library not loaded. Please include the CDN script.');
    return;
  }

  const SUPABASE_URL = window.SUPABASE_URL || "https://mpodufbvckfxafgnazyv.supabase.co";
  const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wb2R1ZmJ2Y2tmeGFmZ25henl2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0MTcyMDQsImV4cCI6MjA4NDk5MzIwNH0.yGJYd4I2Il_S5qedpBpujz-tPUjw-tD1HVH7TgwQZUA";

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('❌ Supabase keys are missing! Please check config.js is loaded correctly.');
    alert('Configuration Error: Supabase keys are missing. Check console for details.');
    return;
  }

  // Create the client using the factory from the CDN library
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Auth Service
  const auth = {
    // Register new user
    async signUp(email, password, name, userType) {
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name,
            role: userType
          },
          emailRedirectTo: new URL('email_confirmed.html', window.location.href).href
        }
      })
      
      if (error) throw error
      return data
    },

    // Login
    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({
        email,
        password
      })
      
      if (error) throw error
      return data
    },

    // Logout
    async signOut() {
      const { error } = await client.auth.signOut()
      if (error) throw error
    },

    // Get current user
    async getUser() {
      const { data: { user }, error } = await client.auth.getUser()
      if (error) throw error
      return user
    },

    // Get session
    async getSession() {
      return await client.auth.getSession()
    },

    // Get user profile
    async getProfile(userId) {
      const { data, error } = await client
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single()
      
      if (error) throw error
      return data
    },

    // Update user (e.g., for password reset)
    async updateUser(updates) {
      const { data, error } = await client.auth.updateUser(updates)
      if (error) throw error
      return data
    },

    // Resend confirmation email
    async resendConfirmation(email) {
      const { data, error } = await client.auth.resend({ type: 'signup', email: email })
      if (error) throw error
      return data
    },

    // Reset password for email
    async resetPasswordForEmail(email) {
      const { data, error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: new URL('password_reset.html', window.location.href).href
      })
      if (error) throw error
      return data
    },

    // Listen to auth changes
    onAuthChange(callback) {
      return client.auth.onAuthStateChange((event, session) => {
        callback(event, session)
      })
    },

    // Check if authenticated
    async isAuthenticated() {
      const { data: { session } } = await client.auth.getSession()
      return !!session
    }
  }

  // Database Service
  const db = {
    // ========== PLANTS ==========
    
    async getPlants() {
      const { data, error } = await client
        .from('plants')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (error) throw error
      return data
    },

    async addPlant(plant) {
      const user = await auth.getUser()
      
      const { data, error } = await client
        .from('plants')
        .insert({
          ...plant,
          user_id: user.id
        })
        .select()
        .single()
      
      if (error) throw error
      return data
    },

    async updatePlant(id, updates) {
      const { data, error } = await client
        .from('plants')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      
      if (error) throw error
      return data
    },

    async deletePlant(id) {
      const { error } = await client
        .from('plants')
        .delete()
        .eq('id', id)
      
      if (error) throw error
    },

    // ========== EVENTS ==========
    
    async getEvents() {
      const { data, error } = await client
        .from('events')
        .select('*')
        .order('event_date', { ascending: true })
      
      if (error) throw error
      return data
    },

    async addEvent(event) {
      const user = await auth.getUser()
      
      const { data, error } = await client
        .from('events')
        .insert({
          ...event,
          user_id: user.id
        })
        .select()
        .single()
      
      if (error) throw error
      return data
    },

    async updateEvent(id, updates) {
      const { data, error } = await client
        .from('events')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      
      if (error) throw error
      return data
    },

    async deleteEvent(id) {
      const { error } = await client
        .from('events')
        .delete()
        .eq('id', id)
      
      if (error) throw error
    },

    // ========== TEACHINGS (AI Data Moat!) ==========
    
    async addTeaching(teaching) {
      const user = await auth.getUser()
      
      const { data, error } = await client
        .from('teachings')
        .insert({
          ...teaching,
          user_id: user.id
        })
        .select()
        .single()
      
      if (error) throw error
      return data
    },

    async getTeachings(domain = 'gardening', minConfidence = 0.5) {
      const { data, error } = await client
        .from('teachings')
        .select('*')
        .eq('domain', domain)
        .gte('confidence', minConfidence)
        .order('confidence', { ascending: false })
        .limit(100)
      
      if (error) throw error
      return data
    },

    // ========== JOBS (Contractor) ==========
    
    async getJobs() {
      const { data, error } = await client
        .from('jobs')
        .select(`
          *,
          client:client_id (
            id,
            email,
            raw_user_meta_data
          )
        `)
        .order('scheduled_date', { ascending: true })
      
      if (error) throw error
      return data
    },

    async addJob(job) {
      const user = await auth.getUser()
      
      const { data, error } = await client
        .from('jobs')
        .insert({
          ...job,
          contractor_id: user.id
        })
        .select()
        .single()
      
      if (error) throw error
      return data
    },

    async updateJob(id, updates) {
      const { data, error } = await client
        .from('jobs')
        .update(updates)
        .eq('id', id)
        .select()
        .single()
      
      if (error) throw error
      return data
    },

    async completeJob(id) {
      return db.updateJob(id, {
        status: 'completed',
        completed_date: new Date().toISOString().split('T')[0]
      })
    }
  }

  // Real-time subscriptions
  const realtime = {
    // Subscribe to new jobs
    subscribeToJobs(callback) {
      return client
        .channel('jobs-channel')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'jobs' },
          callback
        )
        .subscribe()
    },

    // Subscribe to plant changes
    subscribeToPlants(callback) {
      return client
        .channel('plants-channel')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'plants' },
          callback
        )
        .subscribe()
    },

    // Unsubscribe
    unsubscribe(subscription) {
      client.removeChannel(subscription)
    }
  }

  // Expose to Global Scope
  window.supabase = client; // Overwrite the library factory with the initialized client
  window.auth = auth;
  window.db = db;
  window.realtime = realtime;
  window.supabaseAuth = auth; // Alias for compatibility

})();