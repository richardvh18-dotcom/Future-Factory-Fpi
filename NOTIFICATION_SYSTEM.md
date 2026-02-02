# Notificatiesysteem - Gebruikershandleiding

## Overzicht

Het notificatiesysteem biedt Facebook-achtige meldingen voor het gehele MES platform, inclusief:
- **Desktop toast notifications** (rechts onderin Windows-stijl)
- **Browser push notifications** (ook wanneer tab niet actief is)
- **Mobiele push notifications** (Android & iOS via PWA)
- **Message Center integratie** (alle berichten in één overzicht)

## Features

### 1. Toast Notifications (Rechts Onderin)
Automatische visuele meldingen die verschijnen bij:
- Nieuwe berichten in het systeem
- Systeem updates en waarschuwingen
- Productie events en alerts

**Kleuren:**
- 🟢 **Groen** - Succes (bijv. "Order gestart")
- 🔴 **Rood** - Error/Fout (bijv. "Kan niet opslaan")
- 🟡 **Geel** - Waarschuwing (bijv. "Machine bijna vol")
- 🔵 **Blauw** - Info (bijv. "Nieuw bericht ontvangen")

### 2. Browser Notifications
- Werkt ook wanneer browser minimized is
- Toont systeemmeldingen op Windows, macOS, Linux
- Automatische toestemming vragen bij eerste gebruik

### 3. Mobiele Push Notifications
- Ondersteund via Progressive Web App (PWA)
- Werkt op Android (Chrome, Samsung Internet, etc.)
- Werkt op iOS 16.4+ (Safari)
- Notificaties blijven werken ook als app gesloten is

## Voor Developers

### Toast Notifications Gebruiken

```javascript
import { useNotifications } from '../contexts/NotificationContext';

function MijnComponent() {
  const { showSuccess, showError, showInfo, showWarning } = useNotifications();

  const handleSave = async () => {
    try {
      await saveToDB();
      showSuccess('Data succesvol opgeslagen!');
    } catch (error) {
      showError('Kon niet opslaan: ' + error.message);
    }
  };

  return <button onClick={handleSave}>Opslaan</button>;
}
```

### Custom Toast

```javascript
const { showToast } = useNotifications();

showToast({
  title: 'Custom Titel',
  message: 'Custom bericht tekst hier',
  type: 'info', // 'success' | 'error' | 'warning' | 'info'
  duration: 5000 // milliseconden (optioneel, default 4000)
});
```

### Ongelezen Berichten Badge

```javascript
const { unreadCount } = useNotifications();

return (
  <div className="relative">
    <Mail />
    {unreadCount > 0 && (
      <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full px-1">
        {unreadCount}
      </span>
    )}
  </div>
);
```

## Firebase Setup (Voor Push Notifications)

### 1. Firebase Cloud Messaging Configureren

```javascript
// In firebase.js
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

export const messaging = getMessaging(app);

// Request permission en get token
export const requestNotificationPermission = async () => {
  const permission = await Notification.requestPermission();
  
  if (permission === 'granted') {
    const token = await getToken(messaging, {
      vapidKey: 'YOUR_VAPID_KEY' // Van Firebase Console
    });
    
    // Sla token op in Firestore voor deze gebruiker
    await saveTokenToFirestore(token);
  }
};
```

### 2. Service Worker Registreren

```javascript
// In index.html of main.jsx
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/firebase-messaging-sw.js')
    .then(registration => {
      console.log('Service Worker registered:', registration);
    });
}
```

### 3. Backend: Berichten Versturen

```javascript
// Server-side (Node.js met Firebase Admin SDK)
const admin = require('firebase-admin');

async function sendNotification(userToken, title, body) {
  const message = {
    notification: {
      title: title,
      body: body,
    },
    token: userToken,
  };

  try {
    const response = await admin.messaging().send(message);
    console.log('Notification sent:', response);
  } catch (error) {
    console.error('Error sending notification:', error);
  }
}
```

## Message Center Integratie

Alle notificaties worden automatisch:
1. Getoond als toast (kortstondig)
2. Opgeslagen in Firestore (`/future-factory/production/messages/`)
3. Toegankelijk via Message Center (`/messages`)
4. Geteld als badge in sidebar

### Bericht Structuur (Firestore)

```javascript
{
  id: "auto-generated-id",
  to: "user@example.com",        // Ontvanger email
  from: "admin@example.com",      // Verzender email (optioneel)
  senderId: "firebase-uid",       // Verzender UID
  subject: "Nieuwe order klaar",  // Onderwerp
  body: "Order #12345 is gereed voor inspectie",
  timestamp: Timestamp,
  read: false,                    // Gelezen status
  archived: false,                // Gearchiveerd
  priority: "normal",             // "low" | "normal" | "high"
  type: "system"                  // "system" | "user" | "alert"
}
```

## Mobiele Setup

### Android (Chrome)
1. App installeren via "Add to Home Screen"
2. Bij eerste bericht: toestemming vragen voor notificaties
3. Notificaties werken ook als app gesloten is

### iOS (Safari 16.4+)
1. Website toevoegen aan Home Screen
2. Instellingen → Safari → geavanceerd → Experimentele features → "Push API" aan
3. Bij eerste bericht: toestemming popup
4. Notificaties werken in achtergrond

## Testing

### Test Toast Notifications

```javascript
// In browser console
import { useNotifications } from './contexts/NotificationContext';
const { showSuccess } = useNotifications();
showSuccess('Test notificatie!');
```

### Test Browser Notifications

```javascript
// In browser console
if ('Notification' in window) {
  Notification.requestPermission().then(permission => {
    if (permission === 'granted') {
      new Notification('Test', { body: 'Dit is een test notificatie' });
    }
  });
}
```

## Best Practices

1. **Gebruik duidelijke titels**: "Order Gereed" in plaats van "Update"
2. **Houd berichten kort**: Max 2-3 regels in toast
3. **Juiste type gebruiken**: Success voor positief, Error voor problemen
4. **Niet te veel notificaties**: Groepeer gerelateerde updates
5. **Belangrijke acties vereisen**: Gebruik voor kritische systeem events

## Troubleshooting

### Notificaties verschijnen niet
- Check browser toestemming (icoon in adresbalk)
- Check Firestore rules voor `/future-factory/production/messages/`
- Check console voor errors
- Verifieer dat `NotificationProvider` app wrappt

### Badge telt niet correct
- Check of berichten correct gemarkeerd worden als `read: true`
- Verifieer Firestore query in `useMessages` hook

### Mobiel werkt niet
- Verifieer PWA manifest.json correct is
- Check service worker registratie
- iOS: Check iOS versie (16.4+ vereist)
- Android: Check Chrome versie (90+ vereist)

## Roadmap / Toekomstige Features

- [ ] Rich notifications met acties (bijv. "Bekijken" button)
- [ ] Geluidseffecten per notification type
- [ ] Custom notification sounds per gebruiker
- [ ] Do Not Disturb mode
- [ ] Notification center in header (dropdown)
- [ ] Notification preferences per categorie
- [ ] Email notificaties als fallback
- [ ] SMS notificaties voor kritische alerts
