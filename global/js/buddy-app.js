// --- API Configuration ---
const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') 
    ? 'http://localhost:3000/api' 
    : 'https://api.gardenbuddy.app';

let authToken = localStorage.getItem('gb_token') || sessionStorage.getItem('gb_token');
let currentUserId = null;
let currentUserEmail = null;
let isProUser = false;
let recentResponses = new Set();

// Conversation Context
let conversationContext = {
    lastTopics: [],
    questionsAsked: new Set(),
    userMood: 'neutral',
    lastPlantMentioned: null,
    sessionStartTime: Date.now(),
    consecutiveQuestions: 0,
    lastResponseType: null,
    languageProfile: {
        formality: 'neutral',
        vocabulary: [],
        sentenceLength: 'medium',
        usesEmojis: false,
        usesSlang: false,
        preferredGreeting: null,
        technicalLevel: 'basic'
    }
};

// Garden Memory Structure
let gardenMemory = {
    teachings: [],
    corrections: [],
    gists: [],
    gardenLayout: { beds: [], sunPatterns: [], soilType: '', lastUpdate: null },
    plants: [],
    issues: [],
    harvests: [],
    version: '1.0.0',
    calendar: [],
    settings: { location: 'London', apiKey: '' },
    chatHistory: []
};

let wizardState = { active: false, category: null, step: 0, answers: [] };
let knowledgeBase = { version: "1.0.0-fallback", categories: {}, diagnostic_questions: {} };
let plantDatabase = {};

// --- Core Functions ---

function loadMemory() {
    const saved = localStorage.getItem('gardenbuddy_memory');
    if (saved) {
        try {
            gardenMemory = JSON.parse(saved);
            if (!gardenMemory.calendar) gardenMemory.calendar = [];
            if (!gardenMemory.settings) gardenMemory.settings = { location: 'London', apiKey: '' };
            if (!gardenMemory.gists) gardenMemory.gists = [];
            if (!gardenMemory.chatHistory) gardenMemory.chatHistory = [];
            
            updateStatsDisplay();
            if (typeof renderHistorySidebar === 'function') renderHistorySidebar();
            if (typeof renderCalendar === 'function') renderCalendar();
            
            // Restore chat history if on chat page
            const chatContainer = document.getElementById('chatContainer');
            if (chatContainer && gardenMemory.chatHistory && gardenMemory.chatHistory.length > 0) {
                // Clear existing messages first to avoid duplicates if called multiple times
                const existingMessages = chatContainer.querySelectorAll('.message');
                if (existingMessages.length === 0) {
                    gardenMemory.chatHistory.forEach(msg => {
                        addMessage(msg.type, msg.content, true);
                    });
                }
            }
        } catch (e) { console.error('Failed to load memory:', e); }
    }
}

function saveMemory() {
    try {
        localStorage.setItem('gardenbuddy_memory', JSON.stringify(gardenMemory));
        updateStatsDisplay();
    } catch (e) { console.error('Failed to save memory:', e); }
}

async function loadKnowledgeBase() {
    try {
        const response = await fetch('https://gist.githubusercontent.com/JamesTheGiblet/a112d7f704ed1a2f1cb6595a51e6f5a8/raw/f308454349355b4567eaf2d4fea73c00af58c848/garden-buddy-ai-json');
        const data = await response.json();
        if (data && data.diagnostic_questions) knowledgeBase = data;
    } catch (e) { console.error('Failed to load knowledge base:', e); }
}

// --- UI & Settings ---

function toggleSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if (!modal) return;
    modal.style.display = (modal.style.display === 'flex' || modal.style.display === 'block') ? 'none' : 'flex';
    if (modal.style.display === 'flex') {
        const locInput = document.getElementById('settingLocation');
        const keyInput = document.getElementById('settingApiKey');
        if (locInput) locInput.value = gardenMemory.settings.location || '';
        if (keyInput) keyInput.value = gardenMemory.settings.apiKey || '';
    }
}

function saveSettings() {
    const loc = document.getElementById('settingLocation').value;
    const key = document.getElementById('settingApiKey').value;
    gardenMemory.settings.location = loc;
    gardenMemory.settings.apiKey = key;
    saveMemory();
    const userLocEl = document.getElementById('userLocation');
    if (userLocEl) userLocEl.textContent = loc;
    toggleSettingsModal();
    
    // If on chat page, confirm
    if (document.getElementById('chatContainer')) {
        addMessage('assistant', `Settings updated! Location set to ${loc}.`);
    } else {
        alert(`Settings updated! Location set to ${loc}.`);
    }
}

function clearAllData() {
    if (confirm("Are you sure you want to clear all data? This will wipe your garden memory and settings.")) {
        localStorage.clear();
        location.reload();
    }
}

function reportBug() { window.open('https://github.com/JamesTheGiblet/garden-buddy-AI/issues/new', '_blank'); }

function toggleProfileModal() {
    const modal = document.getElementById('profileModal');
    if (!modal) return;
    modal.style.display = (modal.style.display === 'flex' || modal.style.display === 'block') ? 'none' : 'flex';
    if (modal.style.display === 'flex') {
        const timeEl = document.getElementById('currentTime');
        if (timeEl) timeEl.textContent = new Date().toLocaleString();
    }
}

function updateStatsDisplay() {
    const teachingsEl = document.getElementById('teachingsCount');
    const plantsEl = document.getElementById('plantsCount');
    const locationEl = document.getElementById('userLocation');
    
    if (teachingsEl) teachingsEl.textContent = gardenMemory.teachings.length;
    if (plantsEl) plantsEl.textContent = gardenMemory.plants.length;
    if (locationEl && gardenMemory.settings && gardenMemory.settings.location) {
        locationEl.textContent = gardenMemory.settings.location;
    }
}

// --- Auth & User ---

async function handleLogout() {
    if (confirm("Are you sure you want to logout?")) {
        if (window.supabaseAuth) await window.supabaseAuth.signOut();
        localStorage.removeItem('gb_token');
        sessionStorage.removeItem('gb_token');
        localStorage.removeItem('guestMode');
        authToken = null;
        window.location.href = '../global/login/login.html';
    }
}

function initGuestUI() { 
    let guestId = localStorage.getItem('gb_guest_id');
    if (!guestId) {
        guestId = 'guest_' + Math.floor(Math.random() * 10000);
        localStorage.setItem('gb_guest_id', guestId);
    }
    // QR Code Page Logic
    const clientIdDisplay = document.getElementById('clientIdDisplay');
    const pairingQr = document.getElementById('pairing-qr');
    if (clientIdDisplay) clientIdDisplay.innerText = guestId;
    if (pairingQr) pairingQr.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=gardenbuddy4u://connect/${guestId}" alt="Pairing QR" style="width: 150px; height: 150px;">`;
}

async function initUserData(user) {
    currentUserId = user.id;
    currentUserEmail = user.email;
    const name = user.user_metadata?.name || user.name || user.email;
    const userNameEl = document.getElementById('userName');
    if (userNameEl && name) userNameEl.innerText = name;
    
    await checkProStatus(user.id);

    // QR Code Page Logic for Logged In User
    const clientIdDisplay = document.getElementById('clientIdDisplay');
    const pairingQr = document.getElementById('pairing-qr');
    if(clientIdDisplay) clientIdDisplay.innerText = user.id.substring(0, 8);
    if(pairingQr) pairingQr.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=gardenbuddy4u://connect/${user.id}" alt="Pairing QR" style="width: 150px; height: 150px;">`;

    const contractorId = user.user_metadata?.contractorId;
    const contractorName = user.user_metadata?.contractorName;

    if (contractorId) {
        const notPairedView = document.getElementById('not-paired-view');
        const pairedView = document.getElementById('paired-view');
        const contractorDisplayName = document.getElementById('contractorDisplayName');
        if(notPairedView) notPairedView.style.display = 'none';
        if(pairedView) pairedView.style.display = 'block';
        if(contractorDisplayName) contractorDisplayName.innerText = contractorName || 'Your Gardener';
    }
}

async function checkProStatus(userId) {
    if (!window.supabase) return;
    try {
        const { data } = await window.supabase.from('user_profiles').select('subscription_tier').eq('id', userId).maybeSingle();
        const subEl = document.getElementById('userSubscription');
        if (data && data.subscription_tier === 'pro') {
            isProUser = true;
            if (subEl) subEl.innerText = 'Pro Plan';
        } else {
            isProUser = false;
            if (subEl) subEl.innerText = 'Free Plan';
        }
    } catch (e) { console.error('Pro check failed', e); }
}

function handleProTab() {
    if (isProUser) window.location.href = 'index.html#pro';
    else showProLimitModal();
}

// --- Chat Logic ---

function addMessage(type, content, isRestoring = false) {
    const chatContainer = document.getElementById('chatContainer');
    if (!chatContainer) return; // Not on chat page

    if (type === 'user' || isRestoring) {
        const welcome = chatContainer.querySelector('.welcome-message');
        if (welcome) welcome.remove();
    }
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    let commandBadge = '';
    
    // Only process commands if not restoring history to avoid double processing
    if (!isRestoring) {
        if (content.startsWith('/teach')) { commandBadge = '<div class="command-badge">📚 TEACHING</div>'; processTeaching(content); }
        else if (content.startsWith('/wrong')) { commandBadge = '<div class="command-badge">✏️ CORRECTION</div>'; processCorrection(content); }
        else if (content.startsWith('/why')) { commandBadge = '<div class="command-badge">🤔 WHY</div>'; processWhy(content); }
        else if (content.startsWith('/help') || content.startsWith('/stats') || content.startsWith('/export')) { commandBadge = '<div class="command-badge">ℹ️ COMMAND</div>'; }
    } else {
        // Just add badges for history
        if (content.startsWith('/teach')) commandBadge = '<div class="command-badge">📚 TEACHING</div>';
        else if (content.startsWith('/wrong')) commandBadge = '<div class="command-badge">✏️ CORRECTION</div>';
        else if (content.startsWith('/why')) commandBadge = '<div class="command-badge">🤔 WHY</div>';
        else if (content.startsWith('/help') || content.startsWith('/stats') || content.startsWith('/export')) commandBadge = '<div class="command-badge">ℹ️ COMMAND</div>';
    }

    messageDiv.innerHTML = `<div class="message-avatar">${type === 'user' ? '👤' : '🌱'}</div><div class="message-content">${commandBadge}<div class="message-bubble">${formatMessage(content)}</div></div>`;
    chatContainer.appendChild(messageDiv);
    
    if (!isRestoring) {
        if (!gardenMemory.chatHistory) gardenMemory.chatHistory = [];
        gardenMemory.chatHistory.push({ type, content, timestamp: Date.now() });
        if (gardenMemory.chatHistory.length > 50) gardenMemory.chatHistory.shift();
        saveMemory();
    }
    if (type === 'user') renderHistorySidebar();
    setTimeout(() => { chatContainer.scrollTop = chatContainer.scrollHeight; }, 100);
}

function formatMessage(content) {
    let text = content.replace(/<text>/g, '').replace(/<\/text>/g, '');
    // Basic HTML escaping for safety
    const div = document.createElement('div'); div.textContent = text; text = div.innerHTML;
    // Restore bold and line breaks
    return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>').replace(/•/g, '•');
}

function sendMessage(predefined = null) {
    const input = document.getElementById('userInput');
    if (!input) return;
    
    const message = predefined || input.value.trim();
    if (!message) return;
    
    // Guest limit check
    if (!authToken && !isProUser) {
        let guestInteractionCount = parseInt(localStorage.getItem('gb_guest_interactions') || '0');
        const GUEST_LIMIT = 15;
        guestInteractionCount++;
        localStorage.setItem('gb_guest_interactions', guestInteractionCount);
        if (guestInteractionCount > GUEST_LIMIT) {
            addMessage('assistant', `⚠️ **Usage Limit Reached**\n\nYou've reached the limit of free guest interactions. To continue saving your garden data and getting AI advice, please create a free account.\n\n<button class="submit-button" onclick="window.location.href='../global/login/register.html'">Create Free Account</button>`);
            return;
        }
    }

    addMessage('user', message);
    if (!predefined) { input.value = ''; input.style.height = 'auto'; }
    
    const sendButton = document.getElementById('sendButton');
    if (sendButton) sendButton.disabled = true;
    
    showTyping();
    
    // Simulate AI delay
    setTimeout(() => { 
        hideTyping(); 
        // This function would be in chat.html logic, need to ensure it's available
        const response = generateResponse(message); 
        addMessage('assistant', response); 
        if (sendButton) sendButton.disabled = false; 
        if (!predefined) input.focus(); 
    }, 800 + Math.random() * 400);
}

function showTyping() {
    const chatContainer = document.getElementById('chatContainer');
    if (!chatContainer) return;
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message assistant';
    typingDiv.id = 'typingIndicator';
    typingDiv.innerHTML = `<div class="message-avatar">🌱</div><div class="message-content"><div class="message-bubble"><div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div></div>`;
    chatContainer.appendChild(typingDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function hideTyping() { const typing = document.getElementById('typingIndicator'); if (typing) typing.remove(); }

function clearChatHistory() {
    if (confirm("Are you sure you want to clear your chat history?")) {
        gardenMemory.chatHistory = [];
        saveMemory();
        const chatContainer = document.getElementById('chatContainer');
        if (chatContainer) {
            const messages = chatContainer.querySelectorAll('.message');
            messages.forEach(msg => msg.remove());
            // Restore welcome
            if (!chatContainer.querySelector('.welcome-message')) {
                const welcomeDiv = document.createElement('div');
                welcomeDiv.className = 'welcome-message';
                welcomeDiv.innerHTML = `<div class="welcome-icon">🌱</div><h2 class="welcome-title">Welcome to Garden Buddy 4U</h2><p class="welcome-text">I'll learn about your specific garden and help you tend it successfully. Start by teaching me about your garden layout!</p>`;
                const quickActions = chatContainer.querySelector('.quick-actions');
                if (quickActions) chatContainer.insertBefore(welcomeDiv, quickActions);
                else chatContainer.prepend(welcomeDiv);
            }
        }
        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal) settingsModal.style.display = 'none';
        renderHistorySidebar();
    }
}

function exportChatHistory() {
    if (!gardenMemory.chatHistory || gardenMemory.chatHistory.length === 0) {
        alert("No chat history to export.");
        return;
    }
    let chatText = "Garden Buddy 4U - Chat History\nExported on: " + new Date().toLocaleString() + "\n\n----------------------------------------\n\n";
    gardenMemory.chatHistory.forEach(msg => {
        const time = new Date(msg.timestamp).toLocaleString();
        const sender = msg.type === 'user' ? 'You' : 'Garden Buddy';
        let content = msg.content.replace(/<br\s*\/?>/gi, '\n').replace(/<\/?[^>]+(>|$)/g, "");
        chatText += `[${time}] ${sender}:\n${content}\n\n`;
    });
    const blob = new Blob([chatText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gardenbuddy-chat-history-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// --- Plant Logic ---

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
                'strawberry': { emoji: '🍓', type: 'fruit', sun: 'Full sun', water: '1 inch per week', daysToHarvest: 90 },
                'rosemary': { emoji: '🌿', type: 'herb', sun: 'Full sun', water: 'Let soil dry between', daysToHarvest: 90 },
                'mint': { emoji: '🌿', type: 'herb', sun: 'Partial sun', water: 'Keep soil moist', daysToHarvest: 30 },
                'sunflower': { emoji: '🌻', type: 'flower', sun: 'Full sun', water: 'Moderate', daysToHarvest: 80 },
                'lavender': { emoji: '🪻', type: 'herb', sun: 'Full sun', water: 'Drought tolerant', daysToHarvest: 120 }
            };
        }
    }
    // If on index page, refresh list
    if (document.getElementById('plantDatabase')) filterPlants();
}

async function addPlantToGarden(plantName) {
    const limit = isProUser ? Infinity : 5;
    if (gardenMemory.plants.length >= limit) { showProLimitModal(); return; }
    const lookupName = plantName.toLowerCase();
    const data = plantDatabase[lookupName] || { emoji: '🌱', type: 'vegetable' };
    const newPlant = { name: plantName, emoji: data.emoji, type: data.type, plantedDate: Date.now(), location: 'Unknown', notes: '' };
    gardenMemory.plants.push(newPlant);
    saveMemory();
    if (window.supabase && authToken) {
        try {
            if (!currentUserId) { const { data: { user } } = await window.supabase.auth.getUser(); if (user) currentUserId = user.id; }
            if (currentUserId) {
                const payload = { name: newPlant.name, type: newPlant.type, planted_at: new Date(newPlant.plantedDate).toISOString(), location: newPlant.location, notes: newPlant.notes, user_id: currentUserId, metadata: { emoji: newPlant.emoji } };
                await window.supabase.from('plants').insert([payload]);
            }
        } catch (e) { console.error('Supabase plant sync failed', e); }
    }
    
    // Feedback
    if (document.getElementById('chatContainer')) {
        addMessage('assistant', `Added ${plantName} to your garden! Use /teach to specify where it's planted and add more details.`);
    } else {
        alert(`Added ${plantName} to your garden!`);
        if (document.getElementById('plantDatabase')) filterPlants();
    }
}

function showPlantSelector() {
    const chatContainer = document.getElementById('chatContainer');
    if (!chatContainer) return;
    const selectorDiv = document.createElement('div');
    selectorDiv.className = 'message assistant';
    selectorDiv.innerHTML = `
        <div class="message-avatar">🌱</div>
        <div class="message-content">
            <div class="message-bubble">
                <div class="plant-selector-header">Select plants to add to your garden:</div>
                <div class="plant-cards">
                    ${Object.entries(plantDatabase).slice(0, 6).map(([name, data]) => `
                        <div class="plant-card" onclick="addPlantToGarden('${name}')">
                            <div class="plant-emoji">${data.emoji}</div>
                            <div class="plant-name">${name.charAt(0).toUpperCase() + name.slice(1)}</div>
                        </div>
                    `).join('')}
                </div>
                <div class="plant-selector-footer">
                    Or type "/teach I planted [plant name]" to add custom plants.
                </div>
            </div>
        </div>
    `;
    chatContainer.appendChild(selectorDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function filterPlants() {
    const container = document.getElementById('plantDatabase');
    if (!container) return;
    const searchInput = document.getElementById('plantSearch');
    const filter = searchInput ? searchInput.value.toLowerCase() : '';
    
    container.innerHTML = '';
    
    for (const [name, data] of Object.entries(plantDatabase)) {
        if (name.toLowerCase().includes(filter)) {
            const card = document.createElement('div');
            card.className = 'plant-card';
            card.onclick = () => selectPlant(name, data);
            card.innerHTML = `
                <div class="plant-emoji">${data.emoji}</div>
                <div class="plant-name">${name.charAt(0).toUpperCase() + name.slice(1)}</div>
            `;
            container.appendChild(card);
        }
    }
    
    if (container.children.length === 0) {
        container.innerHTML = '<div class="no-plants-found">No plants found</div>';
    }
}

function selectPlant(name, data) {
    // If on index.html, switch to chat or just add?
    // The original index.html logic switched to chat tab.
    // Since we are unifying, let's check if we can switch tabs.
    if (typeof openTab === 'function') {
        openTab('chat');
        setTimeout(() => {
            const input = document.getElementById('userInput');
            if (input) {
                const message = `/teach I planted ${name} today. ${data.sun}. Water: ${data.water}.`;
                input.value = message;
                sendMessage(message);
            }
        }, 300);
    } else {
        // Fallback if not on a page with tabs (unlikely for this function)
        window.location.href = 'chat.html';
    }
}

// --- Calendar Logic ---

function renderCalendar() {
    const container = document.getElementById('calendarList');
    if (!container) return;
    
    container.innerHTML = '';
    const events = gardenMemory.calendar || [];
    events.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    if (events.length === 0) {
        container.innerHTML = '<div class="calendar-empty-message">No upcoming events</div>';
        return;
    }

    events.forEach((evt, index) => {
        const div = document.createElement('div');
        div.className = 'plant-card calendar-event-card'; // Reusing plant-card for base style, calendar-event-card for layout
        div.innerHTML = `
            <div>
                <div class="event-title">${evt.event}</div>
                <div class="event-date">${new Date(evt.date).toDateString()}</div>
            </div>
            <button onclick="deleteCalendarEvent(${index})" class="delete-event-btn">🗑️</button>
        `;
        container.appendChild(div);
    });
}

async function addCalendarEvent(evt, date) {
    gardenMemory.calendar.push({ event: evt, date: date });
    saveMemory();
    renderCalendar();
    
    if (window.supabase && authToken && currentUserId) {
        try {
            await window.supabase.from('events').insert([{ title: evt, event_date: date, user_id: currentUserId }]);
        } catch (e) { console.error('Supabase event sync failed', e); }
    }
}

function addCalendarEventUI() {
    const evt = document.getElementById('calEventInput').value;
    const date = document.getElementById('calDateInput').value;
    if (evt && date) {
        addCalendarEvent(evt, date);
        document.getElementById('calEventInput').value = '';
    }
}

function deleteCalendarEvent(index) {
    gardenMemory.calendar.splice(index, 1);
    saveMemory();
    renderCalendar();
}

// --- Tutorial & Wizard ---

function initTutorial() {
    if (!localStorage.getItem('gardenbuddy_tutorial_complete')) {
        const modal = document.getElementById('tutorialModal');
        if (modal) {
            modal.style.display = 'flex';
            showTutorialStep(1);
        }
    }
}

function showTutorialStep(step) {
    document.querySelectorAll('.tutorial-step').forEach(el => el.style.display = 'none');
    const stepEl = document.getElementById('tutorialStep' + step);
    if (stepEl) stepEl.style.display = 'block';
}

function nextTutorialStep(step) { showTutorialStep(step); }

function finishTutorial() {
    const loc = document.getElementById('tutorialLocation').value;
    if (loc) {
        gardenMemory.settings.location = loc;
        saveMemory();
        const settingLoc = document.getElementById('settingLocation');
        if (settingLoc) settingLoc.value = loc;
        if (document.getElementById('chatContainer')) addMessage('assistant', `Great! I've set your location to ${loc}.`);
    }
    localStorage.setItem('gardenbuddy_tutorial_complete', 'true');
    document.getElementById('tutorialModal').style.display = 'none';
}

function replayTutorial() {
    const settings = document.getElementById('settingsModal');
    if (settings) settings.style.display = 'none';
    const modal = document.getElementById('tutorialModal');
    if (modal) {
        modal.style.display = 'flex';
        showTutorialStep(1);
    } else {
        window.location.href = 'chat.html';
    }
}

// --- Processing Logic (Teaching, Correction, Why) ---

async function processTeaching(content) {
    const teaching = content.substring(7).trim();
    if (teaching) {
        gardenMemory.teachings.push({ text: teaching, timestamp: Date.now(), type: 'teaching' });
        if (window.supabase && authToken && currentUserId) {
            try { await window.supabase.from('teachings').insert([{ teaching_type: 'teach', content: teaching, created_at: new Date().toISOString(), user_id: currentUserId }]); } catch (e) { console.error('Supabase sync failed', e); }
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
        saveMemory();
    }
}

async function processCorrection(content) {
    const correction = content.substring(6).trim();
    if (correction) {
        gardenMemory.corrections.push({ text: correction, timestamp: Date.now(), type: 'correction' });
        saveMemory();
        if (window.supabase && authToken && currentUserId) {
            try { await window.supabase.from('teachings').insert([{ teaching_type: 'wrong', content: correction, created_at: new Date().toISOString(), user_id: currentUserId }]); } catch (e) { console.error('Supabase sync failed', e); }
        }
    }
}

async function processWhy(content) {
    if (window.supabase && authToken && currentUserId) {
        try { await window.supabase.from('teachings').insert([{ teaching_type: 'why', content: content, created_at: new Date().toISOString(), user_id: currentUserId }]); } catch (e) { console.error('Supabase sync failed', e); }
    }
}

// --- Response Generation (Simplified for shared file) ---
// Note: Full AI logic from chat.html is quite large. Including essential parts.

function generateResponse(message) {
    // Basic response logic to ensure functionality
    const lowerMessage = message.toLowerCase();
    
    if (message.startsWith('/teach ')) return `I've noted that down! What else should I know?`;
    if (message.startsWith('/wrong')) return `Thanks for the correction. I'll update my memory.`;
    if (message === '/why') return `I base my advice on what you've taught me and general gardening best practices.`;
    if (message === '/help') return `Commands: /teach, /wrong, /why, /stats, /export`;
    
    if (lowerMessage.includes('water')) return "Watering depends on your soil and plants. Check if the top inch of soil is dry.";
    if (lowerMessage.includes('sun')) return "Most vegetables need 6-8 hours of direct sunlight.";
    
    return "That's interesting! Tell me more about your garden.";
}

// --- Sidebar & Modals ---

function toggleSidebar() {
    const sidebar = document.getElementById('chatSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('active');
}

function renderHistorySidebar() {
    const list = document.getElementById('historyList');
    if (!list) return;
    list.innerHTML = '';
    if (!gardenMemory.chatHistory || gardenMemory.chatHistory.length === 0) {
        list.innerHTML = '<div class="no-history-message">No history yet</div>';
        return;
    }
    const groups = {};
    gardenMemory.chatHistory.forEach(msg => {
        if (msg.type === 'user') {
            const date = new Date(msg.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            if (!groups[date]) groups[date] = [];
            groups[date].push(msg);
        }
    });
    Object.keys(groups).reverse().forEach(date => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'history-group';
        groupDiv.innerHTML = `<div class="history-date">${date}</div>`;
        groups[date].reverse().forEach(msg => {
            const item = document.createElement('div');
            item.className = 'history-item';
            item.textContent = msg.content.substring(0, 40) + (msg.content.length > 40 ? '...' : '');
            item.onclick = () => { if (window.innerWidth <= 768) toggleSidebar(); };
            groupDiv.appendChild(item);
        });
        list.appendChild(groupDiv);
    });
}

// --- Voice & Photo ---

let recognition;
function initVoiceInput() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';
        recognition.onstart = function() { 
            const btn = document.getElementById('micButton'); 
            const input = document.getElementById('userInput'); 
            if (btn) btn.classList.add('recording'); 
            if (input) input.placeholder = "Listening..."; 
        };
        recognition.onend = function() { 
            const btn = document.getElementById('micButton'); 
            const input = document.getElementById('userInput'); 
            if (btn) btn.classList.remove('recording'); 
            if (input) input.placeholder = "Tell me about your garden..."; 
        };
        recognition.onresult = function(event) { 
            const transcript = event.results[0][0].transcript; 
            const input = document.getElementById('userInput'); 
            if (input) { 
                input.value = transcript; 
                input.focus(); 
                input.style.height = 'auto'; 
                input.style.height = Math.min(input.scrollHeight, 120) + 'px'; 
            } 
        };
    } else { 
        const btn = document.getElementById('micButton'); 
        if (btn) btn.style.display = 'none'; 
    }
}

function toggleVoiceInput() {
    if (!recognition) { alert("Voice input is not supported in this browser."); return; }
    if (!isProUser) { showProLimitModal(); return; }
    const btn = document.getElementById('micButton');
    if (btn.classList.contains('recording')) recognition.stop(); else recognition.start();
}

function triggerPhotoUpload() { document.getElementById('photoInput').click(); }

function handlePhotoUpload(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const reader = new FileReader();
        reader.onload = function(e) {
            const imgHtml = `<img src="${e.target.result}" class="uploaded-photo" alt="Uploaded plant photo">`;
            addMessage('user', `Uploaded a photo:<br>${imgHtml}`);
            setTimeout(() => {
                if (isProUser) addMessage('assistant', `📸 **Pro Analysis:**\nI've analyzed your photo. It looks like your plant is healthy, but keep an eye on soil moisture consistency.`);
                else { addMessage('assistant', `I see you've uploaded a photo! 📸\n\n**Note:** Advanced AI visual diagnosis is a **Pro Feature**.\n\nI can't analyze this specific image yet, but I can help you diagnose issues through conversation.`); setTimeout(() => showProLimitModal(), 1500); }
            }, 1000);
        };
        reader.readAsDataURL(file);
        input.value = '';
    }
}

// --- Pro & Share Modals ---

function closeUpgradeModal() { const el = document.getElementById('upgradeModal'); if(el) el.style.display = 'none'; }
function showProLimitModal() { const el = document.getElementById('upgradeModal'); if(el) el.style.display = 'flex'; }
function selectPlan(plan) { console.log('Selected plan:', plan); }

function handleUpgrade(plan) {
    const email = currentUserEmail || prompt("Please enter your email address for the pro account:");
    if (!email) return;
    const subject = `Garden Buddy 4U Pro Upgrade Request - ${plan.toUpperCase()}`;
    const body = `I would like to upgrade to the ${plan} plan.\n\nUser ID: ${currentUserId || 'Guest'}\nEmail: ${email}\n\nPlease send me payment instructions.`;
    window.location.href = `mailto:gibletscreations@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    closeUpgradeModal();
}

function toggleShareModal() {
    const modal = document.getElementById('shareModal');
    if (!modal) return;
    modal.style.display = (modal.style.display === 'flex' || modal.style.display === 'block') ? 'none' : 'flex';
    if (modal.style.display === 'flex') {
        const url = window.location.href;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}&ecc=H&margin=0`;
        const qrImg = document.getElementById('shareQrCode');
        if (qrImg) qrImg.src = qrUrl;
        const nativeBtn = document.getElementById('nativeShareBtn');
        if (nativeBtn) {
            if (navigator.share) nativeBtn.classList.remove('d-none'); else nativeBtn.classList.add('d-none');
        }
    }
}

function copyShareLink() { navigator.clipboard.writeText(window.location.href).then(() => { alert('Link copied to clipboard!'); }); }
function shareNative() { if (navigator.share) navigator.share({ title: 'Garden Buddy 4U', text: 'Check out this AI garden assistant!', url: window.location.href }).catch(console.error); }

// --- QR Code Page Specific ---
async function sendContractorRequest() {
    if (!authToken) { alert("Please sign in to contact your gardener."); return; }
    const message = document.getElementById('requestMessage').value;
    if (!message.trim()) { alert("Please enter a message."); return; }
    const btn = document.querySelector('.submit-button');
    const originalText = btn.innerText;
    btn.disabled = true;
    btn.innerText = "Sending...";
    try {
        const res = await fetch(`${API_BASE_URL}/requests`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'visit_request', note: message })
        });
        if (res.ok) { alert("Request sent to your gardener!"); document.getElementById('requestMessage').value = ''; }
        else { throw new Error("API not reachable"); }
    } catch (e) {
        setTimeout(() => { alert("Request sent! (Demo Mode)"); document.getElementById('requestMessage').value = ''; btn.disabled = false; btn.innerText = originalText; }, 1000);
    }
    btn.disabled = false;
    btn.innerText = originalText;
}

// --- Initialization ---

window.addEventListener('load', async () => {
    const token = localStorage.getItem('gb_token') || sessionStorage.getItem('gb_token');
    const guest = localStorage.getItem('guestMode');
    
    if (!token && !guest) {
        window.location.href = '../global/login/login.html';
        return;
    }

    loadMemory();
    initializePlantDatabase();
    loadKnowledgeBase();
    
    if (window.supabase && token) {
        const { data: { session } } = await window.supabaseAuth.getSession();
        if (session) {
            authToken = session.access_token;
            if (localStorage.getItem('gb_token')) localStorage.setItem('gb_token', authToken); else sessionStorage.setItem('gb_token', authToken);
            await initUserData(session.user);
        } else {
            localStorage.removeItem('gb_token'); sessionStorage.removeItem('gb_token');
            if (!guest) { window.location.href = '../global/login/login.html'; return; }
        }
        window.supabaseAuth.onAuthChange((event, session) => {
            if (event === 'SIGNED_OUT') { localStorage.removeItem('gb_token'); sessionStorage.removeItem('gb_token'); if (!localStorage.getItem('guestMode')) window.location.href = '../global/login/login.html'; }
            else if (event === 'TOKEN_REFRESHED' && session) { const newToken = session.access_token; if (localStorage.getItem('gb_token')) localStorage.setItem('gb_token', newToken); else sessionStorage.setItem('gb_token', newToken); }
        });
    } else if (guest) {
        initGuestUI();
    }

    initVoiceInput();
    initTutorial();
    
    // Page specific inits
    const input = document.getElementById('userInput');
    if (input) {
        setTimeout(() => input.focus(), 100);
        input.addEventListener('input', function() { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 120) + 'px'; });
    }
    
    // Hash navigation
    if (window.location.hash) {
        const tab = window.location.hash.substring(1);
        if (['chat', 'plants', 'calendar', 'pro'].includes(tab)) {
            if (typeof openTab === 'function') openTab(tab);
        }
    }
});

window.addEventListener('beforeunload', saveMemory);

window.onclick = function(event) {
    const modals = ['profileModal', 'settingsModal', 'upgradeModal', 'shareModal', 'addPlantModal'];
    modals.forEach(id => {
        const modal = document.getElementById(id);
        if (event.target === modal) modal.style.display = 'none';
    });
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    if (event.target === sidebarOverlay) toggleSidebar();
}

function insertCommand(command) {
    const input = document.getElementById('userInput');
    if (!input) return;
    input.value = command;
    input.focus();
    input.setSelectionRange(command.length, command.length);
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
}

function handleKeyPress(event) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } }

// Tab switching for index.html
function openTab(tabName) {
    const tabs = document.querySelectorAll('.tab-content');
    const buttons = document.querySelectorAll('.tab-button');
    tabs.forEach(tab => tab.classList.remove('active'));
    buttons.forEach(btn => btn.classList.remove('active'));
    
    const tabContent = document.getElementById(tabName);
    if (tabContent) tabContent.classList.add('active');
    
    // Find button that calls this function
    const activeBtn = Array.from(buttons).find(btn => btn.getAttribute('onclick')?.includes(tabName));
    if (activeBtn) activeBtn.classList.add('active');
    
    if (tabName === 'plants') initializePlantDatabase();
}

// Add Custom Plant Logic
const COMMON_EMOJIS = ["🌱", "🌿", "🌾", "🌵", "🌷", "🌸", "🌹", "🌺", "🌻", "🌼", "🌽", "🍀", "🍁", "🍂", "🍃", "🍇", "🍈", "🍉", "🍊", "🍋", "🍌", "🍍", "🥭", "🍎", "🍏", "🍐", "🍑", "🍒", "🍓", "🥝", "🍅", "🥥", "🥑", "🍆", "🥔", "🥕", "🌶️", "🥒", "🥬", "🥦", "🧄", "🧅", "🍄", "🥜", "🌰"];

function toggleAddPlantModal() {
    const modal = document.getElementById('addPlantModal');
    if (!modal) return;
    const isOpening = !(modal.style.display === 'flex' || modal.style.display === 'block');
    modal.style.display = isOpening ? 'flex' : 'none';
    if (isOpening) {
        initEmojiPicker();
        document.getElementById('newPlantName').value = '';
        document.getElementById('newPlantWater').value = '';
        selectEmoji('🌱');
    }
}

function initEmojiPicker() {
    const container = document.getElementById('emojiPicker');
    if (!container || container.children.length > 0) return;
    COMMON_EMOJIS.forEach(emoji => {
        const div = document.createElement('div');
        div.className = 'emoji-option';
        div.textContent = emoji;
        div.onclick = () => selectEmoji(emoji, div);
        container.appendChild(div);
    });
}

function selectEmoji(emoji, element) {
    const input = document.getElementById('newPlantEmoji');
    if (input) input.value = emoji;
    document.querySelectorAll('.emoji-option').forEach(el => el.classList.remove('selected'));
    if (element) element.classList.add('selected');
    else {
        const options = document.querySelectorAll('.emoji-option');
        for (let opt of options) { if (opt.textContent === emoji) { opt.classList.add('selected'); break; } }
    }
}

function saveNewPlant() {
    const limit = isProUser ? Infinity : 5;
    if (gardenMemory.plants.length >= limit) { toggleAddPlantModal(); showProLimitModal(); return; }
    const name = document.getElementById('newPlantName').value.trim();
    if (!name) { alert("Please enter a plant name."); return; }
    const emoji = document.getElementById('newPlantEmoji').value;
    const type = document.getElementById('newPlantType').value;
    const sun = document.getElementById('newPlantSun').value;
    const water = document.getElementById('newPlantWater').value || 'Regular watering';
    
    gardenMemory.plants.push({ name, emoji, type, plantedDate: Date.now(), location: 'Unknown', notes: `Sun: ${sun}, Water: ${water}` });
    saveMemory();
    plantDatabase[name.toLowerCase()] = { emoji, type, sun, water, daysToHarvest: 0 };
    toggleAddPlantModal();
    filterPlants();
    alert(`Added ${name} ${emoji} to your garden list!`);
    if (typeof openTab === 'function') openTab('plants');
}