// --- Gardening Intelligence & Logic ---

let wizardState = { active: false, category: null, step: 0, answers: [] };
let knowledgeBase = { version: "1.0.0-fallback", categories: {}, diagnostic_questions: {} };
let plantDatabase = {};
let knowledgeLoader = null;

async function loadKnowledgeBase() {
    const GIST_URL = 'https://gist.github.com/JamesTheGiblet/87ddb1148c0a52842572b56f562e2b50';
    
    if (typeof GardenKnowledgeLoader !== 'undefined') {
        try {
            knowledgeLoader = new GardenKnowledgeLoader(GIST_URL, window.supabase);
            await knowledgeLoader.initialize(currentUserId);

            // Store globally so chat functions can access it
            window.gardenKnowledge = knowledgeLoader;

            if (knowledgeLoader.baselineKnowledge) {
                knowledgeBase = knowledgeLoader.baselineKnowledge;
                console.log('✅ Knowledge base loaded:', knowledgeBase.entries?.length || 0, 'entries');
            }
        } catch (e) {
            console.error('Knowledge loader failed:', e);
            // Fallback to direct fetch
            try {
                const response = await fetch(GIST_URL);
                const data = await response.json();
                if (data && data.entries) {
                    knowledgeBase = data;
                    console.log('✅ Fallback knowledge loaded:', data.entries.length, 'entries');
                }
            } catch (e2) {
                console.error('Failed to load knowledge base:', e2);
            }
        }
    } else {
        // Legacy fallback if loader not available
        try {
            const response = await fetch(GIST_URL);
            const data = await response.json();
            if (data && data.entries) {
                knowledgeBase = data;
                console.log('✅ Knowledge loaded (legacy):', data.entries.length, 'entries');
            }
        } catch (e) {
            console.error('Failed to load knowledge base:', e);
        }
    }
}

async function refreshUserKnowledge() {
    if (knowledgeLoader && currentUserId) {
        try {
            await knowledgeLoader.fetchUserKnowledge(currentUserId);
            knowledgeLoader.combineKnowledge();
            console.log('✅ User knowledge refreshed');
        } catch (e) {
            console.error('Failed to refresh user knowledge:', e);
        }
    }
}

async function initializePlantDatabase() {
    if (Object.keys(plantDatabase).length === 0) {
        let loaded = false;
        if (window.supabase) {
            try {
                const { data, error } = await window.supabase.from('plants').select('*');
                if (!error && data && data.length > 0) {
                    data.forEach(p => {
                        plantDatabase[p.name.toLowerCase()] = {
                            emoji: (p.metadata && p.metadata.emoji) ? p.metadata.emoji : '🌱',
                            type: p.type || 'vegetable',
                            sun: p.sun || 'Unknown',
                            water: p.water || 'Regular',
                            daysToHarvest: p.days_to_harvest || 0
                        };
                    });
                    loaded = true;
                }
            } catch (err) { console.warn("Supabase plant fetch failed", err); }
        }
        if (!loaded) {
            plantDatabase = {
                'tomato': { emoji: '🍅', type: 'vegetable', sun: 'Full sun (6-8 hours)', water: '1-2 inches per week', daysToHarvest: 60 },
                'basil': { emoji: '🌿', type: 'herb', sun: 'Partial to full sun', water: 'Keep soil moist', daysToHarvest: 30 },
                'lettuce': { emoji: '🥬', type: 'vegetable', sun: 'Partial sun', water: 'Keep soil moist', daysToHarvest: 45 },
                'carrot': { emoji: '🥕', type: 'vegetable', sun: 'Full sun', water: '1 inch per week', daysToHarvest: 70 },
                'pepper': { emoji: '🫑', type: 'vegetable', sun: 'Full sun', water: '1-2 inches per week', daysToHarvest: 65 },
                'cucumber': { emoji: '🥒', type: 'vegetable', sun: 'Full sun', water: '1-2 inches per week', daysToHarvest: 55 },
                'zucchini': { emoji: '🥒', type: 'vegetable', sun: 'Full sun', water: '1-2 inches per week', daysToHarvest: 50 },
                'courgette': { emoji: '🥒', type: 'vegetable', sun: 'Full sun', water: '1-2 inches per week', daysToHarvest: 50 },
                'strawberry': { emoji: '🍓', type: 'fruit', sun: 'Full sun', water: '1 inch per week', daysToHarvest: 90 },
                'rosemary': { emoji: '🌿', type: 'herb', sun: 'Full sun', water: 'Let soil dry between', daysToHarvest: 90 },
                'mint': { emoji: '🌿', type: 'herb', sun: 'Partial sun', water: 'Keep soil moist', daysToHarvest: 30 },
                'sunflower': { emoji: '🌻', type: 'flower', sun: 'Full sun', water: 'Moderate', daysToHarvest: 80 },
                'lavender': { emoji: '🪻', type: 'herb', sun: 'Full sun', water: 'Drought tolerant', daysToHarvest: 120 }
            };
        }
    }
}

async function processTeaching(content) {
    const teaching = content.substring(7).trim();
    if (teaching) {
        gardenMemory.teachings.push({ text: teaching, timestamp: Date.now(), type: 'teaching' });
        if (window.supabase && authToken) {
            try {
                if (!currentUserId) { const { data: { user } } = await window.supabase.auth.getUser(); if (user) currentUserId = user.id; }
                if (currentUserId) await window.supabase.from('teachings').insert([{ teaching_type: 'teach', content: teaching, created_at: new Date().toISOString(), user_id: currentUserId }]);
            } catch (e) { console.error('Supabase sync failed', e); }
        }
        const plantedMatch = teaching.match(/planted\s+(?:a\s+|an\s+|some\s+)?([a-zA-Z]+)/i);
        if (plantedMatch && plantedMatch[1]) {
            let plantName = plantedMatch[1].toLowerCase();
            if (plantName.endsWith('es')) plantName = plantName.slice(0, -2);
            else if (plantName.endsWith('s')) plantName = plantName.slice(0, -1);
            const dbMatch = Object.keys(plantDatabase).find(k => k === plantName || k.includes(plantName));
            const finalName = dbMatch ? (dbMatch.charAt(0).toUpperCase() + dbMatch.slice(1)) : (plantName.charAt(0).toUpperCase() + plantName.slice(1));
            await addPlantToGarden(finalName);
        }
        if (teaching.toLowerCase().includes('bed') || teaching.toLowerCase().includes('raised')) gardenMemory.gardenLayout.lastUpdate = Date.now();
        if (teaching.toLowerCase().includes('planted') || teaching.toLowerCase().includes('growing')) gardenMemory.gardenLayout.lastUpdate = Date.now();
        saveMemory();
    }
}

async function processCorrection(content) {
    const correction = content.substring(6).trim();
    if (correction) {
        gardenMemory.corrections.push({ text: correction, timestamp: Date.now(), type: 'correction' });
        saveMemory();
        if (window.supabase && authToken) {
            try {
                if (!currentUserId) { const { data: { user } } = await window.supabase.auth.getUser(); if (user) currentUserId = user.id; }
                if (currentUserId) await window.supabase.from('teachings').insert([{ teaching_type: 'wrong', content: correction, created_at: new Date().toISOString(), user_id: currentUserId }]);
            } catch (e) { console.error('Supabase sync failed', e); }
        }
    }
}

async function processWhy(content) {
    if (window.supabase && authToken) {
        try {
            if (!currentUserId) { const { data: { user } } = await window.supabase.auth.getUser(); if (user) currentUserId = user.id; }
            if (currentUserId) await window.supabase.from('teachings').insert([{ teaching_type: 'why', content: content, created_at: new Date().toISOString(), user_id: currentUserId }]);
        } catch (e) { console.error('Supabase sync failed', e); }
    }
}

function parseNaturalTeaching(message) {
    const patterns = [
        { regex: /(?:i have|i've got|there (?:is|are))\s+(\d+)\s+([a-z\s]+)/i, extract: (m) => `User has ${m[1]} ${m[2]}`, category: 'layout' },
        { regex: /(?:my|the)\s+([a-z]+)\s+(?:is|are)\s+([a-z\s]+)/i, extract: (m) => `User's ${m[1]} is ${m[2]}`, category: 'condition' },
        { regex: /(?:gets?|receives?)\s+(\d+)\s*(?:hours?|hrs?)\s+(?:of\s+)?sun/i, extract: (m) => `Garden gets ${m[1]} hours of sunlight`, category: 'sun' },
        { regex: /planted?\s+(?:some\s+)?([a-z]+)\s+(?:in|on)\s+([a-z\s]+)/i, extract: (m) => { conversationContext.lastPlantMentioned = m[1]; return `Planted ${m[1]} in ${m[2]}`; }, category: 'planting' },
        { regex: /(?:watering?|water)\s+(?:every|once)\s+([a-z\s]+)/i, extract: (m) => `Watering schedule: ${m[1]}`, category: 'watering' }
    ];
    for (const pattern of patterns) {
        const match = message.match(pattern.regex);
        if (match) {
            const extracted = pattern.extract(match);
            gardenMemory.teachings.push({ text: extracted, timestamp: Date.now(), type: 'auto-parsed', category: pattern.category });
            saveMemory();
            conversationContext.lastTopics.push(pattern.category);
            if (conversationContext.lastTopics.length > 5) conversationContext.lastTopics.shift();
            return { success: true, category: pattern.category };
        }
    }
    return { success: false };
}

function detectPlantMentions(message) {
    const lowerMsg = message.toLowerCase();
    const detectedPlants = [];
    for (const [plantName, data] of Object.entries(plantDatabase)) {
        const variants = [plantName, plantName + 's', plantName + 'es', plantName.slice(0, -1)];
        for (const variant of variants) {
            if (lowerMsg.includes(variant)) {
                detectedPlants.push(plantName);
                conversationContext.lastPlantMentioned = plantName;
                break;
            }
        }
    }
    return detectedPlants;
}

function getSmartFollowUp() {
    const recentTopics = conversationContext.lastTopics.slice(-3);
    if (conversationContext.consecutiveQuestions >= 2) { conversationContext.consecutiveQuestions = 0; return null; }
    const hasLayout = gardenMemory.teachings.some(t => /bed|container|ground|pot/i.test(t.text));
    const hasSun = gardenMemory.teachings.some(t => /sun|shade|light/i.test(t.text));
    const hasSoil = gardenMemory.teachings.some(t => /soil|compost|clay|sandy/i.test(t.text));
    if (!hasLayout && !recentTopics.includes('layout')) { conversationContext.consecutiveQuestions++; return "By the way, are you growing in raised beds, containers, or in the ground?"; }
    if (!hasSun && !recentTopics.includes('sun') && hasLayout) { conversationContext.consecutiveQuestions++; return "Quick question - how much sunlight does your garden get daily?"; }
    if (!hasSoil && !recentTopics.includes('soil') && hasLayout && hasSun) { conversationContext.consecutiveQuestions++; return "What's your soil like? Clay-heavy, sandy, or pretty balanced?"; }
    if (gardenMemory.plants.length > 0 && !recentTopics.includes('plants')) {
        const randomPlant = gardenMemory.plants[Math.floor(Math.random() * gardenMemory.plants.length)];
        conversationContext.lastPlantMentioned = randomPlant.name;
        conversationContext.consecutiveQuestions++;
        return `How's your ${randomPlant.emoji} ${randomPlant.name} doing lately?`;
    }
    return null;
}

function getMemoryReference() {
    if (Math.random() > 0.85) {
        const pastTeachings = gardenMemory.teachings.slice(-10);
        const pastPlants = gardenMemory.plants.slice(-5);
        if (pastPlants.length > 0 && Math.random() > 0.5) {
            const plant = pastPlants[Math.floor(Math.random() * pastPlants.length)];
            const daysAgo = Math.floor((Date.now() - plant.plantedDate) / (1000 * 60 * 60 * 24));
            if (daysAgo > 7) return `\n\nBy the way, it's been ${daysAgo} days since you planted your ${plant.emoji} ${plant.name}. How's it doing?`;
        }
        if (pastTeachings.length > 3) {
            const teaching = pastTeachings[Math.floor(Math.random() * pastTeachings.length)];
            const daysAgo = Math.floor((Date.now() - teaching.timestamp) / (1000 * 60 * 60 * 24));
            if (daysAgo > 3 && daysAgo < 30) return `\n\nRemembering what you told me about ${teaching.text.toLowerCase()}. Still accurate?`;
        }
    }
    return '';
}

function getSeasonalContext() {
    const now = new Date();
    const month = now.getMonth();
    const seasons = {
        winter: { months: [11, 0, 1], tips: ["Planning is key in winter!", "Great time to prep beds!", "Seed catalogs are your friend!"] },
        spring: { months: [2, 3, 4], tips: ["Prime planting season!", "Watch for late frosts!", "Time to get growing!"] },
        summer: { months: [5, 6, 7], tips: ["Keep watering consistent!", "Harvest season is here!", "Watch for pests in the heat!"] },
        fall: { months: [8, 9, 10], tips: ["Great for cool-season crops!", "Time to mulch!", "Harvest and preserve!"] }
    };
    for (const [season, data] of Object.entries(seasons)) {
        if (data.months.includes(month)) return data.tips[Math.floor(Math.random() * data.tips.length)];
    }
    return '';
}

function getVariedResponse(category) {
    const library = {
        water: ["💧 Watering is an art! It depends on your soil and plants. How often are you currently watering?", "🚿 Deep watering less often beats frequent shallow watering! How's your routine?", "💧 The finger test works great - stick your finger 2 inches in. Dry? Time to water!", "🌧️ If it rained recently, your plants might be good! Check the soil first.", "💧 Consistency is key. Morning watering is best - less evaporation!"],
        sun: ["☀️ Sunlight is pure plant energy! Most veggies need 6-8 hours. Know your sun spots?", "🌞 Full sun, partial shade, or somewhere in between?", "☀️ Watch your garden through the day - shadows move more than you'd think!", "🌤️ Even leafy greens love some sun, though they tolerate shade better than fruiting plants."],
        soil: ["🌱 Healthy soil = happy plants! Ever added compost?", "🪱 Good soil is alive! Got worms? That's a great sign!", "🌱 Sandy or clay-heavy? Each has pros and cons.", "🍂 Mulch is magic for moisture retention!"],
        pest: ["🐛 Pests happen! Holes in leaves, sticky residue, or visible bugs?", "🐜 Let's ID them first. Aphids? Slugs? Something else?", "🐌 Describe what you're seeing and we'll tackle it together!", "🐞 Remember, not all bugs are bad! Ladybugs and bees are garden heroes."],
        harvest: ["🌾 Harvest time is the best reward! When did you plant?", "🧺 Getting close? Look for the signs - color, size, firmness!", "🥕 From garden to plate! What's almost ready?", "🍅 Homegrown flavor is unbeatable!"],
        default: ["🌱 I'm listening! What's on your mind?", "🌿 Tell me more about what's happening in your garden.", "🍃 I'm learning so much! What else?", "🌼 Your garden sounds interesting! Keep going."]
    };
    const options = library[category] || library.default;
    const available = options.filter(r => !recentResponses.has(r));
    const pool = available.length > 0 ? available : options;
    let response = pool[Math.floor(Math.random() * pool.length)];
    recentResponses.add(response);
    if (recentResponses.size > 20) { const first = recentResponses.values().next().value; recentResponses.delete(first); }
    if (Math.random() < 0.3) {
        if (conversationContext.lastPlantMentioned && category !== 'default') response += `\n\nYour ${conversationContext.lastPlantMentioned}s might appreciate attention to this too!`;
        const hoursSinceStart = (Date.now() - conversationContext.sessionStartTime) / (1000 * 60 * 60);
        if (hoursSinceStart > 24 && gardenMemory.plants.length > 0) response += `\n\nWelcome back! Anything new in the garden since we last talked?`;
    }
    response += getMemoryReference();
    if (Math.random() < 0.1) { const seasonalTip = getSeasonalContext(); if (seasonalTip) response += `\n\n🍂 ${seasonalTip}`; }
    return response;
}

async function generateLogicResponse(message) {
    if (wizardState.active) return handleWizardStep(message);
    const lowerMessage = message.toLowerCase();
    const userMood = detectUserMood(message);
    conversationContext.userMood = userMood;
    
    const parsed = parseNaturalTeaching(message);
    if (parsed.success) {
        const ack = getPersonalizedAck(userMood);
        const followUp = getSmartFollowUp();
        conversationContext.lastResponseType = 'teaching';
        return followUp ? `${ack} I've noted that down.\n\n${followUp}` : `${ack} That helps me understand your garden better!`;
    }

    // Try AI response if knowledge system is active and not a command
    if (window.gardenKnowledge && !message.startsWith('/')) {
        try {
            const aiResponse = await handleUserMessage(message);
            if (aiResponse) {
                conversationContext.lastResponseType = 'ai';
                return aiResponse;
            }
        } catch (e) {
            console.warn("AI response failed, using local logic", e);
        }
    }

    const kbResponse = searchKnowledgeBase(lowerMessage);
    if (kbResponse) { conversationContext.lastResponseType = 'knowledge'; conversationContext.consecutiveQuestions = 0; return kbResponse; }
    
    // Handle commands
    if (message.startsWith('/teach ')) { conversationContext.lastResponseType = 'teaching'; const ack = getPersonalizedAck('neutral'); return `${ack}\n\n"${message.substring(7).trim()}"\n\nWhat else should I know?`; }
    if (message.startsWith('/gist add ')) { const content = message.substring(10).trim(); if (content) { if (!gardenMemory.gists) gardenMemory.gists = []; gardenMemory.gists.push({ content, timestamp: Date.now() }); saveMemory(); return `📝 Saved! "${content}"`; } return "Usage: /gist add [your note]"; }
    if (message.startsWith('/wrong')) { const correction = message.substring(6).trim(); if (correction) { conversationContext.lastResponseType = 'correction'; return `✓ Correction noted: "${correction}"\n\nThanks for keeping me accurate!`; } return "Usage: /wrong [what was incorrect]"; }
    if (message.startsWith('/weather')) {
        const city = gardenMemory.settings.location || 'London';
        const apiKey = gardenMemory.settings.apiKey;
        if (!apiKey) return "Set your OpenWeatherMap API Key in Settings (⚙️) to get weather updates!";
        fetch(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric`).then(r => r.json()).then(data => { if (data.cod !== 200) throw new Error(data.message); const weatherMsg = `🌦️ **${data.name} Weather:**\n• ${data.weather[0].description}\n• ${data.main.temp}°C\n• Humidity: ${data.main.humidity}%\n\nGood ${data.main.humidity > 70 ? 'for leafy greens!' : 'weather for most veggies!'}`; addMessage('assistant', weatherMsg); }).catch(e => addMessage('assistant', `⚠️ Weather error: ${e.message}`));
        return "Checking the forecast...";
    }
    if (message === '/why') { conversationContext.lastResponseType = 'command'; return `🤔 **My reasoning:**\n\nI combine what you've taught me about your garden with general best practices. The more you share, the better my advice gets!\n\nYou've taught me ${gardenMemory.teachings.length} things so far.`; }
    if (message === '/help') return `🌱 **Commands:**\n\n/teach - Teach me something\n/gist add - Save a note\n/wrong - Correct me\n/why - Explain reasoning\n/stats - Garden stats\n/export - Export data\n\nOr just chat naturally!`;
    if (message === '/stats') {
        conversationContext.lastResponseType = 'command';
        const teachings = gardenMemory.teachings.length;
        const plants = gardenMemory.plants.length;
        const daysActive = Math.floor((Date.now() - (gardenMemory.teachings[0]?.timestamp || Date.now())) / (1000 * 60 * 60 * 24));
        let plantList = plants > 0 ? '\n\n**Your Garden:**\n' + gardenMemory.plants.map(p => `• ${p.emoji} ${p.name} (${Math.floor((Date.now() - p.plantedDate) / (1000 * 60 * 60 * 24))} days old)`).join('\n') : '';
        let insight = teachings > 10 ? '\n\n💡 **Insight:** You\'re building a great knowledge base!' : plants > teachings ? '\n\n💡 **Tip:** The more you teach me, the better advice I can give!' : daysActive > 30 ? `\n\n💡 **Milestone:** ${daysActive} days gardening together!` : '';
        return `📊 **Garden Stats:**\n• ${teachings} teachings learned\n• ${plants} plants tracked\n• ${daysActive} days active${plantList}${insight}\n\nKeep growing! 🌱`;
    }
    if (message === '/export') {
        if (!authToken && !isProUser) return "⚠️ **Guest Limitation**\n\nExporting requires a free account to protect your data.";
        const dataStr = JSON.stringify(gardenMemory, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
        const link = document.createElement('a'); link.href = dataUri; link.download = `gardenbuddy-${new Date().toISOString().split('T')[0]}.json`; document.body.appendChild(link); link.click(); document.body.removeChild(link);
        return `💾 Exported! Your garden data is safe.`;
    }
    
    const mentionedPlants = detectPlantMentions(message);
    if (mentionedPlants.length > 0) {
        const plant = mentionedPlants[0];
        const plantData = plantDatabase[plant];
        if (plantData && lowerMessage.match(/how|when|should|help|problem|issue/i)) {
            conversationContext.lastPlantMentioned = plant;
            const responses = [`${plantData.emoji} Ah, ${plant}s! They need ${plantData.sun.toLowerCase()} and ${plantData.water.toLowerCase()}. What specific help do you need?`, `${plantData.emoji} ${plant.charAt(0).toUpperCase() + plant.slice(1)}s are great! What's happening with yours?`, `${plantData.emoji} I love ${plant}s! Are you having trouble, or just checking in?`];
            return responses[Math.floor(Math.random() * responses.length)];
        }
    }
    
    conversationContext.lastResponseType = 'advice';
    conversationContext.consecutiveQuestions = 0;
    if (lowerMessage.includes('water')) return getVariedResponse('water');
    if (/sun|shade|light/i.test(lowerMessage)) return getVariedResponse('sun');
    if (/soil|dirt|compost/i.test(lowerMessage)) return getVariedResponse('soil');
    if (/pest|bug|insect|aphid|slug/i.test(lowerMessage)) return getVariedResponse('pest');
    if (/harvest|pick|ripe|ready/i.test(lowerMessage)) return getVariedResponse('harvest');
    
    if (gardenMemory.teachings.length === 0 && gardenMemory.plants.length === 0) return `🌱 Welcome! I'm here to help your garden thrive.\n\nTo give you better advice, I need to picture your garden. Are you growing in **raised beds**, **containers**, or directly in the **ground**?`;
    
    const followUp = getSmartFollowUp();
    return getVariedResponse('default') + (followUp ? `\n\n${followUp}` : '');
}

function searchKnowledgeBase(query) {
    // Try knowledge loader first
    if (knowledgeLoader) {
        const results = knowledgeLoader.searchKnowledge(query, 3);
        if (results.length > 0) {
            const entry = results[0];
            
            // User-taught knowledge takes priority
            if (entry.source === 'user-taught') {
                return `💡 **From Your Garden:** ${entry.topic}\n\nQ: ${entry.question}\nA: ${entry.answer}`;
            }
            
            // Baseline knowledge from the 52-entry database
            if (entry.source === 'baseline' && entry.quick_answer) {
                let response = `📚 **Garden Buddy Knowledge:** ${entry.topic}\n\n${entry.quick_answer}`;
                
                // Add details if available
                if (entry.details && Object.keys(entry.details).length > 0) {
                    response += '\n\n**More Details:**';
                    const detailKeys = Object.keys(entry.details).slice(0, 3); // Limit to 3 details
                    detailKeys.forEach(key => {
                        const value = entry.details[key];
                        if (typeof value === 'string' && value.length < 200) {
                            response += `\n• ${key}: ${value}`;
                        }
                    });
                }
                
                return response;
            }
        }
    }

    // Fallback to legacy knowledge base structure (if exists)
    if (!knowledgeBase || !knowledgeBase.categories) return null;
    const cats = knowledgeBase.categories;
    
    if (query.includes('lawn') || query.includes('grass')) {
        const lawn = cats.lawn_care;
        if (!lawn) return null;
        if (query.includes('mow')) return `🚜 **Mowing Guide:**\nCool Season: ${lawn.mowing_guidelines.cool_season}\nWarm Season: ${lawn.mowing_guidelines.warm_season}`;
        if (query.includes('water')) return `💧 **Watering:** ${lawn.watering_guidelines.general}`;
        return `🌱 **Lawn Care:**\nSpring: ${lawn.seasonal_tasks.spring.join(', ')}\nSummer: ${lawn.seasonal_tasks.summer.join(', ')}`;
    }
    
    if (query.includes('tomato')) {
        const t = cats.plants?.common_vegetables?.tomato;
        if (t && t.care_advice) return `🍅 **Tomato Care:**\n• Water: ${t.care_advice.watering}\n• Feed: ${t.care_advice.fertilizing}\n• Problems: ${t.care_advice.problems}`;
    }
    
    if (query.includes('pest') || query.includes('aphid') || query.includes('slug')) {
        const pests = cats.plants?.plant_health?.pests;
        if (pests) {
            if (query.includes('aphid')) return `🐜 **Aphids:** ${pests.aphids}`;
            if (query.includes('slug')) return `🐌 **Slugs:** ${pests.slugs}`;
            return `🐛 **Pest Control:** Check for specific pests like aphids or slugs.`;
        }
    }
    
    return null;
}

function startDiagnosticWizard() {
    if (!knowledgeBase || !knowledgeBase.diagnostic_questions) {
        addMessage('assistant', "⚠️ Knowledge base is loading... please try again in a few seconds.");
        return;
    }
    const categories = Object.keys(knowledgeBase.diagnostic_questions);
    const buttons = categories.map(cat => `<button class="command-hint" onclick="selectWizardCategory('${cat}')" style="margin:0.25rem; border:1px solid var(--garden-green);">${cat.replace(/_/g, ' ').toUpperCase()}</button>`).join('');
    addMessage('assistant', `🩺 **Diagnostic Wizard**\nI can help identify issues. What type of problem are you seeing?\n\n<div style="display:flex; flex-wrap:wrap; gap:0.5rem; margin-top:0.5rem;">${buttons}</div>`);
}

function selectWizardCategory(category) {
    wizardState = { active: true, category: category, step: 0, answers: [] };
    addMessage('user', `Diagnose ${category.replace(/_/g, ' ')}`);
    const questions = knowledgeBase.diagnostic_questions[category];
    setTimeout(() => {
        addMessage('assistant', `📋 **Question 1/${questions.length}:**\n${questions[0]}`);
    }, 600);
}

function handleWizardStep(userMessage) {
    const questions = knowledgeBase.diagnostic_questions[wizardState.category];
    wizardState.answers.push({ question: questions[wizardState.step], answer: userMessage });
    wizardState.step++;
    
    if (wizardState.step < questions.length) {
        return `📋 **Question ${wizardState.step + 1}/${questions.length}:**\n${questions[wizardState.step]}`;
    } else {
        const category = wizardState.category;
        const answers = wizardState.answers;
        gardenMemory.issues.push({ type: category, date: new Date().toISOString(), details: answers });
        saveMemory();
        wizardState = { active: false, category: null, step: 0, answers: [] };
        return `✅ **Diagnostic Complete**\n\nHere's what I've recorded:\n\n${answers.map(a => `• **Q:** ${a.question}\n  **A:** ${a.answer}`).join('\n\n')}\n\nI've saved this to your garden history. Based on these symptoms, check the **${category.replace(/_/g, ' ')}** section in the Knowledge Base or ask me specifically about potential causes like "pests" or "diseases".`;
    }
}

function showPlantSelector() {
    const chatContainer = document.getElementById('chatContainer');
    const selectorDiv = document.createElement('div');
    selectorDiv.className = 'message assistant';
    selectorDiv.innerHTML = `<div class="message-avatar">🌱</div><div class="message-content"><div class="message-bubble"><div style="margin-bottom: 0.5rem;">Select plants to add to your garden:</div><div class="plant-cards">${Object.entries(plantDatabase).slice(0, 6).map(([name, data]) => `<div class="plant-card" onclick="addPlantToGarden('${name}')"><div class="plant-emoji">${data.emoji}</div><div class="plant-name">${name}</div></div>`).join('')}</div><div style="margin-top: 0.5rem; font-size: 0.85rem; color: var(--text-secondary);">Or type "/teach I planted [plant name]" to add custom plants.</div></div></div>`;
    chatContainer.appendChild(selectorDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

async function addPlantToGarden(plantName) {
    const limit = isProUser ? Infinity : 5;
    if (gardenMemory.plants.length >= limit) {
        showProLimitModal();
        return;
    }
    
    const lookupName = plantName.toLowerCase();
    const data = plantDatabase[lookupName] || { emoji: '🌱', type: 'vegetable' };
    const newPlant = {
        name: plantName,
        emoji: data.emoji,
        type: data.type,
        plantedDate: Date.now(),
        location: 'Unknown',
        notes: ''
    };
    
    gardenMemory.plants.push(newPlant);
    saveMemory();
    
    if (window.supabase && authToken) {
        try {
            if (!currentUserId) {
                const { data: { user } } = await window.supabase.auth.getUser();
                if (user) currentUserId = user.id;
            }
            if (currentUserId) {
                const payload = {
                    name: newPlant.name,
                    type: newPlant.type,
                    planted_at: new Date(newPlant.plantedDate).toISOString(),
                    location: newPlant.location,
                    notes: newPlant.notes,
                    user_id: currentUserId,
                    metadata: { emoji: newPlant.emoji }
                };
                await window.supabase.from('plants').insert([payload]);
            }
        } catch (e) {
            console.error('Supabase plant sync failed', e);
        }
    }
    
    addMessage('assistant', `Added ${plantName} to your garden! Use /teach to specify where it's planted and add more details.`);
}

async function handleUserMessage(userMessage) {
    const apiKey = gardenMemory.settings.anthropicKey;
    if (!apiKey) return null;

    // Generate relevant knowledge context
    const knowledgeContext = window.gardenKnowledge.generateAIContext(userMessage, 5);
    
    // Build comprehensive system prompt
    const systemPrompt = `You are Garden Buddy, a friendly UK gardening expert assistant.

${knowledgeContext}

**Instructions:**
- Answer using the knowledge base when relevant
- ALWAYS prioritize user-taught knowledge over baseline knowledge
- Be conversational, warm, and encouraging
- Use UK spellings and terminology (courgette not zucchini, aubergine not eggplant)
- If the user has taught you specific information about their garden, reference it naturally
- Keep responses concise but helpful (2-4 paragraphs max)
- Use emojis sparingly and naturally
- If you don't have specific information in the knowledge base, use general gardening knowledge but mention the user can teach you specifics

**User's Garden Context:**
${gardenMemory.teachings.slice(-5).map(t => `- ${t.text}`).join('\n') || '- No garden details taught yet'}

**Current Plants:**
${gardenMemory.plants.map(p => `- ${p.emoji} ${p.name} (planted ${Math.floor((Date.now() - p.plantedDate) / (1000 * 60 * 60 * 24))} days ago)`).join('\n') || '- No plants added yet'}`;

    try {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
                "anthropic-dangerous-direct-browser-access": "true"
            },
            body: JSON.stringify({
                model: "claude-3-5-haiku-20241022",
                max_tokens: 1024,
                system: systemPrompt,
                messages: [{ role: "user", content: userMessage }]
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("API Error:", errorData);
            return null;
        }
        
        const data = await response.json();
        return data.content[0].text;
    } catch (e) {
        console.error("AI generation failed:", e);
        return null;
    }
}

async function teachGardenBuddy(topic, question, answer) {
    if (!window.gardenKnowledge) {
        console.warn('Knowledge loader not initialized');
        return;
    }
    
    try {
        await window.gardenKnowledge.saveUserKnowledge({
            userId: currentUserId,
            topic: topic,
            question: question,
            answer: answer,
            category: 'garden_specific'
        });
        
        console.log('✅ Taught Garden Buddy:', topic);
    } catch (e) {
        console.error('Failed to teach Garden Buddy:', e);
    }
}

function searchGardenKnowledge(query) {
    if (!window.gardenKnowledge) return [];
    return window.gardenKnowledge.searchKnowledge(query, 10);
}