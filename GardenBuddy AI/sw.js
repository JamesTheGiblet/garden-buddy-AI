const CACHE_NAME = 'gardenbuddy-v5';
const ASSETS = [
    './',
    './index.html',
    './manifest.webmanifest',
    './chat_main.js',
    './chat_social.js',
    './chat_gardener.js',
    '../global/js/garden_knowledge_loader.js',
    '../image/logo.svg',
    '../config.js',
    '../supabase-client.js'
];

// Install event - cache assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(keys.map((key) => {
                if (key !== CACHE_NAME) {
                    return caches.delete(key);
                }
            }));
        })
        .then(() => self.clients.claim())
    );
});

// Fetch event - serve from cache, fall back to network
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                return response || fetch(event.request).catch(() => {
                    // Fallback for offline/network errors
                    if (event.request.url.includes('/api/')) {
                        return new Response(JSON.stringify({ error: 'Network error' }), {
                            status: 503,
                            headers: { 'Content-Type': 'application/json' }
                        });
                    }
                    return new Response('Network error', { status: 408 });
                });
            })
    );
});