// GardenManager AI - Main Application Logic

// Check for configuration before initializing
if (typeof SUPABASE_URL === 'undefined' || typeof SUPABASE_ANON_KEY === 'undefined') {
    console.error('CRITICAL: Supabase configuration missing. Ensure config.js is loaded before manager-app.js');
}

// Initialize Supabase Client
// Handle case where supabase-client.js has already initialized window.supabase
let supabaseClient;
if (window.supabase && typeof window.supabase.createClient === 'function') {
    // Raw library loaded, create client manually
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
    // Client already initialized (by supabase-client.js)
    supabaseClient = window.supabase;
}

let currentUser = null;
let map = null;
let allItems = [];
let dailyJobs = [];
let equipment = [];
let currentStream = null;
let currentJobIdForPhoto = null;
let html5QrcodeScanner = null;
let allPlants = [];

// --- Chat / AI State ---
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
    settings: { location: 'London', apiKey: '' },
    chatHistory: []
};

let wizardState = {
    active: false,
    category: null,
    step: 0,
    answers: []
};

let knowledgeBase = { version: "1.0.0-fallback", categories: {}, diagnostic_questions: {} };
let plantDatabase = {}; // For AI lookup
let isProUser = false;

// Plant Care Database
const plantCareDatabase = {
    january: {
        prune: ['Wisteria', 'Apple Trees', 'Pear Trees', 'Roses'],
        plant: ['Bare-root hedging', 'Garlic', 'Shallots'],
        avoid: ['Tender plants', 'Newly planted trees in frost'],
        tips: [
            { plant: 'Wisteria', tip: 'Cut back side shoots to 2-3 buds from main branch' },
            { plant: 'Apple', tip: 'Remove crossing branches and create open center' },
            { plant: 'Rose', tip: 'Prune hybrid teas to 6 inches, remove dead wood' }
        ]
    },
    february: {
        prune: ['Roses', 'Clematis Group 3', 'Summer-flowering shrubs'],
        plant: ['Sweet peas', 'Broad beans', 'Onion sets'],
        avoid: ['Frost-tender bedding'],
        tips: [
            { plant: 'Clematis', tip: 'Hard prune Group 3 to 12 inches from ground' },
            { plant: 'Hydrangea', tip: 'Remove dead flower heads, cut to first buds' }
        ]
    },
    march: {
        prune: ['Evergreen hedges', 'Grasses'],
        plant: ['Hardy annuals', 'Summer bulbs', 'Vegetable seeds'],
        avoid: ['Planting in waterlogged soil'],
        tips: [
            { plant: 'Lawn', tip: 'First cut of season - set mower high' },
            { plant: 'Box', tip: 'Trim hedges before new growth starts' }
        ]
    }
};

const COMMON_EMOJIS = ["🌱", "🌿", "🌾", "🌵", "🌷", "🌸", "🌹", "🌺", "🌻", "🌼", "🌽", "🍀", "🍁", "🍂", "🍃", "🍇", "🍈", "🍉", "🍊", "🍋", "🍌", "🍍", "🥭", "🍎", "🍏", "🍐", "🍑", "🍒", "🍓", "🥝", "🍅", "🥥", "🥑", "🍆", "🥔", "🥕", "🌶️", "🥒", "🥬", "🥦", "🧄", "🧅", "🍄", "🥜", "🌰"];

// --- Initialization ---

window.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.href = '../global/login/login_contractor.html';
        return;
    }
    currentUser = session.user;

    // Router based on element existence
    if (document.getElementById('weatherIcon')) initDashboard();
    else if (document.getElementById('chatContainer')) initChatInterface();
    else if (document.getElementById('stopsList')) initRoutePlanner();
    else if (document.getElementById('plantGrid')) initPlantLibrary();
    else if (document.getElementById('totalRevenue')) initFinances();
    else if (document.getElementById('settingLocation')) initSettings();
    else if (document.getElementById('reader')) initScanner();
    else if (document.getElementById('jobForm')) initNewJob();
    else if (document.getElementById('newPlantName')) initAddPlant();
});

// --- Page Initializers ---

function initDashboard() {
    updateDateDisplay();
    loadWeather();
    initMap('map', 11);
    loadEquipment();
    loadDashboardData();
    updatePlantTips();
}

async function initChatInterface() {
    loadMemory();
    initializePlantDatabase();
    loadKnowledgeBase();
    initVoiceInput();
    initTutorial();
    
    // Check Pro Status
    if (currentUser) {
        await checkProStatus(currentUser.id);
        const name = currentUser.user_metadata?.name || currentUser.email;
        if (document.getElementById('userName')) document.getElementById('userName').innerText = name;
    }

    // Focus input
    setTimeout(() => {
        const input = document.getElementById('userInput');
        if(input) input.focus();
    }, 100);

    // Note: window.onclick for modals is handled in Global Helpers section
}

function initRoutePlanner() {
    initMap('map', 12);
    loadTodaysJobsForRoute();
}

function initPlantLibrary() {
    loadAllPlants();
}

function initFinances() {
    loadFinances();
}

function initSettings() {
    document.getElementById('displayName').textContent = currentUser.user_metadata?.business_name || 'Contractor';
    document.getElementById('displayEmail').textContent = currentUser.email;
    loadSettings();
}

function initScanner() {
    startScanner();
}

function initNewJob() {
    loadClientsForJob();
    document.getElementById('dateInput').valueAsDate = new Date();
}

function initAddPlant() {
    initEmojiPicker();
    loadConnectedClients();
}

// --- Dashboard Logic ---

function updateDateDisplay() {
    const now = new Date();
    const el = document.getElementById('dateDisplay');
    if(el) el.textContent = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
}

async function loadWeather() {
    try {
        const mem = JSON.parse(localStorage.getItem('gardenmanager_memory') || '{}');
        if (mem.settings && mem.settings.apiKey) {
            const { apiKey, location } = mem.settings;
            const city = location || 'London';
            const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric`);
            const data = await res.json();
            
            if (data.main) {
                document.getElementById('weatherTemp').textContent = `${Math.round(data.main.temp)}°C`;
                document.getElementById('weatherDesc').textContent = data.weather[0].description;
                const main = data.weather[0].main.toLowerCase();
                const icon = main.includes('rain') ? '🌧️' : main.includes('cloud') ? '☁️' : main.includes('clear') ? '☀️' : '⛅';
                document.getElementById('weatherIcon').textContent = icon;
                checkWeatherAutomation(data.weather[0].main);
            }
        } else {
            document.getElementById('weatherDesc').textContent = "No API Key (Check Settings)";
        }
    } catch (e) { console.error("Weather load error", e); }
}

function checkWeatherAutomation(condition) {
    const alertsDiv = document.getElementById('weatherAlerts');
    if (condition.includes("Rain") || condition.includes("Drizzle")) {
        alertsDiv.innerHTML = `<div class="weather-alert"><strong>⚠️ Rain Detected</strong><br><small>Consider rescheduling outdoor jobs</small><button class="tool-btn" type="button" onclick="sendRainTexts()" style="width: 100%; margin-top: 0.5rem; border-color: #f44336; color: #f44336;">📲 Text All Clients to Reschedule</button></div>`;
    } else {
        alertsDiv.innerHTML = `<div style="background: #e8f5e9; border-left: 4px solid #43A047; padding: 0.75rem; border-radius: 6px; font-size: 0.85rem;">✅ Good conditions for outdoor work</div>`;
    }
}

async function loadEquipment() {
    try {
        const { data, error } = await supabaseClient.from('equipment').select('*').eq('user_id', currentUser.id);
        if (!error && data) {
            equipment = data;
            checkEquipmentAlerts();
        }
    } catch (err) { console.error('Equipment load error:', err); }
}

function checkEquipmentAlerts() {
    const alertsDiv = document.getElementById('equipmentAlerts');
    const alerts = equipment.filter(e => e.hours_used >= (e.last_service_hours + e.service_interval));
    if (alerts.length > 0) {
        alertsDiv.innerHTML = alerts.map(e => `<div class="equipment-alert"><strong>⚠️ ${e.name}</strong><br><small>Service due - ${e.hours_used - (e.last_service_hours + e.service_interval)} hours overdue</small></div>`).join('');
    } else {
        alertsDiv.innerHTML = '<p style="color: #666; font-size: 0.85rem;">✅ All equipment operational</p>';
    }
}

async function loadDashboardData() {
    try {
        const [eventsRes, jobsRes] = await Promise.all([
            supabaseClient.from('events').select('*').eq('user_id', currentUser.id),
            supabaseClient.from('jobs').select('*, pairings(client_name, address, phone, email, latitude, longitude)').eq('contractor_id', currentUser.id).order('scheduled_date', { ascending: true })
        ]);

        const tasks = (eventsRes.data || []).map(e => ({ ...e, type: 'task', date: e.event_date, title: e.title }));
        const jobsArr = (jobsRes.data || []).map(j => ({
            ...j, type: 'job', title: j.service, date: j.scheduled_date,
            client: j.pairings?.client_name || 'Direct Client',
            address: j.pairings?.address || 'No Address',
            phone: j.pairings?.phone || '',
            email: j.pairings?.email || '',
            latitude: j.pairings?.latitude || null,
            longitude: j.pairings?.longitude || null,
            priority: j.urgent ? 'high' : 'medium',
            price: j.price || 0
        }));

        dailyJobs = jobsArr;
        allItems = [...tasks, ...jobsArr].sort((a, b) => new Date(a.date) - new Date(b.date));
        
        switchView('feed');
        updateStats(jobsArr);
        plotJobLocations(jobsArr);
    } catch (err) { console.error('Load data error:', err); }
}

function switchView(view) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.toLowerCase() === view) btn.classList.add('active');
    });
    let filtered = view === 'completed' ? allItems.filter(i => i.status === 'completed') : allItems.filter(i => i.status !== 'completed');
    renderFeed(filtered);
}

function renderFeed(items) {
    const container = document.getElementById('calendarList');
    container.innerHTML = items.length ? '' : '<p style="text-align: center; color: #888; margin-top: 2rem;">No tasks scheduled.</p>';
    items.forEach(item => {
        const dateObj = new Date(item.date);
        const card = document.createElement('div');
        card.className = `job-card ${item.priority || 'medium'}`;
        const plantTips = getPlantTipsForJob(item);
        card.innerHTML = `
            <div class="card-header">
                <div class="card-meta">
                    <span class="tag tag-${item.type}">${item.type}</span>
                    <span>📅 ${dateObj.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                    ${item.price ? `<span style="color: var(--garden-primary); font-weight: bold;">£${item.price}</span>` : ''}
                </div>
            </div>
            <div class="card-body">
                <h4>${item.title}</h4>
                ${item.client ? `<p style="font-size: 0.9rem; color: #555; margin: 0.25rem 0;"><strong>${item.client}</strong></p>` : ''}
                ${item.address ? `<p style="font-size: 0.85rem; color: #777; margin: 0;">📍 ${item.address}</p>` : ''}
                ${plantTips ? `<div class="plant-tip-card"><strong>🌿 Plant Tip:</strong> ${plantTips}</div>` : ''}
            </div>
            <div class="btn-group">
                ${item.phone ? `<button class="tool-btn" type="button" onclick="window.open('tel:${item.phone}')">📞 Call</button>` : ''}
                ${item.address ? `<button class="tool-btn" type="button" onclick="navigateTo('${item.address}')">🧭 Navigate</button>` : ''}
                <button class="tool-btn" type="button" onclick="openPlantLibrary('${item.title}')">🌿 Plant Guide</button>
                <button class="tool-btn" type="button" onclick="openCameraModal('${item.id}')">📸 Photos</button>
                ${item.status !== 'completed' ? `<button class="tool-btn primary" type="button" onclick="completeJob('${item.id}')">✅ Finish & Invoice</button>` : ''}
            </div>
        `;
        container.appendChild(card);
    });
}

function updateStats(jobs) {
    const activeJobs = jobs.filter(j => j.status !== 'completed');
    const revenue = activeJobs.reduce((sum, j) => sum + (j.price || 0), 0);
    document.getElementById('statRevenue').textContent = `£${revenue}`;
}

async function addEvent() {
    const title = document.getElementById('calEventInput').value;
    const date = document.getElementById('calDateInput').value;
    const priority = document.getElementById('calPriorityInput').value;
    if (!title || !date) { alert('Please fill in title and date'); return; }
    const { error } = await supabaseClient.from('events').insert([{ title, event_date: date, priority, user_id: currentUser.id, status: 'pending' }]);
    if (error) { alert('Error adding task'); console.error(error); return; }
    loadDashboardData();
    document.getElementById('calEventInput').value = '';
    document.getElementById('calDateInput').value = '';
}

// --- Map & Routing ---

function initMap(elementId, zoom) {
    if (document.getElementById(elementId)) {
        // Prevent "Map container is already initialized" error
        if (map) {
            map.remove();
            map = null;
        }
        map = L.map(elementId, { zoomControl: false }).setView([51.505, -0.09], zoom);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap contributors' }).addTo(map);
        map.locate({setView: true, maxZoom: 13});
        map.on('locationfound', (e) => {
            L.circle(e.latlng, { radius: e.accuracy/2, color: '#2E7D32' }).addTo(map);
            if(elementId === 'map' && window.location.pathname.includes('routes')) L.marker(e.latlng).addTo(map).bindPopup("You are here");
        });
    }
}

function plotJobLocations(jobs) {
    if (!map) return;
    jobs.forEach(job => {
        if (job.latitude && job.longitude) {
            L.marker([job.latitude, job.longitude]).bindPopup(`<strong>${job.client}</strong><br>${job.title}<br>£${job.price}`).addTo(map);
        }
    });
}

async function loadTodaysJobsForRoute() {
    const { data: jobs, error } = await supabaseClient.from('jobs').select('*, pairings(client_name, address, latitude, longitude)').eq('contractor_id', currentUser.id).neq('status', 'completed').order('scheduled_time', { ascending: true });
    if (error) { console.error(error); return; }
    dailyJobs = jobs.filter(j => j.pairings && j.pairings.latitude && j.pairings.longitude);
    renderStops(dailyJobs);
    plotRouteMarkers(dailyJobs);
}

function renderStops(jobs) {
    const container = document.getElementById('stopsList');
    if (jobs.length === 0) { container.innerHTML = '<p style="text-align:center; color:#888;">No jobs with locations found.</p>'; return; }
    container.innerHTML = jobs.map((job, index) => `
        <div class="stop-card">
            <div class="stop-number">${index + 1}</div>
            <div class="stop-info"><h4>${job.pairings.client_name}</h4><p>${job.service}</p><p class="stop-address">${job.pairings.address}</p></div>
        </div>
    `).join('');
}

function plotRouteMarkers(jobs) {
    const bounds = L.latLngBounds();
    jobs.forEach((job, index) => {
        const lat = job.pairings.latitude;
        const lng = job.pairings.longitude;
        L.marker([lat, lng]).bindPopup(`<b>${index + 1}. ${job.pairings.client_name}</b><br>${job.service}`).addTo(map);
        bounds.extend([lat, lng]);
    });
    if (jobs.length > 0) map.fitBounds(bounds, { padding: [50, 50] });
}

function optimizeRoute() {
    // Check if we are on dashboard or routes page
    const jobsToOptimize = dailyJobs.filter(j => j.latitude && j.longitude || (j.pairings && j.pairings.latitude));
    
    if (jobsToOptimize.length < 2) { alert('Need at least 2 jobs with locations to optimize route'); return; }

    // Normalize job structure for TSP
    const normalizedJobs = jobsToOptimize.map(j => ({
        ...j,
        lat: j.latitude || j.pairings.latitude,
        lng: j.longitude || j.pairings.longitude,
        clientName: j.client || j.pairings.client_name,
        jobTitle: j.title || j.service
    }));

    navigator.geolocation.getCurrentPosition(position => {
        const start = { lat: position.coords.latitude, lng: position.coords.longitude };
        const optimized = nearestNeighborTSP(start, normalizedJobs);
        displayOptimizedRoute(optimized);
    }, () => {
        const start = { lat: normalizedJobs[0].lat, lng: normalizedJobs[0].lng };
        const optimized = nearestNeighborTSP(start, normalizedJobs);
        displayOptimizedRoute(optimized);
    });
}

function nearestNeighborTSP(start, jobs) {
    const unvisited = [...jobs];
    const route = [];
    let current = start;
    let totalDistance = 0;
    while (unvisited.length > 0) {
        let nearest = null;
        let minDist = Infinity;
        let nearestIndex = -1;
        unvisited.forEach((job, idx) => {
            const dist = calculateDistance(current.lat, current.lng, job.lat, job.lng);
            if (dist < minDist) { minDist = dist; nearest = job; nearestIndex = idx; }
        });
        route.push(nearest);
        totalDistance += minDist;
        current = { lat: nearest.lat, lng: nearest.lng };
        unvisited.splice(nearestIndex, 1);
    }
    return { route, totalDistance };
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function displayOptimizedRoute(result) {
    const statsDiv = document.getElementById('routeStats');
    if (statsDiv) {
        const fuelCost = (result.totalDistance * 0.15).toFixed(2);
        const timeEstimate = Math.round(result.totalDistance / 40 * 60);
        statsDiv.innerHTML = `<div class="stat-box"><div class="stat-value">${result.totalDistance.toFixed(1)}km</div><div class="stat-label">Total Distance</div></div><div class="stat-box"><div class="stat-value">£${fuelCost}</div><div class="stat-label">Est. Fuel Cost</div></div><div class="stat-box"><div class="stat-value">${timeEstimate}min</div><div class="stat-label">Drive Time</div></div><div class="stat-box"><div class="stat-value">${result.route.length}</div><div class="stat-label">Stops</div></div>`;
        statsDiv.style.display = 'grid';
    }
    
    // If on routes page, update list
    const stopsList = document.getElementById('stopsList');
    if (stopsList) {
        stopsList.innerHTML = result.route.map((job, index) => `
            <div class="stop-card">
                <div class="stop-number">${index + 1}</div>
                <div class="stop-info"><h4>${job.clientName}</h4><p>${job.jobTitle}</p></div>
            </div>
        `).join('');
    }

    // Map updates
    map.eachLayer(layer => { if (layer instanceof L.Polyline || layer instanceof L.Marker) map.removeLayer(layer); });
    result.route.forEach((job, idx) => { L.marker([job.lat, job.lng]).bindPopup(`<strong>${idx + 1}. ${job.clientName}</strong><br>${job.jobTitle}`).addTo(map); });
    const coords = result.route.map(j => [j.lat, j.lng]);
    L.polyline(coords, { color: '#2E7D32', weight: 3 }).addTo(map);
    const bounds = L.latLngBounds(coords);
    map.fitBounds(bounds, { padding: [50, 50] });
    
    // Show modal if on dashboard
    if (document.getElementById('routeModal')) {
        document.getElementById('routeDetails').innerHTML = `<p>Optimized route for ${result.route.length} stops calculated.</p>`;
        document.getElementById('routeModal').style.display = 'block';
    }
}

function navigateTo(address) {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`, '_blank');
}

// --- Plant Library & Tips ---

function getPlantTipsForJob(job) {
    const month = new Date().toLocaleDateString('en-GB', { month: 'long' }).toLowerCase();
    const seasonalTips = plantCareDatabase[month];
    if (!seasonalTips) return null;
    for (const tip of seasonalTips.tips) {
        if (job.title.toLowerCase().includes(tip.plant.toLowerCase())) return tip.tip;
    }
    return null;
}

function updatePlantTips() {
    const month = new Date().toLocaleDateString('en-GB', { month: 'long' }).toLowerCase();
    const tips = plantCareDatabase[month];
    const tipsDiv = document.getElementById('plantTips');
    if (tips && tipsDiv) {
        tipsDiv.innerHTML = `<div class="plant-tip-card"><strong>💡 This Month:</strong><ul style="margin: 0.5rem 0; padding-left: 1.5rem; font-size: 0.85rem;"><li><strong>Prune:</strong> ${tips.prune.join(', ')}</li><li><strong>Plant:</strong> ${tips.plant.join(', ')}</li><li><strong>Avoid:</strong> ${tips.avoid.join(', ')}</li></ul></div>`;
    }
}

function openPlantLibrary(serviceName) {
    const month = new Date().toLocaleDateString('en-GB', { month: 'long' }).toLowerCase();
    const tips = plantCareDatabase[month];
    let content = `<h2>🌿 Plant Care Guide</h2><p><strong>Service:</strong> ${serviceName}</p><h3>Seasonal Guide for ${month.charAt(0).toUpperCase() + month.slice(1)}</h3>`;
    if (tips) {
        content += `<div style="background: #f1f8e9; padding: 1rem; border-radius: 8px; margin: 1rem 0;"><h4>What to Prune:</h4><ul>${tips.prune.map(p => `<li>${p}</li>`).join('')}</ul><h4>What to Plant:</h4><ul>${tips.plant.map(p => `<li>${p}</li>`).join('')}</ul></div>`;
    }
    alert(content.replace(/<[^>]*>/g, '\n'));
}

async function loadAllPlants() {
    const { data } = await supabaseClient.from('plants').select('*').order('name');
    if (data) { allPlants = data; renderPlants(allPlants); }
    
    // Also populate the AI lookup database if empty
    if (Object.keys(plantDatabase).length === 0 && data) {
        data.forEach(p => { plantDatabase[p.name.toLowerCase()] = { emoji: p.metadata?.emoji || '🌱', type: p.type || 'vegetable', sun: 'Unknown', water: 'Regular' }; });
    }
}

function renderPlants(plants) {
    const grid = document.getElementById('plantGrid');
    grid.innerHTML = plants.length ? plants.map(p => `
        <div class="plant-card">
            <div class="plant-emoji">${p.metadata?.emoji || '🌿'}</div>
            <div class="plant-name">${p.name}</div>
            <div class="plant-meta">${p.type || 'Plant'}</div>
            <div style="font-size: 0.85rem; color: #555;">${p.notes || ''}</div>
        </div>
    `).join('') : '<p style="grid-column: 1/-1; text-align: center;">No plants found.</p>';
}

function filterPlants(q) { renderPlants(allPlants.filter(p => p.name.toLowerCase().includes(q.toLowerCase()))); }

// --- Camera & Photos ---

function openCameraModal(jobId) {
    currentJobIdForPhoto = jobId;
    const modal = document.getElementById('cameraModal');
    if(modal) modal.style.display = 'block';
    startCamera();
}

function closeCameraModal() {
    const modal = document.getElementById('cameraModal');
    if(modal) modal.style.display = 'none';
    stopCamera();
    currentJobIdForPhoto = null;
}

async function startCamera() {
    try {
        currentStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        document.getElementById('cameraPreview').srcObject = currentStream;
    } catch (err) { alert('Camera access denied.'); console.error('Camera error:', err); }
}

function stopCamera() {
    if (currentStream) { currentStream.getTracks().forEach(track => track.stop()); currentStream = null; }
}

async function capturePhoto() {
    const video = document.getElementById('cameraPreview');
    const canvas = document.getElementById('photoCanvas');
    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    
    canvas.toBlob(async (blob) => {
        const fileName = `photo_${currentJobIdForPhoto || 'scan'}_${Date.now()}.jpg`;
        const { data, error } = await supabaseClient.storage.from('job-photos').upload(`${currentUser.id}/${fileName}`, blob, { contentType: 'image/jpeg' });
        if (error) { alert('Error uploading photo'); return; }
        
        if (currentJobIdForPhoto) {
            await supabaseClient.from('photos').insert([{ job_id: currentJobIdForPhoto, user_id: currentUser.id, storage_path: data.path, captured_at: new Date().toISOString() }]);
        }
        
        const url = canvas.toDataURL('image/jpeg');
        const photosDiv = document.getElementById('capturedPhotos');
        if(photosDiv) photosDiv.innerHTML += `<img src="${url}" style="width: 150px; height: auto; margin: 5px; border-radius: 8px;" alt="Captured photo">`;
        alert('✅ Photo saved!');
    }, 'image/jpeg', 0.8);
}

// --- Invoicing & Finances ---

async function loadFinances() {
    try {
        const { data: jobs, error } = await supabaseClient.from('jobs').select('*, pairings(client_name)').eq('contractor_id', currentUser.id).order('scheduled_date', { ascending: false });
        if (error) throw error;
        calculateStats(jobs);
        renderTransactions(jobs);
    } catch (err) { console.error('Error loading finances:', err); }
}

function calculateStats(jobs) {
    const completed = jobs.filter(j => j.status === 'completed');
    const pending = jobs.filter(j => j.status !== 'completed');
    const totalRev = completed.reduce((sum, j) => sum + (j.price || 0), 0);
    const pendingRev = pending.reduce((sum, j) => sum + (j.price || 0), 0);
    document.getElementById('totalRevenue').textContent = `£${totalRev.toFixed(2)}`;
    document.getElementById('pendingRevenue').textContent = `£${pendingRev.toFixed(2)}`;
    document.getElementById('jobsCount').textContent = completed.length;
}

function renderTransactions(jobs) {
    const list = document.getElementById('transactionList');
    list.innerHTML = jobs.length ? jobs.map(j => `
        <div class="transaction-item">
            <div class="t-info"><h4>${j.service}</h4><div class="t-meta">${new Date(j.scheduled_date).toLocaleDateString()} • ${j.pairings?.client_name || 'Client'}</div></div>
            <div class="t-status status-${j.status === 'completed' ? 'completed' : 'pending'}">${j.status}</div>
            <div class="t-amount">£${(j.price || 0).toFixed(2)}</div>
        </div>
    `).join('') : '<div class="loading-message">No jobs recorded yet.</div>';
}

async function completeJob(jobId) {
    const job = dailyJobs.find(j => j.id === jobId);
    if (!job || !confirm(`Mark "${job.title}" as completed?`)) return;
    const { error } = await supabaseClient.from('jobs').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', jobId);
    if (error) { alert('Error completing job'); return; }
    showInvoicePreview(job);
}

function showInvoicePreview(job) {
    const invoiceNumber = `INV-${Date.now()}`;
    const invoiceHTML = `<div style="padding: 2rem;"><h1>INVOICE</h1><p>${invoiceNumber}</p><p>To: ${job.client}</p><p>For: ${job.title}</p><h3>Total: £${job.price.toFixed(2)}</h3></div>`;
    document.getElementById('invoicePreview').innerHTML = invoiceHTML;
    document.getElementById('invoiceModal').style.display = 'block';
    window.currentInvoice = { job_id: job.id, invoice_number: invoiceNumber, client_email: job.email, amount: job.price };
}

function closeInvoiceModal() { document.getElementById('invoiceModal').style.display = 'none'; }

async function sendInvoice() {
    if (!window.currentInvoice) return;
    await supabaseClient.from('invoices').insert([{ user_id: currentUser.id, job_id: window.currentInvoice.job_id, invoice_number: window.currentInvoice.invoice_number, amount: window.currentInvoice.amount, status: 'sent', sent_at: new Date().toISOString() }]);
    alert(`📧 Invoice sent to ${window.currentInvoice.client_email}`);
    closeInvoiceModal();
    loadDashboardData();
}

// --- Settings ---

function loadSettings() {
    const mem = JSON.parse(localStorage.getItem('gardenmanager_memory') || '{}');
    // Merge with global gardenMemory if loaded
    if (gardenMemory.settings) {
        mem.settings = { ...mem.settings, ...gardenMemory.settings };
    }
    
    if (mem.settings) {
        document.getElementById('settingLocation').value = mem.settings.location || '';
        document.getElementById('settingApiKey').value = mem.settings.apiKey || '';
    }
}

function saveSettings() {
    const locInput = document.getElementById('settingLocation');
    const keyInput = document.getElementById('settingApiKey');
    
    if (locInput && keyInput) {
        const location = locInput.value;
        const apiKey = keyInput.value;
        
        // Update global memory
        gardenMemory.settings.location = location;
        gardenMemory.settings.apiKey = apiKey;
        saveMemory(); // Saves to localStorage 'gardenmanager_memory'

        // UI Feedback
        if (document.getElementById('settingsModal')) {
            // We are in the Chat Interface Modal
            toggleSettingsModal();
            addMessage('assistant', `Settings updated! Location set to ${location}.`);
        } else {
            // We are on the Settings Page
            alert('✅ Settings saved successfully!');
        }
    }
}

function clearLocalData() {
    if(confirm("Are you sure you want to clear all data? This will wipe your garden memory and settings.")) {
        localStorage.removeItem('gardenmanager_memory');
        localStorage.removeItem('gardenmanager_tutorial_complete');
        gardenMemory = { teachings: [], corrections: [], gists: [], gardenLayout: { beds: [], sunPatterns: [], soilType: '', lastUpdate: null }, plants: [], issues: [], harvests: [], version: '1.0.0', settings: { location: 'London', apiKey: '' }, chatHistory: [] };
        alert('Local data cleared.');
        location.reload();
    }
}

async function handleLogout() {
    if (confirm("Are you sure you want to logout?")) {
        await supabaseClient.auth.signOut();
        localStorage.removeItem('gb_token');
        sessionStorage.removeItem('gb_token');
        window.location.href = '../global/login/login_contractor.html';
    }
}

// --- Scanner ---

function startScanner() {
    html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: {width: 250, height: 250} }, false);
    html5QrcodeScanner.render(onScanSuccess, (err) => {});
}

function onScanSuccess(decodedText, decodedResult) {
    if (decodedText.startsWith('gardenbuddy4u://connect/')) {
        const clientId = decodedText.split('gardenbuddy4u://connect/')[1];
        html5QrcodeScanner.clear();
        const scanResult = document.getElementById('scanResult');
        scanResult.style.display = 'block';
        scanResult.innerHTML = `<h3 class="qr-detected-title">✅ QR Code Detected!</h3><p>Client ID: <span class="qr-client-id">${clientId.substring(0,8)}...</span></p><div class="qr-client-name-field"><label class="qr-client-name-label">Client Name:</label><input type="text" id="newClientName" value="New Client" class="qr-client-name-input"></div><div class="qr-action-btns"><button onclick="confirmConnection('${clientId}')" class="connect-btn" type="button">Connect Now</button><button onclick="window.location.reload()" class="cancel-btn" type="button">Scan Again</button></div>`;
    }
}

function confirmConnection(clientId) {
    const name = document.getElementById('newClientName').value || "New Client";
    connectToClient(clientId, name);
}

function toggleManualEntry() {
    const form = document.getElementById('manualEntryForm');
    const btn = document.getElementById('manualEntryBtn');
    const reader = document.getElementById('reader');
    if (form.style.display === 'none') {
        form.style.display = 'block'; btn.style.display = 'none'; reader.style.display = 'none';
        if (html5QrcodeScanner) try { html5QrcodeScanner.clear(); } catch(e) {}
    } else { window.location.reload(); }
}

function handleManualConnect(btnElement) {
    const clientId = document.getElementById('manualClientId').value.trim();
    const clientName = document.getElementById('manualClientName').value.trim();
    if (!clientId || !clientName) { alert("Please enter both Client ID and Name."); return; }
    connectToClient(clientId, clientName, btnElement);
}

async function connectToClient(clientId, clientName, btnElement = null) {
    const btn = btnElement || document.querySelector('.connect-btn');
    btn.textContent = "Connecting..."; btn.disabled = true;
    try {
        const { error } = await supabaseClient.from('pairings').insert({ contractor_id: currentUser.id, client_device_id: clientId, client_name: clientName, status: 'active', paired_at: new Date().toISOString() });
        if (error) throw error;
        alert(`✅ Successfully connected to ${clientName}!`);
        window.location.href = 'workload-hub.html';
    } catch (error) { console.error('Connection error:', error); alert('Failed to connect.'); btn.textContent = "Connect Now"; btn.disabled = false; }
}

// --- New Job ---

async function loadClientsForJob() {
    try {
        const { data: pairings, error } = await supabaseClient.from('pairings').select('id, client_name, garden_details').eq('contractor_id', currentUser.id).order('client_name');
        if (error) throw error;
        const select = document.getElementById('clientSelect');
        if (pairings.length === 0) { const option = document.createElement('option'); option.text = "No clients found"; option.disabled = true; select.add(option); return; }
        pairings.forEach(client => { const option = document.createElement('option'); option.value = client.id; option.text = `${client.client_name}`; select.add(option); });
    } catch (error) { console.error('Error loading clients:', error); }
}

async function handleSubmit(e) {
    e.preventDefault();
    const clientSelect = document.getElementById('clientSelect');
    if (!clientSelect.value) { alert('Please select a client'); return; }
    const loading = document.getElementById('loadingOverlay');
    loading.style.display = 'flex';
    const jobData = {
        contractor_id: currentUser.id,
        pairing_id: clientSelect.value,
        service: document.getElementById('serviceInput').value,
        scheduled_date: document.getElementById('dateInput').value,
        scheduled_time: document.getElementById('timeInput').value,
        price: parseFloat(document.getElementById('priceInput').value) || 0,
        notes: document.getElementById('notesInput').value,
        urgent: document.getElementById('urgentInput').checked,
        status: 'pending',
        created_at: new Date().toISOString()
    };
    try {
        const { error } = await supabaseClient.from('jobs').insert(jobData);
        if (error) throw error;
        alert('✅ Job scheduled successfully!');
        window.location.href = 'workload-hub.html';
    } catch (error) { console.error('Error creating job:', error); alert('Failed to create job'); loading.style.display = 'none'; }
}

// --- Chat / AI Logic (Extracted from index.html) ---

function loadMemory() {
    const saved = localStorage.getItem('gardenmanager_memory');
    if (saved) {
        try {
            gardenMemory = JSON.parse(saved);
            if (!gardenMemory.settings) gardenMemory.settings = { location: 'London', apiKey: '' };
            if (!gardenMemory.gists) gardenMemory.gists = [];
            if (!gardenMemory.chatHistory) gardenMemory.chatHistory = [];
            updateStatsDisplay();
            
            // Restore chat history
            if (gardenMemory.chatHistory && gardenMemory.chatHistory.length > 0) {
                gardenMemory.chatHistory.forEach(msg => addMessage(msg.type, msg.content, true));
            }
        } catch (e) { console.error('Failed to load memory:', e); }
    }
}

function saveMemory() {
    try {
        localStorage.setItem('gardenmanager_memory', JSON.stringify(gardenMemory));
        updateStatsDisplay();
    } catch (e) { console.error('Failed to save memory:', e); }
}

async function loadKnowledgeBase() {
    try {
        const response = await fetch('https://gist.githubusercontent.com/JamesTheGiblet/a112d7f704ed1a2f1cb6595a51e6f5a8/raw/f308454349355b4567eaf2d4fea73c00af58c848/garden-buddy-ai-json');
        knowledgeBase = await response.json();
    } catch (e) { console.error('Failed to load knowledge base:', e); }
}

function toggleSettingsModal() {
    const modal = document.getElementById('settingsModal');
    if(!modal) return;
    modal.style.display = (modal.style.display === 'flex' || modal.style.display === 'block') ? 'none' : 'flex';
    if (modal.style.display === 'flex') {
        document.getElementById('settingLocation').value = gardenMemory.settings.location || '';
        document.getElementById('settingApiKey').value = gardenMemory.settings.apiKey || '';
    }
}

function clearChatHistory() {
    if (confirm("Are you sure you want to clear your chat history?")) {
        gardenMemory.chatHistory = [];
        saveMemory();
        const chatContainer = document.getElementById('chatContainer');
        const messages = chatContainer.querySelectorAll('.message');
        messages.forEach(msg => msg.remove());
        // Restore welcome
        if (!chatContainer.querySelector('.welcome-message')) {
            const welcomeDiv = document.createElement('div');
            welcomeDiv.className = 'welcome-message';
            welcomeDiv.innerHTML = `<div class="welcome-icon">🌱</div><h2 class="welcome-title">Welcome to GardenManager</h2><p class="welcome-text">Manage your clients, schedule jobs, and track your business growth.</p>`;
            chatContainer.prepend(welcomeDiv);
        }
        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal) settingsModal.style.display = 'none';
    }
}

function reportBug() { window.open('https://github.com/JamesTheGiblet/garden-buddy-AI/issues/new', '_blank'); }

function initTutorial() {
    if (!localStorage.getItem('gardenmanager_tutorial_complete') && document.getElementById('tutorialModal')) {
        document.getElementById('tutorialModal').style.display = 'flex';
        showTutorialStep(1);
    }
}

function showTutorialStep(step) {
    document.querySelectorAll('.tutorial-step').forEach(el => el.style.display = 'none');
    const stepEl = document.getElementById('tutorialStep' + step);
    if(stepEl) stepEl.style.display = 'block';
}

function nextTutorialStep(step) { showTutorialStep(step); }

function finishTutorial() {
    const loc = document.getElementById('tutorialLocation').value;
    if (loc) {
        gardenMemory.settings.location = loc;
        saveMemory();
        if(document.getElementById('settingLocation')) document.getElementById('settingLocation').value = loc;
        addMessage('assistant', `Great! I've set your location to ${loc}.`);
    }
    localStorage.setItem('gardenmanager_tutorial_complete', 'true');
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
    if(!modal) return;
    modal.style.display = (modal.style.display === 'flex' || modal.style.display === 'block') ? 'none' : 'flex';
    if (modal.style.display === 'flex') {
        document.getElementById('currentTime').textContent = new Date().toLocaleString();
    }
}

function openTab(tabName) {
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
}

function handleProTab() {
    if (isProUser) openTab('pro');
    else showProLimitModal();
}

async function initializePlantDatabase() {
    if (Object.keys(plantDatabase).length === 0) {
        // Fallback data
        plantDatabase = {
            'tomato': { emoji: '🍅', type: 'vegetable', sun: 'Full sun', water: 'Regular' },
            'basil': { emoji: '🌿', type: 'herb', sun: 'Partial sun', water: 'Moist' },
            'lettuce': { emoji: '🥬', type: 'vegetable', sun: 'Partial sun', water: 'Moist' }
        };
        // Try to load from Supabase
        const { data } = await supabaseClient.from('plants').select('*');
        if (data && data.length > 0) {
            data.forEach(p => {
                plantDatabase[p.name.toLowerCase()] = {
                    emoji: p.metadata?.emoji || '🌱',
                    type: p.type || 'vegetable',
                    sun: p.sun || 'Unknown',
                    water: p.water || 'Regular'
                };
            });
        }
    }
    filterPlants();
}

function filterPlants() {
    const container = document.getElementById('plantDatabase');
    if(!container) return;
    const searchInput = document.getElementById('plantSearch');
    const filter = searchInput ? searchInput.value.toLowerCase() : '';
    container.innerHTML = '';
    for (const [name, data] of Object.entries(plantDatabase)) {
        if (name.toLowerCase().includes(filter)) {
            const card = document.createElement('div');
            card.className = 'plant-card';
            card.onclick = () => selectPlant(name, data);
            card.innerHTML = `<div class="plant-emoji">${data.emoji}</div><div class="plant-name">${name.charAt(0).toUpperCase() + name.slice(1)}</div>`;
            container.appendChild(card);
        }
    }
}

function selectPlant(name, data) {
    const message = `/teach I planted ${name} today. ${data.sun}. Water: ${data.water}.`;
    openTab('chat');
    setTimeout(() => {
        const input = document.getElementById('userInput');
        if(input) { input.value = message; sendMessage(message); }
    }, 300);
}

function showPlantSelector() {
    const chatContainer = document.getElementById('chatContainer');
    const selectorDiv = document.createElement('div');
    selectorDiv.className = 'message assistant';
    selectorDiv.innerHTML = `<div class="message-avatar">🌱</div><div class="message-content"><div class="message-bubble"><div style="margin-bottom: 0.5rem;">Select plants:</div><div class="plant-cards">${Object.entries(plantDatabase).slice(0, 6).map(([name, data]) => `<div class="plant-card" onclick="addPlantToGarden('${name}')"><div class="plant-emoji">${data.emoji}</div><div class="plant-name">${name}</div></div>`).join('')}</div></div></div>`;
    chatContainer.appendChild(selectorDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

async function addPlantToGarden(plantName) {
    const limit = isProUser ? Infinity : 5;
    if (gardenMemory.plants.length >= limit) { showProLimitModal(); return; }
    const lookupName = plantName.toLowerCase();
    const data = plantDatabase[lookupName] || { emoji: '🌱', type: 'vegetable' };
    const newPlant = { name: plantName, emoji: data.emoji, type: data.type, plantedDate: Date.now(), location: 'Unknown', notes: '' };
    gardenMemory.plants.push(newPlant);
    saveMemory();
    
    // Sync
    if (currentUser) {
        await supabaseClient.from('plants').insert([{ name: newPlant.name, type: newPlant.type, planted_at: new Date().toISOString(), user_id: currentUser.id, metadata: { emoji: newPlant.emoji } }]);
    }
    addMessage('assistant', `Added ${plantName} to your garden!`);
}

function updateStatsDisplay() {
    if(document.getElementById('teachingsCount')) document.getElementById('teachingsCount').textContent = gardenMemory.teachings.length;
    if(document.getElementById('plantsCount')) document.getElementById('plantsCount').textContent = gardenMemory.plants.length;
    if (gardenMemory.settings && gardenMemory.settings.location && document.getElementById('userLocation')) {
        document.getElementById('userLocation').textContent = gardenMemory.settings.location;
    }
}

async function checkProStatus(userId) {
    const { data } = await supabaseClient.from('user_profiles').select('subscription_tier').eq('id', userId).maybeSingle();
    if (data && data.subscription_tier === 'pro') {
        isProUser = true;
        if(document.getElementById('userSubscription')) document.getElementById('userSubscription').innerText = 'Pro Plan';
    }
}

function addMessage(type, content, isRestoring = false) {
    const chatContainer = document.getElementById('chatContainer');
    if(!chatContainer) return;
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
    
    messageDiv.innerHTML = `<div class="message-avatar">${type === 'user' ? '👤' : '🌱'}</div><div class="message-content">${commandBadge}<div class="message-bubble">${formatMessage(content)}</div></div>`;
    chatContainer.appendChild(messageDiv);
    if (!isRestoring) {
        gardenMemory.chatHistory.push({ type, content, timestamp: Date.now() });
        if (gardenMemory.chatHistory.length > 50) gardenMemory.chatHistory.shift();
        saveMemory();
    }
    setTimeout(() => { chatContainer.scrollTop = chatContainer.scrollHeight; }, 100);
}

function formatMessage(content) {
    return content.replace(/<text>/g, '').replace(/<\/text>/g, '').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
}

async function processTeaching(content) {
    const teaching = content.substring(7).trim();
    if (teaching) {
        gardenMemory.teachings.push({ text: teaching, timestamp: Date.now(), type: 'teaching' });
        if (currentUser) {
            await supabaseClient.from('teachings').insert([{ teaching_type: 'teach', content: teaching, created_at: new Date().toISOString(), user_id: currentUser.id }]);
        }
        saveMemory();
    }
}

async function processCorrection(content) {
    const correction = content.substring(6).trim();
    if (correction) {
        gardenMemory.corrections.push({ text: correction, timestamp: Date.now(), type: 'correction' });
        saveMemory();
    }
}

async function processWhy(content) {
    // Just log for now
}

function startDiagnosticWizard() {
    if (!knowledgeBase || !knowledgeBase.diagnostic_questions) { addMessage('assistant', "⚠️ Knowledge base loading..."); return; }
    const categories = Object.keys(knowledgeBase.diagnostic_questions);
    const buttons = categories.map(cat => `<button class="command-hint" onclick="selectWizardCategory('${cat}')" style="margin:0.25rem;">${cat.replace(/_/g, ' ').toUpperCase()}</button>`).join('');
    addMessage('assistant', `🩺 **Diagnostic Wizard**\nWhat type of problem?\n\n<div style="display:flex; flex-wrap:wrap;">${buttons}</div>`);
}

function selectWizardCategory(category) {
    wizardState = { active: true, category: category, step: 0, answers: [] };
    addMessage('user', `Diagnose ${category.replace(/_/g, ' ')}`);
    const questions = knowledgeBase.diagnostic_questions[category];
    setTimeout(() => { addMessage('assistant', `📋 **Question 1/${questions.length}:**\n${questions[0]}`); }, 600);
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
        return `✅ **Diagnostic Complete**\n\nRecorded. Check Knowledge Base for ${category}.`;
    }
}

function generateResponse(message) {
    if (wizardState.active) return handleWizardStep(message);
    const lower = message.toLowerCase();
    if (message.startsWith('/teach')) return `✓ Learned: "${message.substring(7).trim()}"`;
    if (message.startsWith('/wrong')) return `✓ Correction noted.`;
    if (message === '/why') return `I base advice on your garden memory and general best practices.`;
    if (message === '/help') return `Commands: /teach, /wrong, /why, /stats, /export`;
    if (message === '/stats') return `📊 **Stats:**\nTeachings: ${gardenMemory.teachings.length}\nPlants: ${gardenMemory.plants.length}`;
    if (message === '/export') {
        const dataStr = JSON.stringify(gardenMemory, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        const link = document.createElement('a'); link.href = dataUri; link.download = 'garden-export.json'; document.body.appendChild(link); link.click(); document.body.removeChild(link);
        return `💾 Exported data!`;
    }
    
    // Simple keyword matching
    if (lower.includes('water')) return "Watering depends on soil. Check if top inch is dry.";
    if (lower.includes('sun')) return "Most veggies need 6-8 hours of sun.";
    
    return `I'm listening! Tell me more about your garden.`;
}

function sendMessage(predefined = null) {
    const input = document.getElementById('userInput');
    const message = predefined || input.value.trim();
    if (!message) return;
    addMessage('user', message);
    if (!predefined) input.value = '';
    const sendButton = document.getElementById('sendButton');
    if(sendButton) sendButton.disabled = true;
    showTyping();
    setTimeout(() => {
        hideTyping();
        const response = generateResponse(message);
        addMessage('assistant', response);
        if(sendButton) sendButton.disabled = false;
        if (!predefined) input.focus();
    }, 800);
}

function showTyping() {
    const chatContainer = document.getElementById('chatContainer');
    const div = document.createElement('div'); div.className = 'message assistant'; div.id = 'typingIndicator';
    div.innerHTML = `<div class="message-avatar">🌱</div><div class="message-content"><div class="message-bubble">...</div></div>`;
    chatContainer.appendChild(div);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function hideTyping() { const el = document.getElementById('typingIndicator'); if(el) el.remove(); }

function insertCommand(cmd) {
    const input = document.getElementById('userInput');
    input.value = cmd; input.focus();
}

function handleKeyPress(e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }

// Voice
let recognition;
function initVoiceInput() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.lang = 'en-US';
        recognition.onresult = (event) => {
            const t = event.results[0][0].transcript;
            const input = document.getElementById('userInput');
            if(input) { input.value = t; input.focus(); }
        };
    } else {
        const btn = document.getElementById('micButton');
        if(btn) btn.style.display = 'none';
    }
}

function toggleVoiceInput() {
    if (!recognition) { alert("Not supported"); return; }
    if (!isProUser) { showProLimitModal(); return; }
    recognition.start();
}

// Photo
function triggerPhotoUpload() { document.getElementById('photoInput').click(); }
function handlePhotoUpload(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            addMessage('user', `Uploaded photo:<br><img src="${e.target.result}" style="max-width:100%; border-radius:8px;">`);
            setTimeout(() => {
                if(isProUser) addMessage('assistant', "📸 Pro Analysis: Looks healthy!");
                else { addMessage('assistant', "📸 Photo received. Pro analysis required."); setTimeout(showProLimitModal, 1500); }
            }, 1000);
        };
        reader.readAsDataURL(input.files[0]);
    }
}

// Modals & Share
function showProLimitModal() { document.getElementById('upgradeModal').style.display = 'flex'; }
function closeUpgradeModal() { document.getElementById('upgradeModal').style.display = 'none'; }
function selectPlan(plan) { console.log(plan); }
function handleUpgrade(plan) {
    window.location.href = `mailto:support@gardenbuddy.app?subject=Upgrade ${plan}`;
    closeUpgradeModal();
}

function toggleShareModal() {
    const modal = document.getElementById('shareModal');
    if(!modal) return;
    modal.style.display = (modal.style.display === 'flex') ? 'none' : 'flex';
    if (modal.style.display === 'flex') {
        document.getElementById('shareQrCode').src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(window.location.href)}`;
    }
}

function copyShareLink() { navigator.clipboard.writeText(window.location.href); alert('Copied!'); }
function shareNative() { if(navigator.share) navigator.share({title:'GardenManager', url: window.location.href}); }

function toggleAddPlantModal() {
    const modal = document.getElementById('addPlantModal'); // Note: This modal might not exist in index.html yet based on context, but function was requested
    if(modal) modal.style.display = (modal.style.display === 'flex') ? 'none' : 'flex';
}

// --- Global Helpers ---

function showQuickAdd() { window.location.href = 'new-job.html'; }
function closeRouteModal() { document.getElementById('routeModal').style.display = 'none'; }
function searchItems(query) {
    const filtered = allItems.filter(i => i.title.toLowerCase().includes(query.toLowerCase()) || (i.client && i.client.toLowerCase().includes(query.toLowerCase())));
    renderFeed(filtered);
}
function sendRainTexts() { alert("Simulating SMS to clients about rain delay..."); }
function downloadInvoicePDF() { alert("PDF download simulation..."); }

window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
        if (event.target.id === 'cameraModal') {
            // Only stop camera if the function exists (it might not if we are on index.html without camera logic loaded)
            if (typeof stopCamera === 'function') stopCamera();
        }
    }
}