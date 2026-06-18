// Firebase Cloud Messaging Service Worker
// Voor push notifications op desktop en mobiel

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

const hasPlaceholderConfig = Object.values(firebaseConfig).some(
  (value) => String(value || '').startsWith('YOUR_')
);

if (!hasPlaceholderConfig) {
  try {
    firebase.initializeApp(firebaseConfig);

    const messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
      console.log('[firebase-messaging-sw.js] Received background message ', payload);

      const notificationTitle = payload.notification?.title || 'Nieuwe melding';
      const notificationOptions = {
        body: payload.notification?.body || '',
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        tag: payload.data?.messageId || Date.now().toString(),
        requireInteraction: true,
        data: payload.data,
      };

      self.registration.showNotification(notificationTitle, notificationOptions);
    });
  } catch (error) {
    console.error('[firebase-messaging-sw.js] Firebase messaging init mislukt', error);
  }
} else {
  console.info('[firebase-messaging-sw.js] Messaging worker overgeslagen: Firebase config ontbreekt.');
}

self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification click received.', event);
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        try {
          for (const client of clientList) {
            if (client.url.includes('/messages') && 'focus' in client) {
              return client.focus();
            }
          }
          if (clients.openWindow) {
            return clients.openWindow('/messages');
          }
        } catch (err) {
          console.error('Error handling notification click:', err);
        }
      })
      .catch((err) => {
        console.error('Error in notificationclick event:', err);
      })
  );
});
