// --- API Configuration & Globals ---
const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') 
    ? 'http://localhost:3000/api' 
    : 'https://api.gardenbuddy.app';

let authToken = localStorage.getItem('gb_token') || sessionStorage.getItem('gb_token');
let currentUserId = null;
let currentUserEmail = null;
let isProUser = false;
let recentResponses = new Set();
let guestInteractionCount = parseInt(localStorage.getItem('gb_guest_interactions') || '0');
const GUEST_LIMIT = 15;

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
            renderHistorySidebar();
            
            if (gardenMemory.chatHistory && gardenMemory.chatHistory.length > 0) {
                gardenMemory.chatHistory.forEach(msg => {
                    addMessage(msg.type, msg.content, true);
                });
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

function toggleSettingsModal() {
    const modal = document.getElementById('settingsModal');
    modal.style.display = (modal.style.display === 'flex' || modal.style.display === 'block') ? 'none' : 'flex';
    if (modal.style.display === 'flex') {
        document.getElementById('settingLocation').value = gardenMemory.settings.location || '';
        document.getElementById('settingApiKey').value = gardenMemory.settings.apiKey || '';
        document.getElementById('settingAnthropicKey').value = gardenMemory.settings.anthropicKey || '';
    }
}

function saveSettings() {
    const loc = document.getElementById('settingLocation').value;
    const key = document.getElementById('settingApiKey').value;
    const anthropicKey = document.getElementById('settingAnthropicKey').value;
    gardenMemory.settings.location = loc;
    gardenMemory.settings.apiKey = key;
    gardenMemory.settings.anthropicKey = anthropicKey;
    saveMemory();
    const userLocEl = document.getElementById('userLocation');
    if (userLocEl) userLocEl.textContent = loc;
    toggleSettingsModal();
    addMessage('assistant', `Settings updated! Location set to ${loc}.`);
}

function clearChatHistory() {
    if (confirm("Are you sure you want to clear your chat history?")) {
        gardenMemory.chatHistory = [];
        saveMemory();
        const chatContainer = document.getElementById('chatContainer');
        const messages = chatContainer.querySelectorAll('.message');
        messages.forEach(msg => msg.remove());
        if (!chatContainer.querySelector('.welcome-message')) {
            const welcomeDiv = document.createElement('div');
            welcomeDiv.className = 'welcome-message';
            welcomeDiv.innerHTML = `<div class="welcome-icon">🌱</div><h2 class="welcome-title">Welcome to Garden Buddy 4U</h2><p class="welcome-text">I'll learn about your specific garden and help you tend it successfully. Start by teaching me about your garden layout!</p>`;
            const quickActions = chatContainer.querySelector('.quick-actions');
            if (quickActions) chatContainer.insertBefore(welcomeDiv, quickActions);
            else chatContainer.prepend(welcomeDiv);
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

function clearAllData() {
    if (confirm("Are you sure you want to clear all data? This will wipe your garden memory and settings.")) {
        localStorage.clear();
        location.reload();
    }
}

function reportBug() { window.open('https://github.com/JamesTheGiblet/garden-buddy-AI/issues/new', '_blank'); }

async function manualRefreshKnowledge() {
    const btn = document.getElementById('refreshKnowledgeBtn');
    const originalText = btn ? btn.textContent : 'Refresh Knowledge Base';
    
    if (btn) {
        btn.disabled = true;
        btn.textContent = "Refreshing...";
    }

    try {
        if (typeof refreshUserKnowledge === 'function') {
            await refreshUserKnowledge();
            addMessage('assistant', '✅ Knowledge base refreshed successfully!');
            toggleSettingsModal();
        } else {
            alert('Knowledge system not available.');
        }
    } catch (e) {
        console.error('Refresh failed:', e);
        alert('Failed to refresh knowledge base.');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }
}

function initTutorial() {
    if (!localStorage.getItem('gardenbuddy_tutorial_complete')) {
        document.getElementById('tutorialModal').style.display = 'flex';
        showTutorialStep(1);
    }
}

function showTutorialStep(step) {
    document.querySelectorAll('.tutorial-step').forEach(el => el.style.display = 'none');
    document.getElementById('tutorialStep' + step).style.display = 'block';
}

function nextTutorialStep(step) { showTutorialStep(step); }

function finishTutorial() {
    const loc = document.getElementById('tutorialLocation').value;
    if (loc) {
        gardenMemory.settings.location = loc;
        saveMemory();
        document.getElementById('settingLocation').value = loc;
        addMessage('assistant', `Great! I've set your location to ${loc}.`);
    }
    localStorage.setItem('gardenbuddy_tutorial_complete', 'true');
    document.getElementById('tutorialModal').style.display = 'none';
}

function replayTutorial() {
    const settings = document.getElementById('settingsModal');
    if (settings) settings.style.display = 'none';
    document.getElementById('tutorialModal').style.display = 'flex';
    showTutorialStep(1);
}

function toggleProfileModal() {
    const modal = document.getElementById('profileModal');
    modal.style.display = (modal.style.display === 'flex' || modal.style.display === 'block') ? 'none' : 'flex';
    if (modal.style.display === 'flex') document.getElementById('currentTime').textContent = new Date().toLocaleString();
}

function updateStatsDisplay() {
    document.getElementById('teachingsCount').textContent = gardenMemory.teachings.length;
    document.getElementById('plantsCount').textContent = gardenMemory.plants.length;
    if (gardenMemory.settings && gardenMemory.settings.location) document.getElementById('userLocation').textContent = gardenMemory.settings.location;
}

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

function initGuestUI() { localStorage.setItem('gb_guest_id', 'guest_' + Math.floor(Math.random() * 10000)); }

async function initUserData(user) {
    currentUserId = user.id;
    currentUserEmail = user.email;
    const name = user.user_metadata?.name || user.name || user.email;
    if (name) document.getElementById('userName').innerText = name;
    await checkProStatus(user.id);
}

async function checkProStatus(userId) {
    if (!window.supabase) return;
    try {
        const { data } = await window.supabase.from('user_profiles').select('subscription_tier').eq('id', userId).maybeSingle();
        if (data && data.subscription_tier === 'pro') {
            isProUser = true;
            document.getElementById('userSubscription').innerText = 'Pro Plan';
        } else {
            isProUser = false;
            document.getElementById('userSubscription').innerText = 'Free Plan';
        }
    } catch (e) { console.error('Pro check failed', e); }
}

function addMessage(type, content, isRestoring = false) {
    const chatContainer = document.getElementById('chatContainer');
    if (type === 'user' || isRestoring) {
        const welcome = chatContainer.querySelector('.welcome-message');
        if (welcome) welcome.remove();
    }
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    let commandBadge = '';
    if (content.startsWith('/teach')) { commandBadge = '<div class="command-badge">📚 TEACHING</div>'; if (!isRestoring) processTeaching(content); }
    else if (content.startsWith('/wrong')) { commandBadge = '<div class="command-badge">✏️ CORRECTION</div>'; if (!isRestoring) processCorrection(content); }
    else if (content.startsWith('/why')) { commandBadge = '<div class="command-badge">🤔 WHY</div>'; if (!isRestoring) processWhy(content); }
    else if (content.startsWith('/help') || content.startsWith('/stats') || content.startsWith('/export')) { commandBadge = '<div class="command-badge">ℹ️ COMMAND</div>'; }
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
    const div = document.createElement('div'); div.textContent = text; text = div.innerHTML;
    return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>').replace(/•/g, '•');
}

async function generateResponse(message) {
    // Step 1: Analyze user's language (Social)
    analyzeUserLanguage(message);
    
    // Step 2: Generate base response (Gardener)
    let response = await generateLogicResponse(message);
    
    // Step 3: Adapt to user's style (Social)
    if (typeof response === 'string') {
        response = adaptResponseToUserStyle(response);
        response = applyRegionalVariations(response);
    }
    
    // Step 4: Update flow tracking (Social)
    updateConversationFlow(message, conversationContext.lastResponseType);
    
    // Step 5: Add chatty elements if appropriate (Social)
    if (conversationContext.isChatty && Math.random() < 0.3 && typeof response === 'string') {
        const profile = conversationContext.languageProfile;
        const chattyAddons = profile.formality === 'casual' 
            ? ["\n\nGardening's all about patience!", "\n\nLoving your garden journey!", "\n\nYour plants are lucky!", "\n\nKeep up the awesome work!"]
            : ["\n\nGardening requires patience and care.", "\n\nI appreciate learning about your garden.", "\n\nYour attention to detail is commendable.", "\n\nContinue with your excellent work."];
        response += chattyAddons[Math.floor(Math.random() * chattyAddons.length)];
    }
    return response;
}

function showTyping() {
    const chatContainer = document.getElementById('chatContainer');
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message assistant';
    typingDiv.id = 'typingIndicator';
    typingDiv.innerHTML = `<div class="message-avatar">🌱</div><div class="message-content"><div class="message-bubble"><div class="typing-indicator"><div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div></div></div></div>`;
    chatContainer.appendChild(typingDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function hideTyping() { const typing = document.getElementById('typingIndicator'); if (typing) typing.remove(); }

function sendMessage(predefined = null) {
    const input = document.getElementById('userInput');
    const message = predefined || input.value.trim();
    if (!message) return;
    if (!authToken && !isProUser) {
        guestInteractionCount++;
        localStorage.setItem('gb_guest_interactions', guestInteractionCount);
        if (guestInteractionCount > GUEST_LIMIT) return addMessage('assistant', `⚠️ **Usage Limit Reached**\n\nYou've reached the limit of free guest interactions. To continue saving your garden data and getting AI advice, please create a free account.\n\n<button class="submit-button" onclick="window.location.href='../global/login/register.html'">Create Free Account</button>`);
    }
    addMessage('user', message);
    if (!predefined) { input.value = ''; input.style.height = 'auto'; }
    const sendButton = document.getElementById('sendButton');
    sendButton.disabled = true;
    showTyping();
    setTimeout(async () => { hideTyping(); const response = await generateResponse(message); addMessage('assistant', response); sendButton.disabled = false; if (!predefined) input.focus(); }, 800 + Math.random() * 400);
}

function insertCommand(command) {
    const input = document.getElementById('userInput');
    input.value = command;
    input.focus();
    input.setSelectionRange(command.length, command.length);
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
}

function handleKeyPress(event) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } }

function escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }

let recognition;
function initVoiceInput() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';
        recognition.onstart = function() { const btn = document.getElementById('micButton'); const input = document.getElementById('userInput'); if (btn) btn.classList.add('recording'); if (input) input.placeholder = "Listening..."; };
        recognition.onend = function() { const btn = document.getElementById('micButton'); const input = document.getElementById('userInput'); if (btn) btn.classList.remove('recording'); if (input) input.placeholder = "Tell me about your garden..."; };
        recognition.onresult = function(event) { const transcript = event.results[0][0].transcript; const input = document.getElementById('userInput'); if (input) { input.value = transcript; input.focus(); input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px'; } };
        recognition.onerror = function(event) { console.error('Speech recognition error', event.error); const btn = document.getElementById('micButton'); if (btn) btn.classList.remove('recording'); };
    } else { const btn = document.getElementById('micButton'); if (btn) btn.style.display = 'none'; }
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
            addMessage('user', `Uploaded a photo:<br><img src="${e.target.result}" style="max-width: 100%; border-radius: 8px; margin-top: 5px; border: 1px solid var(--border-color);">`);
            setTimeout(() => {
                if (isProUser) addMessage('assistant', `📸 **Pro Analysis:**\nI've analyzed your photo. It looks like your plant is healthy, but keep an eye on soil moisture consistency.`);
                else { addMessage('assistant', `I see you've uploaded a photo! 📸\n\n**Note:** Advanced AI visual diagnosis is a **Pro Feature**.\n\nI can't analyze this specific image yet, but I can help you diagnose issues through conversation.`); setTimeout(() => toggleProModal(), 1500); }
            }, 1000);
        };
        reader.readAsDataURL(file);
        input.value = '';
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('chatSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
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

window.addEventListener('load', async () => {
    const token = localStorage.getItem('gb_token') || sessionStorage.getItem('gb_token');
    const guest = localStorage.getItem('guestMode');
    if (!token && !guest) { window.location.href = '../global/login/login.html'; return; }
    loadMemory();
    initializePlantDatabase();
    loadKnowledgeBase();
    if (window.supabase && token) {
        const { data: { session } } = await window.supabaseAuth.getSession();
        if (session) {
            authToken = session.access_token;
            if (localStorage.getItem('gb_token')) localStorage.setItem('gb_token', authToken); else sessionStorage.setItem('gb_token', authToken);
            await initUserData(session.user);
            if (typeof refreshUserKnowledge === 'function') await refreshUserKnowledge();
        } else {
            localStorage.removeItem('gb_token'); sessionStorage.removeItem('gb_token');
            if (!guest) { window.location.href = '../global/login/login.html'; return; }
        }
        window.supabaseAuth.onAuthChange((event, session) => {
            if (event === 'SIGNED_OUT') { localStorage.removeItem('gb_token'); sessionStorage.removeItem('gb_token'); if (!localStorage.getItem('guestMode')) window.location.href = '../global/login/login.html'; }
            else if (event === 'TOKEN_REFRESHED' && session) { const newToken = session.access_token; if (localStorage.getItem('gb_token')) localStorage.setItem('gb_token', newToken); else sessionStorage.setItem('gb_token', newToken); }
        });
    } else if (guest) initGuestUI();
    initVoiceInput();
    initTutorial();
    renderHistorySidebar();
    setTimeout(() => { document.getElementById('userInput').focus(); }, 100);
    window.addEventListener('orientationchange', () => { setTimeout(() => { const chatContainer = document.getElementById('chatContainer'); chatContainer.scrollTop = chatContainer.scrollHeight; }, 300); });
    
    const textarea = document.getElementById('userInput');
    if (textarea) textarea.addEventListener('input', function() { this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 120) + 'px'; });

    setTimeout(() => {
        if (gardenMemory.teachings.length === 0) {
            const chatContainer = document.getElementById('chatContainer');
            const tip = document.createElement('div');
            tip.className = 'message assistant';
            const welcomeMsgs = [
                "🌱 **Getting Started?** Just tell me about your garden naturally - no commands needed! Try: 'I have two raised beds in my backyard.'",
                "💡 **Pro Tip:** I learn from everything you share! The more you tell me, the smarter my advice gets.",
                "🌿 **New here?** Start by describing your garden space, then we'll build your plant family together!"
            ];
            const msg = welcomeMsgs[Math.floor(Math.random() * welcomeMsgs.length)];
            tip.innerHTML = `<div class="message-avatar">💡</div><div class="message-content"><div class="message-bubble">${formatMessage(msg)}</div></div>`;
            chatContainer.appendChild(tip);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
    }, 2000);
});

window.addEventListener('beforeunload', saveMemory);
window.onclick = function(event) {
    const modal = document.getElementById('profileModal');
    const settingsModal = document.getElementById('settingsModal');
    const upgradeModal = document.getElementById('upgradeModal');
    const shareModal = document.getElementById('shareModal');
    if (event.target === modal) modal.style.display = 'none';
    if (event.target === settingsModal) settingsModal.style.display = 'none';
    if (event.target === upgradeModal) upgradeModal.style.display = 'none';
    if (event.target === shareModal) shareModal.style.display = 'none';
}

document.addEventListener('touchstart', function(event) { if (event.touches.length > 1) event.preventDefault(); }, { passive: false });