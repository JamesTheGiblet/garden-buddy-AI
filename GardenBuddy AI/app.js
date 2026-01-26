// app.js
import { auth, db, realtime } from './supabase-client.js'

// --- API Configuration ---
const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') 
    ? 'http://localhost:3000/api' 
    : 'https://api.gardenbuddy.app';

// Extended garden memory
let gardenMemory = {
    teachings: [],
    corrections: [],
    gists: [],
    gardenLayout: {
        beds: [],
        sunPatterns: [],
        soilType: '',
        lastUpdate: null
    },
    plants: [],
    issues: [],
    harvests: [],
    version: '1.0.0',
    calendar: [],
    settings: { location: 'London', apiKey: '' }
};

// Wizard state
let wizardState = {
    active: false,
    category: null,
    step: 0,
    answers: []
};

// External Knowledge Base
let knowledgeBase = null;

// Plant database
let plantDatabase = {};

// Auth State
let currentUser = null;
let userProfile = null;
let isRegistering = false;

// --- Initialization ---
window.addEventListener('DOMContentLoaded', async () => {
    // Initialize UI Event Listeners
    initEventListeners();
    
    // Load local memory first (for offline/guest support)
    loadMemory();
    
    // Initialize plant database
    initializePlantDatabase();
    loadKnowledgeBase();
    
    // Initialize Voice Input
    initVoiceInput();
    
    // Check Auth Status
    try {
        const user = await auth.getUser();
        if (user) {
            currentUser = user;
            try {
                userProfile = await auth.getProfile(user.id);
            } catch (e) {
                console.warn('Profile not found, using basic user info');
            }
            await updateUIForLoggedInUser();
        } else {
            // Check guest mode
            const guestMode = localStorage.getItem('guestMode');
            if (!guestMode) {
                document.getElementById('auth-screen').style.display = 'flex';
            } else {
                skipAuth();
            }
        }
    } catch (error) {
        console.error('Auth Init error:', error);
        // Fallback to guest if auth fails
        const guestMode = localStorage.getItem('guestMode');
        if (!guestMode) {
            document.getElementById('auth-screen').style.display = 'flex';
        }
    }

    // Service Worker
    if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
        navigator.serviceWorker.register('sw.js').catch(console.error);
    }
});

function initEventListeners() {
    // Auth Buttons
    document.getElementById('authMainBtn').addEventListener('click', handleAuthSubmit);
    document.getElementById('authToggleBtn').addEventListener('click', toggleAuthMode);
    document.getElementById('continueGuestBtn').addEventListener('click', () => {
        localStorage.setItem('guestMode', 'true');
        skipAuth();
    });

    // Chat Inputs
    const userInput = document.getElementById('userInput');
    if (userInput) {
        userInput.addEventListener('keydown', handleKeyPress);
        // Auto-resize
        userInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        });
    }
    
    // Global clicks for modals
    window.onclick = function(event) {
        const modals = ['profileModal', 'settingsModal', 'upgradeModal', 'addPlantModal', 'shareModal'];
        modals.forEach(id => {
            const modal = document.getElementById(id);
            if (event.target === modal) modal.style.display = 'none';
        });
    };
}

// --- Auth Logic ---

function toggleAuthMode() {
    isRegistering = !isRegistering;
    const title = document.getElementById('authTitle');
    const subtitle = document.getElementById('authSubtitle');
    const nameInput = document.getElementById('authName');
    const typeInput = document.getElementById('authUserType');
    const mainBtn = document.getElementById('authMainBtn');
    const toggleBtn = document.getElementById('authToggleBtn');
    const errorDiv = document.getElementById('authError');

    errorDiv.style.display = 'none';

    if (isRegistering) {
        title.innerText = 'Create Account';
        subtitle.innerText = 'Join GardenBuddy today';
        nameInput.style.display = 'block';
        typeInput.style.display = 'block';
        mainBtn.innerText = 'Sign Up';
        toggleBtn.innerText = 'Already have an account? Sign In';
    } else {
        title.innerText = 'Welcome Back';
        subtitle.innerText = 'Sign in to sync your garden';
        nameInput.style.display = 'none';
        typeInput.style.display = 'none';
        mainBtn.innerText = 'Sign In';
        toggleBtn.innerText = 'Create Account';
    }
}

async function handleAuthSubmit(e) {
    e.preventDefault();
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    const errorDiv = document.getElementById('authError');
    
    errorDiv.style.display = 'none';
    errorDiv.textContent = '';

    if (!email || !password) {
        showAuthError('Please fill in all fields');
        return;
    }

    try {
        if (isRegistering) {
            const name = document.getElementById('authName').value;
            const userType = document.getElementById('authUserType').value;
            
            if (!name) { showAuthError('Name is required'); return; }
            if (!userType) { showAuthError('Please select a user type'); return; }

            const response = await auth.signUp(email, password, name, userType);
            currentUser = response.user;
            
            // Wait for trigger to create profile
            await new Promise(resolve => setTimeout(resolve, 1000));
            try {
                userProfile = await auth.getProfile(currentUser.id);
            } catch (err) { console.log('Profile fetch retry failed'); }

        } else {
            const response = await auth.signIn(email, password);
            currentUser = response.user;
            userProfile = await auth.getProfile(currentUser.id);
        }

        document.getElementById('auth-screen').style.display = 'none';
        await updateUIForLoggedInUser();

    } catch (error) {
        console.error('Auth error:', error);
        showAuthError(error.message);
    }
}

function showAuthError(msg) {
    const el = document.getElementById('authError');
    el.textContent = msg;
    el.style.display = 'block';
}

async function updateUIForLoggedInUser() {
    // Update Profile UI
    const displayName = userProfile?.name || currentUser.email;
    document.getElementById('userName').innerText = displayName;
    document.getElementById('clientIdDisplay').innerText = currentUser.id;
    
    // Generate QR
    document.getElementById('pairing-qr').innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=gardenbuddy://connect/${currentUser.id}" alt="Pairing QR">`;

    // Load Data based on role
    if (userProfile?.user_type === 'contractor') {
        // Switch to contractor view (if we had one in this UI)
        // For now, just load jobs
        await loadContractorData();
    } else {
        await loadClientData();
    }
    
    addMessage('assistant', `Welcome back, ${displayName}! I've synced your garden data.`);
}

// Load contractor data
async function loadContractorData() {
    try {
        const jobs = await db.getJobs();
        console.log('Contractor Jobs:', jobs);
        // In a full app, we would render these in a specific tab
    } catch (error) {
        console.error('Error loading contractor data:', error);
    }
}

// Load client data
async function loadClientData() {
    try {
        // Sync Plants
        const plants = await db.getPlants();
        if (plants && plants.length > 0) {
            gardenMemory.plants = plants.map(p => ({
                name: p.name,
                emoji: p.emoji || '🌱',
                type: p.type,
                plantedDate: p.planted_at,
                location: p.location,
                notes: p.notes
            }));
            updateStatsDisplay();
        }

        // Sync Events
        const events = await db.getEvents();
        if (events && events.length > 0) {
            gardenMemory.calendar = events.map(e => ({
                event: e.title,
                date: e.event_date
            }));
            renderCalendar();
        }
        
        // Sync Teachings (Knowledge)
        const teachings = await db.getTeachings();
        if (teachings && teachings.length > 0) {
            gardenMemory.teachings = teachings.map(t => ({
                text: t.content,
                timestamp: t.created_at,
                type: 'teaching'
            }));
        }

    } catch (error) {
        console.error('Error loading client data:', error);
    }
}

// Global Logout
window.handleLogout = async function() {
    if (confirm("Are you sure you want to logout?")) {
        await auth.signOut();
        localStorage.removeItem('guestMode');
        window.location.reload();
    }
};

window.skipAuth = function() {
    document.getElementById('auth-screen').style.display = 'none';
    // Generate random ID for guest
    const guestId = 'guest_' + Math.floor(Math.random() * 10000);
    document.getElementById('clientIdDisplay').innerText = guestId;
    document.getElementById('pairing-qr').innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=gardenbuddy://connect/${guestId}" alt="Pairing QR">`;
    
    // Show welcome tip
    setTimeout(() => {
        if (gardenMemory.teachings.length === 0) {
            addMessage('assistant', `💡 **Pro Tip:** Start by teaching me about your garden layout with /teach!`);
        }
    }, 1000);
};

// --- Existing App Logic (Preserved) ---

// Load from localStorage
function loadMemory() {
    const saved = localStorage.getItem('gardenbuddy_memory');
    if (saved) {
        try {
            gardenMemory = JSON.parse(saved);
            if (!gardenMemory.calendar) gardenMemory.calendar = [];
            if (!gardenMemory.settings) gardenMemory.settings = { location: 'London', apiKey: '' };
            if (!gardenMemory.gists) gardenMemory.gists = [];
            
            updateStatsDisplay();
            renderCalendar();
        } catch (e) {
            console.error('Failed to load memory:', e);
        }
    }
}

// Load Knowledge Base
async function loadKnowledgeBase() {
    try {
        const response = await fetch('https://gist.githubusercontent.com/JamesTheGiblet/a112d7f704ed1a2f1cb6595a51e6f5a8/raw/f308454349355b4567eaf2d4fea73c00af58c848/garden-buddy-ai-json');
        knowledgeBase = await response.json();
    } catch (e) {
        console.error('Failed to load knowledge base:', e);
        // Fallback
        knowledgeBase = { version: "1.0.0-fallback", categories: {} };
    }
}

// Save to localStorage (and Sync if logged in)
function saveMemory() {
    try {
        localStorage.setItem('gardenbuddy_memory', JSON.stringify(gardenMemory));
        updateStatsDisplay();
        // TODO: Trigger background sync to Supabase
    } catch (e) {
        console.error('Failed to save memory:', e);
    }
}

// --- UI Functions ---

window.toggleSettingsModal = function() {
    const modal = document.getElementById('settingsModal');
    modal.style.display = (modal.style.display === 'flex' || modal.style.display === 'block') ? 'none' : 'flex';
    
    if (modal.style.display === 'flex') {
        document.getElementById('settingLocation').value = gardenMemory.settings.location || '';
        document.getElementById('settingApiKey').value = gardenMemory.settings.apiKey || '';
    }
};

window.saveSettings = function() {
    const loc = document.getElementById('settingLocation').value;
    const key = document.getElementById('settingApiKey').value;
    
    gardenMemory.settings.location = loc;
    gardenMemory.settings.apiKey = key;
    saveMemory();
    
    window.toggleSettingsModal();
    addMessage('assistant', `Settings updated! Location set to ${loc}.`);
};

window.clearAllData = function() {
    if (confirm("Are you sure you want to clear all data?")) {
        localStorage.clear();
        location.reload();
    }
};

window.reportBug = function() {
    window.open('https://github.com/JamesTheGiblet/garden-buddy-AI/issues/new', '_blank');
};

// --- Calendar ---
function renderCalendar() {
    const container = document.getElementById('calendarList');
    if (!container) return;
    
    container.innerHTML = '';
    const events = gardenMemory.calendar || [];
    events.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    if (events.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:var(--text-secondary); padding:2rem;">No upcoming events</div>';
        return;
    }

    events.forEach((evt, index) => {
        const div = document.createElement('div');
        div.className = 'plant-card';
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';
        div.innerHTML = `
            <div>
                <div style="font-weight:600; color:var(--garden-green)">${evt.event}</div>
                <div style="font-size:0.85rem; color:var(--text-secondary)">${new Date(evt.date).toDateString()}</div>
            </div>
            <button onclick="deleteCalendarEvent(${index})" style="background:none; border:none; cursor:pointer; font-size:1.2rem;">🗑️</button>
        `;
        container.appendChild(div);
    });
}

window.addCalendarEventUI = async function() {
    const evt = document.getElementById('calEventInput').value;
    const date = document.getElementById('calDateInput').value;
    if (evt && date) {
        // Local save
        gardenMemory.calendar.push({ event: evt, date: date });
        saveMemory();
        renderCalendar();
        document.getElementById('calEventInput').value = '';
        
        // Supabase save
        if (currentUser) {
            try {
                await db.addEvent({ title: evt, event_date: date });
            } catch (e) { console.error('Sync error', e); }
        }
    }
};

window.deleteCalendarEvent = function(index) {
    gardenMemory.calendar.splice(index, 1);
    saveMemory();
    renderCalendar();
};

// --- Profile & Tabs ---
window.toggleProfileModal = function() {
    const modal = document.getElementById('profileModal');
    modal.style.display = (modal.style.display === 'flex' || modal.style.display === 'block') ? 'none' : 'flex';
    if (modal.style.display === 'flex') {
        document.getElementById('currentTime').textContent = new Date().toLocaleString();
    }
};

window.handleProTab = function() {
    // Show the upgrade modal if userProfile exists
    if (userProfile) {
        const modal = document.getElementById('upgradeModal');
        if (modal) modal.style.display = 'flex';
    }
};

window.openTab = function(tabName) {
    const tabs = document.querySelectorAll('.tab-content');
    const buttons = document.querySelectorAll('.tab-button');
    tabs.forEach(tab => tab.classList.remove('active'));
    buttons.forEach(btn => btn.classList.remove('active'));
    
    const tabContent = document.getElementById(tabName);
    if (tabContent) tabContent.classList.add('active');
    
    let activeBtn = document.querySelector(`[onclick="openTab('${tabName}')"]`);
    if (!activeBtn && tabName === 'pro') activeBtn = document.querySelector(`[onclick="handleProTab()"]`);
    if (activeBtn) activeBtn.classList.add('active');
    
    if (tabName === 'plants') initializePlantDatabase();
};

// --- Plant Database ---
async function initializePlantDatabase() {
    if (Object.keys(plantDatabase).length === 0) {
        // Fallback data
        plantDatabase = {
            'tomato': { emoji: '🍅', type: 'vegetable', sun: 'Full sun', water: 'Regular' },
            'basil': { emoji: '🌿', type: 'herb', sun: 'Partial sun', water: 'Moist' },
            'lettuce': { emoji: '🥬', type: 'vegetable', sun: 'Partial sun', water: 'Moist' },
            'carrot': { emoji: '🥕', type: 'vegetable', sun: 'Full sun', water: 'Regular' }
        };
    }
    window.filterPlants();
}

window.filterPlants = function() {
    const container = document.getElementById('plantDatabase');
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
};

function selectPlant(name, data) {
    const message = `/teach I planted ${name} today. ${data.sun}. Water: ${data.water}.`;
    window.openTab('chat');
    setTimeout(() => {
        document.getElementById('userInput').value = message;
        window.sendMessage(message);
    }, 300);
}

window.showPlantSelector = function() {
    const chatContainer = document.getElementById('chatContainer');
    const selectorDiv = document.createElement('div');
    selectorDiv.className = 'message assistant';
    selectorDiv.innerHTML = `
        <div class="message-avatar">🌱</div>
        <div class="message-content">
            <div class="message-bubble">
                <div>Select plants to add:</div>
                <div class="plant-cards">
                    ${Object.entries(plantDatabase).slice(0, 4).map(([name, data]) => `
                        <div class="plant-card" onclick="addPlantToGarden('${name}')">
                            <div class="plant-emoji">${data.emoji}</div>
                            <div class="plant-name">${name}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
    chatContainer.appendChild(selectorDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
};

window.addPlantToGarden = async function(plantName) {
    const data = plantDatabase[plantName];
    if (data) {
        const plantObj = {
            name: plantName,
            emoji: data.emoji,
            type: data.type,
            plantedDate: Date.now(),
            location: 'Unknown',
            notes: ''
        };
        
        // Local
        gardenMemory.plants.push(plantObj);
        saveMemory();
        
        // Supabase
        if (currentUser) {
            try {
                await db.addPlant({
                    name: plantName,
                    emoji: data.emoji,
                    type: data.type,
                    notes: `Added via chat`
                });
            } catch (e) { console.error('Sync error', e); }
        }
        
        addMessage('assistant', `Added ${plantName} to your garden!`);
    }
};

function updateStatsDisplay() {
    const tCount = document.getElementById('teachingsCount');
    const pCount = document.getElementById('plantsCount');
    if(tCount) tCount.textContent = gardenMemory.teachings.length;
    if(pCount) pCount.textContent = gardenMemory.plants.length;
}

// --- Chat & Logic ---
function addMessage(type, content) {
    const chatContainer = document.getElementById('chatContainer');
    if (type === 'user') {
        const welcome = chatContainer.querySelector('.welcome-message');
        if (welcome) welcome.remove();
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.innerHTML = `
        <div class="message-avatar">${type === 'user' ? '👤' : '🌱'}</div>
        <div class="message-content">
            <div class="message-bubble">${content.replace(/\n/g, '<br>')}</div>
        </div>
    `;
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

window.sendMessage = function(predefined = null) {
    const input = document.getElementById('userInput');
    const message = predefined || input.value.trim();
    if (!message) return;
    
    addMessage('user', message);
    if (!predefined) input.value = '';
    
    // Simple response logic
    setTimeout(() => {
        let response = "I'm listening! Tell me more about your garden.";
        
        if (message.startsWith('/teach')) {
            const teaching = message.substring(7);
            gardenMemory.teachings.push({ text: teaching, timestamp: Date.now() });
            saveMemory();
            // Sync
            if(currentUser) db.addTeaching({ content: teaching, domain: 'gardening' });
            response = `✓ Learned: "${teaching}"`;
        } else if (message.includes('hello') || message.includes('hi')) {
            response = "Hello! Ready to help with your garden.";
        }
        
        addMessage('assistant', response);
    }, 600);
};

window.insertCommand = function(cmd) {
    const input = document.getElementById('userInput');
    input.value = cmd;
    input.focus();
};

function handleKeyPress(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        window.sendMessage();
    }
}

// --- Voice & Photo ---
function initVoiceInput() {
    // Basic stub
}
window.toggleVoiceInput = function() { alert("Voice input not available in this demo."); };
window.triggerPhotoUpload = function() { document.getElementById('photoInput').click(); };
window.handlePhotoUpload = function(input) {
    if (input.files && input.files[0]) {
        addMessage('user', `[Photo Uploaded: ${input.files[0].name}]`);
        setTimeout(() => addMessage('assistant', "I see the photo! (Visual analysis coming soon)"), 1000);
    }
};

// --- Custom Plant Modal ---
window.toggleAddPlantModal = function() {
    const modal = document.getElementById('addPlantModal');
    modal.style.display = (modal.style.display === 'flex') ? 'none' : 'flex';
};

window.saveNewPlant = async function() {
    const name = document.getElementById('newPlantName').value;
    if (name) {
        await window.addPlantToGarden(name);
        window.toggleAddPlantModal();
    }
};

// --- Share ---
window.toggleShareModal = function() {
    const modal = document.getElementById('shareModal');
    modal.style.display = (modal.style.display === 'flex') ? 'none' : 'flex';
};
window.copyShareLink = function() {
    navigator.clipboard.writeText(window.location.href);
    alert('Copied!');
};
