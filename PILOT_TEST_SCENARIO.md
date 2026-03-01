# 🧪 Pilot Validatie Scenario: Full Digital Flow

Dit document beschrijft het stappenplan om de volledige digitale productieflow te testen zonder papier.

**Doel:** Verifiëren dat een order correct door alle statussen vloeit:
`PLANNED` → `ACTIVE` → `PAUSED` → `ACTIVE` → `TO_UNLOAD` → `UNLOADING` → `POST_PROCESSING` → `TO_INSPECT` → `COMPLETED`.

## 📋 Voorbereiding

1.  Zorg voor toegang tot de applicatie op **2 apparaten** (of 2 browser vensters):
    *   Venster A: **BH18** (Operator weergave)
    *   Venster B: **Lossen / BM01** (Of wissel van rol in één venster)
2.  Open de **TraceModal** (via TeamleaderHub of Zoekbalk) om live de statuswijzigingen te volgen.

## 🛠️ Stap 0: Test Order Aanmaken

Maak handmatig een order aan via de **Digital Planning Hub** of **Admin**:
*   **OrderNr:** `TEST-PILOT-001`
*   **Product:** `GRE-160-PN16` (of een ander bestaand product)
*   **Machine:** `BH18`
*   **Aantal:** `5`
*   **Status:** `PLANNED`

## 🔄 Het Scenario

### Fase 1: Productie (BH18)
1.  **Login** als Operator en ga naar **WorkstationHub**.
2.  Selecteer machine **BH18**.
3.  Zoek de order **TEST-PILOT-001**.
4.  🟢 Klik **"Start Order"**.
    *   *Check:* Status moet `ACTIVE` worden.
    *   *Check:* Tijd begint te lopen.
5.  ⏸️ Klik **"Pauze"** (bijv. Lunch).
    *   *Check:* Status wordt `PAUSED`.
    *   *Check:* Tijd stopt.
6.  ▶️ Klik **"Hervat"**.
    *   *Check:* Status weer `ACTIVE`.
7.  🏁 Klik **"Gereed Melden"**.
    *   *Check:* Order verdwijnt uit de lijst van BH18.
    *   *Check:* In TraceModal is status nu `TO_UNLOAD` (Te Lossen).

### Fase 2: Lossen (Unloading)
1.  Ga terug naar **WorkstationHub** en selecteer **"Lossen"** (of wissel naar Los-operator account).
2.  Je ziet order **TEST-PILOT-001** in de lijst "Te Lossen".
3.  🏁 Klik op **"Verwerken & Vrijgeven"** (De knop met het klembord icoon).
4.  Selecteer **"Goed"** in de popup en klik op **"Bevestigen"**.
    *   *Check:* Order verdwijnt uit Los-lijst.
    *   *Check:* In TraceModal is status nu `POST_PROCESSING` (Te Nabewerken).

### Fase 3: Nabewerking
1.  Ga naar **WorkstationHub** en selecteer **Nabewerking**.
2.  Je ziet order **TEST-PILOT-001** in de lijst "Nu Actief".
3.  🏁 Klik op **"Klaar / Verder"**.
4.  Selecteer **"Akkoord"** in de popup en klik op **"Bevestigen"**.
    *   *Check:* Order verdwijnt uit Nabewerking-lijst.
    *   *Check:* In TraceModal is status nu `TO_INSPECT` (Te Keuren).
    *   *Check:* Order verschijnt bij BM01.

### Fase 4: Eindinspectie (BM01)
1.  Ga naar **WorkstationHub** en selecteer **BM01**.
2.  Zoek de order bij "Te Keuren".
3.  🟢 Klik **"Start Inspectie"**.
4.  Vink de digitale checklist af (indien aanwezig).
5.  🏁 Klik **"Order Vrijgeven"** (Afronden).
    *   *Check:* Status wordt `COMPLETED`.
    *   *Check:* Order wordt gearchiveerd (verdwijnt uit actieve lijsten).

## 🐛 Wat als het misgaat?

Als een status blijft hangen:
1.  Noteer de **Order ID** en de **Huidige Status**.
2.  Open de **TraceModal** en kijk naar de "Laatste Activiteit".
3.  Meld dit bij de developer met een screenshot van de browser console (F12).