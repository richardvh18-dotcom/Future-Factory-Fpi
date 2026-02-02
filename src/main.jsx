import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App"; // Schakelt weer over naar de hoofdapplicatie
import "./styles.css";

/**
 * FPi Future Factory - Main Entry Point
 * Versie: 4.0 (Hersteld)
 * * Dit bestand initialiseert de React applicatie en koppelt deze aan
 * de HTML-structuur in index.html.
 */

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
      {/* BrowserRouter zorgt voor de navigatie binnen de MES-omgeving */}
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  );
}
