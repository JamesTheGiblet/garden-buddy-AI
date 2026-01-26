// Basic Service Worker
const CACHE_NAME = 'garden-manager-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Simple passthrough for now to prevent errors
  // In production, you would implement caching strategies here
});