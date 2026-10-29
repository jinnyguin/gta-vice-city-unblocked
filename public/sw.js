const CACHE_NAME = 'gtavc-app-v3';
const OPFS_MARKER = '_game_ready';

// List of core engine files to cache immediately upon installation
const PRECACHE_ASSETS = [
    './',
    './index.html',
    './manifest.json'
    // Add any specific core .js or .wasm file paths here if known
];

const CONTENT_TYPES = new Map([
    ['.wasm', 'application/wasm'],
    ['.js', 'application/javascript'],
    ['.json', 'application/json'],
    ['.html', 'text/html; charset=utf-8'],
    ['.css', 'text/css; charset=utf-8'],
    ['.txt', 'text/plain; charset=utf-8'],
    ['.png', 'image/png'],
    ['.jpg', 'image/jpeg'],
    ['.jpeg', 'image/jpeg'],
    ['.gif', 'image/gif'],
    ['.svg', 'image/svg+xml'],
    ['.wav', 'audio/wav'],
    ['.mp3', 'audio/mpeg'],
    ['.ogg', 'audio/ogg'],
    ['.adf', 'application/octet-stream'],
    ['.dat', 'application/octet-stream'],
    ['.dff', 'application/octet-stream'],
    ['.txd', 'application/octet-stream'],
    ['.col', 'application/octet-stream'],
    ['.ipl', 'application/octet-stream'],
    ['.ide', 'application/octet-stream'],
    ['.ifp', 'application/octet-stream'],
    ['.img', 'application/octet-stream'],
    ['.dir', 'application/octet-stream'],
    ['.raw', 'application/octet-stream'],
    ['.bin', 'application/octet-stream'],
]);

// 1. Install Event: Force caching of initial shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(PRECACHE_ASSETS);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Helper to attach Cross-Origin isolation headers required for WASM / SharedArrayBuffer on iOS
function withIsolationHeaders(response) {
    if (!response || response.status === 0) return response;

    const newHeaders = new Headers(response.headers);
    newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
    newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
    });
}

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    const path = url.pathname;

    // A. Serve imported game data from OPFS
    if ((path.startsWith('/vcsky/') || path.startsWith('/vcbr/')) &&
        (event.request.method === 'GET' || event.request.method === 'HEAD')) {
        event.respondWith(serveFromOPFS(event.request, path));
        return;
    }

    // B. Cache-First with Network Fallback for App Shell (HTML, JS, WASM)
    if (event.request.method === 'GET' && url.origin === self.location.origin) {
        event.respondWith(
            caches.open(CACHE_NAME).then(async (cache) => {
                // Check if file is already in SW Cache
                const cachedResponse = await cache.match(event.request);
                if (cachedResponse) {
                    return withIsolationHeaders(cachedResponse);
                }

                // If not cached, fetch from network and store it in SW Cache
                try {
                    const networkResponse = await fetch(event.request);
                    if (networkResponse.status === 200) {
                        cache.put(event.request, networkResponse.clone());
                    }
                    return withIsolationHeaders(networkResponse);
                } catch (error) {
                    return new Response('Offline resource not available', { status: 503 });
                }
            })
        );
    }
});

function getContentType(filename) {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.wasm.br')) return 'application/wasm';
    if (lower.endsWith('.js.br')) return 'application/javascript';
    if (lower.endsWith('.json.br')) return 'application/json';
    if (lower.endsWith('.css.br')) return 'text/css; charset=utf-8';
    if (lower.endsWith('.html.br')) return 'text/html; charset=utf-8';

    for (const [ext, type] of CONTENT_TYPES) {
        if (lower.endsWith(ext)) return type;
    }
    return 'application/octet-stream';
}

function buildHeaders(filename, size) {
    const headers = new Headers();
    headers.set('Content-Type', getContentType(filename));
    headers.set('Content-Length', String(size));
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    headers.set('Cross-Origin-Embedder-Policy', 'require-corp');

    if (filename.toLowerCase().endsWith('.br')) {
        headers.set('Content-Encoding', 'br');
    }

    return headers;
}

function parseRange(rangeHeader, size) {
    const match = /^bytes=(\d*)-(\d
