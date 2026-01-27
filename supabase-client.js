// supabase-client.js
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Check if running in a build environment (Vite) or directly in browser
const env = import.meta.env || {}

const SUPABASE_URL = env.VITE_SUPABASE_URL || window.SUPABASE_URL
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY || window.SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Supabase environment variables missing. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Auth Service
export const auth = {
  // Register new user
  async signUp(email, password, name, userType) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name,
          user_type: userType
        }
      }
    })
    
    if (error) throw error
    return data
  },

  // Login
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    
    if (error) throw error
    return data
  },

  // Logout
  async signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  },

  // Get current user
  async getUser() {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error) throw error
    return user
  },

  // Get session
  async getSession() {
    return await supabase.auth.getSession()
  },

  // Get user profile
  async getProfile(userId) {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single()
    
    if (error) throw error
    return data
  },

  // Update user (e.g., for password reset)
  async updateUser(updates) {
    const { data, error } = await supabase.auth.updateUser(updates)
    if (error) throw error
    return data
  },

  // Resend confirmation email
  async resendConfirmation(email) {
    const { data, error } = await supabase.auth.resend({ type: 'signup', email: email })
    if (error) throw error
    return data
  },

  // Reset password for email
  async resetPasswordForEmail(email) {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.href.replace(/login\.html|index\.html/, 'password_reset.html')
    })
    if (error) throw error
    return data
  },

  // Listen to auth changes
  onAuthChange(callback) {
    return supabase.auth.onAuthStateChange((event, session) => {
      callback(event, session)
    })
  },

  // Check if authenticated
  async isAuthenticated() {
    const { data: { session } } = await supabase.auth.getSession()
    return !!session
  }
}

// Database Service
export const db = {
  // ========== PLANTS ==========
  
  async getPlants() {
    const { data, error } = await supabase
      .from('plants')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (error) throw error
    return data
  },

  async addPlant(plant) {
    const user = await auth.getUser()
    
    const { data, error } = await supabase
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
    const { data, error } = await supabase
      .from('plants')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  async deletePlant(id) {
    const { error } = await supabase
      .from('plants')
      .delete()
      .eq('id', id)
    
    if (error) throw error
  },

  // ========== EVENTS ==========
  
  async getEvents() {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: true })
    
    if (error) throw error
    return data
  },

  async addEvent(event) {
    const user = await auth.getUser()
    
    const { data, error } = await supabase
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
    const { data, error } = await supabase
      .from('events')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    
    if (error) throw error
    return data
  },

  async deleteEvent(id) {
    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', id)
    
    if (error) throw error
  },

  // ========== TEACHINGS (AI Data Moat!) ==========
  
  async addTeaching(teaching) {
    const user = await auth.getUser()
    
    const { data, error } = await supabase
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
    const { data, error } = await supabase
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
    const { data, error } = await supabase
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
    
    const { data, error } = await supabase
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
    const { data, error } = await supabase
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
export const realtime = {
  // Subscribe to new jobs
  subscribeToJobs(callback) {
    return supabase
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
    return supabase
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
    supabase.removeChannel(subscription)
  }
}