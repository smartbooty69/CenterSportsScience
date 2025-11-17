/**
 * Placeholder Firebase Messaging service worker.
 * This prevents 404s from the Firebase SDK when it tries to register
 * `firebase-messaging-sw.js` during development. Replace the contents of
 * this file with real push notification handling logic once messaging
 * support is implemented.
 */

self.addEventListener("install", () => {
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(self.clients.claim());
});

// No-op fetch handler to keep the service worker alive.
self.addEventListener("fetch", () => {});

