import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App"; // Schakelt weer over naar de hoofdapplicatie
import ErrorBoundary from "./components/ErrorBoundary";
import "./i18n"; // Import i18n configuratie
import "./styles.css";

/**
 * FPi Future Factory - Main Entry Point
 * Versie: 4.1 (Safari/iPad Fix)
 * * Dit bestand initialiseert de React applicatie en koppelt deze aan
 * de HTML-structuur in index.html.
 * * ErrorBoundary toegevoegd voor betere foutafhandeling op Safari/iPad
 */

// Debug logging voor Safari/iPad issues
console.log("🚀 App initializing...");
console.log("📱 User Agent:", navigator.userAgent);
console.log("🌐 Browser:", /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent) ? "Safari" : "Other");

// Eruda debug console voor iPad/mobiel (activeer met ?debug=true in URL)
if (window.location.search.includes('debug=true') || localStorage.getItem('eruda-debug') === 'true') {
  console.log("🐛 Loading Eruda debug console...");
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/eruda';
  script.onload = () => {
    window.eruda.init();
    console.log("✅ Eruda loaded");
  };
  document.body.appendChild(script);
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  // Foutafhandeling voor als het root element ontbreekt
  console.error(
    "CRITICAL ERROR: Het element met id 'root' is niet gevonden in de HTML."
  );
} else {
  const root = ReactDOM.createRoot(rootElement);

  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        {/* BrowserRouter zorgt voor de navigatie binnen de MES-omgeving */}
        <BrowserRouter future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true
        }}>
          <App />
        </BrowserRouter>
      </ErrorBoundary>
    </React.StrictMode>
  );
}

// Global error handler voor uncaught errors op Safari
window.addEventListener('error', (event) => {
  console.error('🔴 Global error caught:', event.error);
  console.error('🔴 Error message:', event.message);
  console.error('🔴 Error filename:', event.filename);
  console.error('🔴 Error line:', event.lineno);
});

// Promise rejection handler voor Safari
window.addEventListener('unhandledrejection', (event) => {
  console.error('🔴 Unhandled promise rejection:', event.reason);
});
