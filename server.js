const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

// --- Mock Database ---

const USERS = [
    // Contractors
    { id: 'cont_1', email: 'demo@gardenmanager.com', password: 'demo123', role: 'contractor', businessName: 'GreenThumb Services', location: 'London, UK' },
    { id: 'cont_admin', email: 'admin@gardenbuddy.com', password: 'gardenbuddai', role: 'contractor', businessName: 'GardenBuddy Superuser', location: 'Global' },
    // Clients
    { id: 'client_1', email: 'client@example.com', password: 'password', role: 'client', name: 'Smith Family', contractorId: 'cont_1' }
];

let CLIENTS = [
    { id: 'client_1', name: 'Smith Family', garden: 'Rose Garden Estate', healthStatus: 'urgent', nextDue: 'Today', contractorId: 'cont_1' },
    { id: 'client_2', name: 'Jones Residence', garden: 'Lawn & Borders', healthStatus: 'healthy', nextDue: 'Mar 20', contractorId: 'cont_1' },
    { id: 'client_3', name: 'Patel Cottage', garden: 'Vegetable Patch', healthStatus: 'warning', nextDue: 'Overdue', contractorId: 'cont_1' },
    { id: 'client_4', name: 'Williams Mansion', garden: 'Formal Gardens', healthStatus: 'healthy', nextDue: 'Apr 1', contractorId: 'cont_1' }
];

let JOBS = [
    { id: 'job_1', clientName: 'Smith Family', service: 'Rose Pruning', time: '09:00', status: 'confirmed', urgent: true, contractorId: 'cont_1', date: new Date().toISOString().split('T')[0] },
    { id: 'job_2', clientName: 'Jones Residence', service: 'Lawn Treatment', time: '11:30', status: 'confirmed', urgent: false, contractorId: 'cont_1', date: new Date().toISOString().split('T')[0] },
    { id: 'job_3', clientName: 'Williams Mansion', service: 'Hedge Trimming', time: '14:00', status: 'pending', urgent: false, contractorId: 'cont_1', date: new Date().toISOString().split('T')[0] }
];

const PLANTS = {
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

// --- Helper Functions ---

// Simple Mock Token Verification
const verifyToken = (req, res, next) => {
    const bearerHeader = req.headers['authorization'];
    if (typeof bearerHeader !== 'undefined') {
        const bearer = bearerHeader.split(' ');
        const bearerToken = bearer[1];
        req.token = bearerToken;
        
        // In a real app, verify JWT here. For demo, we map token to user ID based on simple rules.
        if (bearerToken.includes('superuser')) {
            req.userId = 'cont_admin';
        } else if (bearerToken.includes('demo') || bearerToken.includes('cont')) {
            req.userId = 'cont_1';
        } else {
            req.userId = 'client_1';
        }
        next();
    } else {
        res.sendStatus(403);
    }
};

// --- Auth Routes ---

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    const user = USERS.find(u => u.email === email && u.password === password);

    if (user) {
        const token = `token_${user.id}_${Date.now()}`;
        
        // Response format for Contractor App
        if (user.role === 'contractor') {
            res.json({
                success: true,
                token: token,
                user: {
                    id: user.id,
                    email: user.email,
                    businessName: user.businessName,
                    location: user.location,
                    clientCount: CLIENTS.filter(c => c.contractorId === user.id).length
                }
            });
        } 
        // Response format for Client App
        else {
            const contractor = USERS.find(u => u.id === user.contractorId);
            res.json({
                token: token,
                user: {
                    id: user.id,
                    contractorId: user.contractorId,
                    contractorName: contractor ? contractor.businessName : null
                }
            });
        }
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

app.post('/api/auth/register', (req, res) => {
    const { email, password, name } = req.body;
    
    if (USERS.find(u => u.email === email)) {
        return res.status(400).json({ success: false, message: 'Email already exists' });
    }

    const newUser = {
        id: 'user_' + Date.now(),
        email,
        password, // In a real app, hash this!
        role: 'client',
        name: name || 'New Gardener',
        contractorId: null
    };

    USERS.push(newUser);

    const token = `token_${newUser.id}_${Date.now()}`;
    
    res.json({
        success: true,
        token: token,
        user: {
            id: newUser.id,
            contractorId: newUser.contractorId,
            contractorName: null,
            name: newUser.name
        }
    });
});

// --- Contractor Routes ---

app.get('/api/jobs/today', verifyToken, (req, res) => {
    // Filter jobs for this contractor
    const contractorJobs = JOBS.filter(j => j.contractorId === req.userId);
    res.json(contractorJobs);
});

app.get('/api/clients', verifyToken, (req, res) => {
    const myClients = CLIENTS.filter(c => c.contractorId === req.userId);
    res.json(myClients);
});

app.get('/api/stats', verifyToken, (req, res) => {
    const myClients = CLIENTS.filter(c => c.contractorId === req.userId);
    const myJobs = JOBS.filter(j => j.contractorId === req.userId);
    
    res.json({
        todayJobs: myJobs.length,
        todayRevenue: myJobs.length * 150, // Mock calculation
        totalClients: myClients.length
    });
});

app.post('/api/clients/pair', verifyToken, (req, res) => {
    const { clientId, clientName } = req.body;
    
    // Check if client already exists in our mock DB
    let client = CLIENTS.find(c => c.id === clientId);
    
    if (client) {
        // Update existing client to link to this contractor
        client.contractorId = req.userId;
    } else {
        // Create new client entry from QR scan
        client = {
            id: clientId,
            name: clientName || 'New Client',
            garden: 'Pending Setup',
            healthStatus: 'healthy',
            nextDue: 'Pending',
            contractorId: req.userId
        };
        CLIENTS.push(client);
    }
    
    res.json({ success: true, message: 'Client paired successfully' });
});

// --- Client Routes ---

app.post('/api/requests', verifyToken, (req, res) => {
    const { type, note } = req.body;
    console.log(`[API] Received request from ${req.userId}: ${type} - ${note}`);
    res.json({ success: true });
});

app.get('/api/plants', (req, res) => {
    res.json(PLANTS);
});

app.listen(PORT, () => {
    console.log(`GardenBuddy API running at http://localhost:${PORT}`);
});