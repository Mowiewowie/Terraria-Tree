// sw.js - Service Worker for Terraria Icon Caching
const CACHE_NAME = 'terraria-icons-v1';
const TRACKER_CACHE = 'terraria-icons-tracker-v1';
const EXPIRY_DAYS = 7;
const EXPIRY_MS = EXPIRY_DAYS * 24 * 60 * 60 * 1000;

// Install event: Claim the active state immediately
self.addEventListener('install', event => {
    self.skipWaiting();
});

// Activate event: Clean up old cache versions if we ever update the names
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

// Fetch event: Intercept network requests
self.addEventListener('fetch', event => {
    const requestUrl = new URL(event.request.url);

    // Intercept BOTH the direct MD5 /images/ path AND the /wiki/Special:FilePath/ redirects
    if (requestUrl.hostname === 'terraria.wiki.gg' && 
       (requestUrl.pathname.includes('/images/') || requestUrl.pathname.includes('Special:FilePath'))) {
        event.respondWith(handleIconRequest(event.request));
    }
});

async function handleIconRequest(request) {
    const imageCache = await caches.open(CACHE_NAME);
    const timeCache = await caches.open(TRACKER_CACHE);

    const cachedImage = await imageCache.match(request);
    const cachedTime = await timeCache.match(request);

    // 1. Check if we have the image AND it is younger than 7 days
    if (cachedImage && cachedTime) {
        try {
            const timeData = await cachedTime.json();
            const age = Date.now() - timeData.timestamp;

            if (age < EXPIRY_MS) {
                return cachedImage; // Cache Hit: Valid and fresh!
            }
        } catch (e) {
            // Failsafe: If tracker JSON is corrupted, we will refetch
            console.warn("Tracker data corrupted for", request.url);
        }
    }

    // 2. Cache Miss or Expired: Fetch from the network
    try {
        // We use the browser's default cors mode for standard <img> tags
        const networkResponse = await fetch(request);

        // Only cache successful responses (Opaque responses have a status of 0, which we must accept)
        if (networkResponse.ok || networkResponse.status === 0) {
            
            // Clone the response because a response stream can only be read once
            imageCache.put(request, networkResponse.clone());

            // Create a microscopic synthetic response to act as our database timestamp
            const timePayload = JSON.stringify({ timestamp: Date.now() });
            const timeResponse = new Response(timePayload, {
                headers: { 'Content-Type': 'application/json' }
            });
            timeCache.put(request, timeResponse);
        }

        return networkResponse;
    } catch (error) {
        // 3. Offline Failsafe: If the network drops, serve the expired cache anyway
        if (cachedImage) return cachedImage;
        throw error;
    }
}