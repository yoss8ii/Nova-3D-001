/* NOVA 3D - public/sw.js : service worker (makes the site installable and keeps the pages usable offline)
 * Strategy: the NETWORK always wins, so visitors never see an old version after a deploy. Every successful page / script / image is
 * also copied into a cache, used only when the network is down. /api/* (catalogue, orders, photos) and the admin page are never touched.
 * To force-clear the cache of every visitor, change VERSION. */
var VERSION = "nova-v1";

self.addEventListener("install", function () { self.skipWaiting() });

self.addEventListener("activate", function (e) {
    e.waitUntil(caches.keys().then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== VERSION }).map(function (k) { return caches.delete(k) }))
    }).then(function () { return self.clients.claim() }))
});

self.addEventListener("fetch", function (e) {
    var req = e.request, u = new URL(req.url);
    if (req.method !== "GET" || u.origin !== location.origin || u.pathname.indexOf("/api/") === 0 || u.pathname.indexOf("/gestion-") === 0) return;
    e.respondWith(fetch(req).then(function (res) {
        if (res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy) }) }
        return res
    }).catch(function () { return caches.match(req).then(function (hit) { return hit || caches.match("/") }) }))
});
