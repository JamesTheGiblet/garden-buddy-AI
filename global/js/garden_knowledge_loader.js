/**
 * Garden Buddy Knowledge Loader
 * Fetches baseline knowledge from GitHub Gist and combines with user-taught knowledge from Supabase
 */

class GardenKnowledgeLoader {
    constructor(gistUrl, supabaseClient) {
        this.gistUrl = gistUrl; // Your raw gist URL
        this.supabase = supabaseClient;
        this.baselineKnowledge = null;
        this.userKnowledge = [];
        this.combinedKnowledge = null;
    }

    /**
     * Step 1: Fetch baseline knowledge from GitHub Gist
     */
    async fetchBaselineKnowledge() {
        try {
            const response = await fetch(this.gistUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch gist: ${response.statusText}`);
            }
            this.baselineKnowledge = await response.json();
            console.log(`✓ Loaded ${this.baselineKnowledge.entries.length} baseline knowledge entries`);
            return this.baselineKnowledge;
        } catch (error) {
            console.error('Error fetching baseline knowledge:', error);
            // Fallback to empty knowledge if gist fails
            this.baselineKnowledge = { entries: [] };
            return this.baselineKnowledge;
        }
    }

    /**
     * Step 2: Fetch user-taught knowledge from Supabase
     * Assumes you have a 'garden_knowledge' table with columns:
     * - id, user_id, topic, question, answer, category, created_at
     */
    async fetchUserKnowledge(userId = null) {
        try {
            let query = this.supabase
                .from('garden_knowledge')
                .select('*')
                .order('created_at', { ascending: false });

            // If you want per-user knowledge, filter by user_id
            if (userId) {
                query = query.eq('user_id', userId);
            }

            const { data, error } = await query;

            if (error) throw error;

            this.userKnowledge = data || [];
            console.log(`✓ Loaded ${this.userKnowledge.length} user-taught knowledge entries`);
            return this.userKnowledge;
        } catch (error) {
            console.error('Error fetching user knowledge:', error);
            this.userKnowledge = [];
            return this.userKnowledge;
        }
    }

    /**
     * Step 3: Combine baseline and user knowledge
     * User knowledge takes precedence over baseline for same topics
     */
    combineKnowledge() {
        const combined = {
            baseline: this.baselineKnowledge?.entries || [],
            userTaught: this.userKnowledge,
            totalEntries: (this.baselineKnowledge?.entries?.length || 0) + this.userKnowledge.length
        };

        this.combinedKnowledge = combined;
        console.log(`✓ Combined knowledge: ${combined.totalEntries} total entries`);
        return combined;
    }

    /**
     * Step 4: Search knowledge base for relevant entries
     * Simple keyword matching - can be enhanced with semantic search later
     */
    searchKnowledge(query, maxResults = 5) {
        if (!this.combinedKnowledge) {
            console.warn('Knowledge not loaded yet');
            return [];
        }

        // Stop words to ignore in search
        const stopWords = ['when', 'should', 'i', 'how', 'do', 'what', 'is', 'a', 'the', 'in', 'on', 'to', 'for', 'my', 'can', 'get', 'does', 'of', 'and'];
        
        const searchTerms = query.toLowerCase()
            .replace(/[?.,!]/g, '') // Remove punctuation
            .split(/\s+/)
            .filter(t => t.length > 1 && !stopWords.includes(t));

        if (searchTerms.length === 0) return [];

        const results = [];

        const calculateScore = (entry, isUserTaught) => {
            let score = 0;
            const topic = entry.topic.toLowerCase();
            const content = isUserTaught 
                ? `${entry.question} ${entry.answer} ${entry.category}`.toLowerCase()
                : `${entry.quick_answer} ${entry.category} ${JSON.stringify(entry.details || {})}`.toLowerCase();

            searchTerms.forEach(term => {
                // Topic match is weighted heavily
                if (topic === term) score += 10;
                else if (topic.includes(term)) score += 5;
                // Content match
                else if (content.includes(term)) score += 1;
            });
            
            return score;
        };

        // Search user-taught knowledge first (higher priority)
        this.combinedKnowledge.userTaught.forEach(entry => {
            const score = calculateScore(entry, true);
            if (score >= 2) { // Minimum threshold
                results.push({ ...entry, source: 'user-taught', relevance: score });
            }
        });

        // Search baseline knowledge
        this.combinedKnowledge.baseline.forEach(entry => {
            const score = calculateScore(entry, false);
            if (score >= 2) { // Minimum threshold
                results.push({ ...entry, source: 'baseline', relevance: score });
            }
        });

        // Sort by relevance and return top results
        return results
            .sort((a, b) => b.relevance - a.relevance)
            .slice(0, maxResults);
    }

    /**
     * Step 5: Generate AI prompt context from knowledge
     * This is what you inject into your Claude API calls
     */
    generateAIContext(userQuery = null, maxEntries = 10) {
        let context = `# Garden Buddy Knowledge Base\n\n`;
        context += `Region: ${this.baselineKnowledge?.region || 'UK'}\n`;
        context += `Last Updated: ${this.baselineKnowledge?.last_updated || 'N/A'}\n\n`;

        // If there's a specific query, search for relevant entries
        if (userQuery) {
            const relevantEntries = this.searchKnowledge(userQuery, maxEntries);
            
            if (relevantEntries.length > 0) {
                context += `## Relevant Knowledge for "${userQuery}":\n\n`;
                
                relevantEntries.forEach((entry, index) => {
                    if (entry.source === 'user-taught') {
                        context += `### ${index + 1}. ${entry.topic} (User-Taught)\n`;
                        context += `Q: ${entry.question}\n`;
                        context += `A: ${entry.answer}\n\n`;
                    } else {
                        context += `### ${index + 1}. ${entry.topic} (Baseline - ${entry.category})\n`;
                        context += `${entry.quick_answer}\n`;
                        if (entry.details) {
                            context += `\nDetails:\n`;
                            Object.entries(entry.details).forEach(([key, value]) => {
                                context += `- ${key}: ${value}\n`;
                            });
                        }
                        context += `\n`;
                    }
                });
            }
        } else {
            // No specific query - provide general context summary
            context += `## Available Knowledge:\n`;
            context += `- ${this.combinedKnowledge.baseline.length} baseline entries\n`;
            context += `- ${this.combinedKnowledge.userTaught.length} user-taught entries\n\n`;
            
            // Summarize categories
            const categories = {};
            this.combinedKnowledge.baseline.forEach(entry => {
                categories[entry.category] = (categories[entry.category] || 0) + 1;
            });
            
            context += `### Categories:\n`;
            Object.entries(categories).forEach(([category, count]) => {
                context += `- ${category}: ${count} entries\n`;
            });
        }

        return context;
    }

    /**
     * Step 6: Save user-taught knowledge to Supabase
     */
    async saveUserKnowledge(knowledgeData) {
        try {
            const { data, error } = await this.supabase
                .from('garden_knowledge')
                .insert([{
                    user_id: knowledgeData.userId,
                    topic: knowledgeData.topic,
                    question: knowledgeData.question,
                    answer: knowledgeData.answer,
                    category: knowledgeData.category || 'general',
                    created_at: new Date().toISOString()
                }])
                .select();

            if (error) throw error;

            console.log('✓ Saved new user knowledge:', data);
            
            // Refresh user knowledge cache
            await this.fetchUserKnowledge(knowledgeData.userId);
            this.combineKnowledge();
            
            return data;
        } catch (error) {
            console.error('Error saving user knowledge:', error);
            throw error;
        }
    }

    /**
     * Complete initialization - call this once at app startup
     */
    async initialize(userId = null) {
        console.log('🌱 Initializing Garden Buddy Knowledge System...');
        await this.fetchBaselineKnowledge();
        await this.fetchUserKnowledge(userId);
        this.combineKnowledge();
        console.log('✓ Knowledge system ready!');
        return this.combinedKnowledge;
    }
}

/**
 * USAGE EXAMPLE
 */

// Example: Initialize the knowledge loader
async function initializeGardenBuddy() {
    // Your Supabase client (already configured in your app)
    const supabase = window.supabase; // Or however you access it
    
    // Your GitHub Gist raw URL
    const GIST_URL = 'https://gist.githubusercontent.com/YOUR_USERNAME/GIST_ID/raw/garden_buddy_knowledge_base.json';
    
    // Create knowledge loader instance
    const knowledgeLoader = new GardenKnowledgeLoader(GIST_URL, supabase);
    
    // Initialize (fetches both baseline and user knowledge)
    const currentUserId = 'user-123'; // Get from your auth system
    await knowledgeLoader.initialize(currentUserId);
    
    return knowledgeLoader;
}

// Example: Use in your chat function
async function handleUserMessage(userMessage, knowledgeLoader) {
    // Generate relevant context for this specific question
    const knowledgeContext = knowledgeLoader.generateAIContext(userMessage, 5);
    
    // Build your AI prompt
    const systemPrompt = `You are Garden Buddy, a friendly UK gardening expert assistant.
    
${knowledgeContext}

When answering questions:
1. Use the knowledge base above when relevant
2. Prioritize user-taught knowledge (it's specific to this user's garden)
3. Be conversational and helpful
4. If the answer isn't in the knowledge base, use your general gardening knowledge
5. Suggest teaching you new things the user discovers

Remember: You can learn! If the user teaches you something new, acknowledge it and offer to remember it.`;

    // Call Claude API with the enhanced context
    const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1000,
            system: systemPrompt,
            messages: [
                { role: "user", content: userMessage }
            ],
        })
    });

    const data = await response.json();
    return data.content[0].text;
}

// Example: Save new user-taught knowledge
async function teachGardenBuddy(knowledgeLoader, userId, learningData) {
    await knowledgeLoader.saveUserKnowledge({
        userId: userId,
        topic: learningData.topic,
        question: learningData.question,
        answer: learningData.answer,
        category: learningData.category
    });
    
    return "Thanks! I've learned something new about your garden!";
}

// Example: Search knowledge base
function searchGarden(knowledgeLoader, query) {
    const results = knowledgeLoader.searchKnowledge(query, 10);
    return results;
}

// Export for use in your Garden Buddy app
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GardenKnowledgeLoader;
}
