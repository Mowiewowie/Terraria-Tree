// sw.js - Service Worker for Terraria App
const CACHE_NAME = 'terraria-app-cache-v4';
const TRACKER_CACHE = 'terraria-icons-tracker-v4';
const EXPIRY_DAYS = 7;
const EXPIRY_MS = EXPIRY_DAYS * 24 * 60 * 60 * 1000;

// Core assets to cache immediately upon installation
const CORE_ASSETS = [
    '/',
    '/index.html',
    '/styles.css',
    '/app-js/data.js',
    '/app-js/engine.js',
    '/app-js/router.js',
    '/app-js/state.js',
    '/app-js/sw.js',
    '/app-js/tree-core.js',
    '/app-js/tree-nodes.js',
    '/app-js/ui.js',
    '/terraria_items.json',
    // Add any specific CSS files or local fonts here if they aren't inline
];

// Install event: Pre-cache core assets and claim the active state
self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            // We use catch() here so that if one file 404s, it doesn't crash the entire installation
            return Promise.allSettled(CORE_ASSETS.map(url => cache.add(url)));
        })
    );
});

// Activate event: Clean up old cache versions
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.map(key => {
                    if (key !== CACHE_NAME && key !== TRACKER_CACHE) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch event: Route traffic based on domain and strategy
self.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);

    // 1. Terraria Wiki Images -> CACHE-FIRST (7-day expiry)
    if (requestUrl.hostname === 'terraria.wiki.gg' && 
       (requestUrl.pathname.includes('/images/') || requestUrl.pathname.includes('Special:FilePath'))) {
        event.respondWith(handleIconRequest(event.request));
        return;
    }

    // 2. Core App Assets -> NETWORK-FIRST (Fallback to cache)
    // We only intercept GET requests over http/https to prevent extension/file protocol crashes
    if (event.request.method === 'GET' && requestUrl.protocol.startsWith('http')) {
        event.respondWith(handleCoreRequest(event.request));
    }
});

// --- Strategy: Cache-First with 7-Day Expiry ---
async function handleIconRequest(request) {
    const imageCache = await caches.open(CACHE_NAME);
    const timeCache = await caches.open(TRACKER_CACHE);

    const cachedImage = await imageCache.match(request);
    const cachedTime = await timeCache.match(request);

    if (cachedImage && cachedTime) {
        try {
            const timeData = await cachedTime.json();
            if ((Date.now() - timeData.timestamp) < EXPIRY_MS) {
                return cachedImage; // Fresh Cache Hit
            }
        } catch (e) {
            console.warn("Tracker data corrupted for", request.url);
        }
    }

    try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok || networkResponse.status === 0) {
            imageCache.put(request, networkResponse.clone());
            timeCache.put(request, new Response(JSON.stringify({ timestamp: Date.now() }), {
                headers: { 'Content-Type': 'application/json' }
            }));
        }
        return networkResponse;
    } catch (error) {
        if (cachedImage) return cachedImage; // Offline fallback for expired images
        throw error;
    }
}

// --- Strategy: Network-First ---
async function handleCoreRequest(request) {
    try {
        // Step 1: Attempt to fetch the absolute latest version from the internet
        const networkResponse = await fetch(request);
        
        // Step 2: If successful, silently update our cache in the background
        if (networkResponse.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch (error) {
        // Step 3: If offline (fetch throws an error), pull the saved version from the cache
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        // Step 4: If offline AND not in cache, let it fail normally
        throw error;
    }
}
