# 🛡️ Industriële Standaarden & Compliance (MES)

Dit project is ontwikkeld als Manufacturing Execution System (MES) voor de "Future Factory", met strikte inachtneming van internationale normen om kwaliteit, veiligheid en data-integriteit te waarborgen.

## 1. ISA-95 (Enterprise-Control System Integration)
**De "MES-norm" voor integratie van kantoor- en productieautomatisering.**
*   **Relevantie:** Scheidt business logica (orders, planning) van fysieke uitvoering (vloer).
*   **Implementatie:** De Firestore datastructuur (`dbPaths.js`) volgt de ISA-95 hiërarchie (Enterprise > Site > Area > Cell).

## 2. ISO/IEC 27001 (Informatiebeveiliging)
**Standaard voor het beveiligen van gevoelige bedrijfsdata.**
*   **Relevantie:** Beveiliging van cloud-data en gebruikersbeheer.
*   **Implementatie:**
    *   Authenticatie via Firebase Auth.
    *   Rol-gebaseerde toegang (RBAC) via `useAdminAuth.js`.
    *   Strikte Security Rules (`firestore.rules`, `storage.rules`) voor database en opslag (Least Privilege).

## 3. ISO 9001 (Kwaliteitsmanagement)
**Aantonen dat het productieproces beheerst verloopt.**
*   **Relevantie:** Traceerbaarheid van elke processtap en wijziging.
*   **Implementatie:**
    *   **Audit Trail:** Elke actie wordt gelogd met tijdstip en gebruiker (`logActivity`).
    *   **Productdossier:** Digitaal dossier per lotnummer met volledige historie.
    *   **Versiebeheer:** Wijzigingen in orders zijn traceerbaar.

## 4. ISO 22400 (Key Performance Indicators)
**Standaard voor productie KPI's (zoals OEE).**
*   **Relevantie:** Betrouwbare en internationaal vergelijkbare cijfers.
*   **Implementatie:**
    *   `EfficiencyDashboard.jsx` berekent metrics volgens ISO-formules.
    *   Uniforme definities voor beschikbaarheid, prestatie en kwaliteit.

## 5. IEC 62443 (Cybersecurity voor IACS)
**Beveiliging van industriële automatiserings- en controlesystemen.**
*   **Relevantie:** Bescherming van terminals en scanners op de werkvloer.
*   **Implementatie:**
    *   HTTPS encryptie.
    *   Veilige API-sleutels (`.env`).

## 6. Audit Logging & Traceability (ISO 9001/27001)
**Vereiste:** Een onveranderlijk logboek van kritieke acties voor reconstructie en bewijsvoering.

### ISO 9001 (Kwaliteit)
*   **Productie Wijzigingen:** Aanpassingen aan recepturen, toleranties of productspecificaties (`PRODUCT_UPDATE`, `MATRIX_UPDATE`).
*   **Kwaliteitscontrole:** Inspectieresultaten en vrijgifte (`INSPECTION_COMPLETE`, `ORDER_RELEASE`).
*   **Afwijkingen:** Registratie van non-conformities.

### ISO 27001 (Beveiliging)
*   **Toegangsbeheer:** Succesvolle en mislukte inlogpogingen (`LOGIN`, `LOGIN_FAILED`).
*   **Rechtenbeheer:** Wijzigingen in gebruikersrollen of permissies (`USER_ROLE_CHANGE`).
*   **Configuratie:** Aanpassingen aan systeeminstellingen (`SETTINGS_UPDATE`).