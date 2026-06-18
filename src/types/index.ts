/**
 * @file src/types/index.ts
 *
 * Gedeelde JSDoc @typedef definities voor de kernmodellen.
 * Geeft type-hints en IntelliSense in alle editors zonder TypeScript te vereisen.
 *
 * Gebruik in andere bestanden:
 *   @param {import('../types').PlanningOrder} order
 *   @param {import('../types').TrackedProduct} product
 */

// ─────────────────────────────────────────────
// PlanningOrder
// ─────────────────────────────────────────────

/**
 * @typedef {Object} PlanningOrder
 *
 * Een planningsorder zoals opgeslagen in Firestore (`digital_planning`).
 *
 * @property {string}  id               - Firestore document-ID
 * @property {string}  orderId          - LN ordernummer (bijv. "N20025138")
 * @property {string}  item             - Productnaam / omschrijving
 * @property {string}  machine          - Machine-ID (bijv. "40BH18", "BH18")
 * @property {number}  plan             - Gepland aantal (Firestore)
 * @property {string}  [status]         - "open" | "running" | "completed" | "on_hold" | "cancelled"
 * @property {string}  [deliveryDate]   - Leverdatum (ISO string YYYY-MM-DD of DD-MM)
 * @property {string}  [date]           - Alternatieve datum (LN importveld)
 * @property {string}  [department]     - Afdeling slug (bijv. "bh18", "bm01")
 * @property {number}  [priority]       - Prioriteitsniveau (int)
 * @property {number}  [produced]       - Aantallen al geproduceerd (LN counter)
 * @property {string}  [drawing]        - Tekeningnummer
 * @property {string}  [extraCode]      - Extra code uit LN
 * @property {boolean} [smartSyncExcluded] - Handmatig uitgesloten van Slimme Sync
 * @property {boolean} [smartSyncIncluded] - Handmatig opgenomen in Slimme Sync
 * @property {string}  [delegatedTo]    - UID van medewerker waaraan gedelegeerd
 * @property {string}  [__docPath]      - Interne Firestore-pad referentie
 * @property {*}       [createdAt]      - Firestore Timestamp
 * @property {*}       [updatedAt]      - Firestore Timestamp
 * @property {*}       [syncedAt]       - Firestore Timestamp
 * @property {*}       [importedAt]     - Firestore Timestamp
 */

// ─────────────────────────────────────────────
// TrackedProduct
// ─────────────────────────────────────────────

/**
 * @typedef {Object} TrackedProduct
 *
 * Een gevolgde productie-eenheid (lot) zoals opgeslagen in
 * `digital_planning/{scope}/tracked_items` of het archief.
 *
 * @property {string}  id               - Firestore document-ID (bevat lotNumber, bijv. "N20025138_402608418xxxx")
 * @property {string}  orderId          - Bijbehorend LN ordernummer
 * @property {string}  lotNumber        - Uniek lotnummer (6+ cijfers)
 * @property {string}  [activeLot]      - Alternatief lotnummer-veld (legacy)
 * @property {string}  machine          - Machine waarop lot geregistreerd is (bijv. "BH18")
 * @property {string}  [originMachine]  - Oorspronkelijke machine (vóór verplaatsing)
 * @property {string}  [currentStation] - Huidig station in de workflow
 * @property {string}  [currentStep]    - Huidige stap (bijv. "Wacht op Lossen", "In productie")
 * @property {string}  status           - "active" | "completed" | "rejected" | "cancelled" | "archived"
 * @property {string}  [item]           - Productnaam (gekopieerd van order)
 * @property {string}  [itemCode]       - Artikelcode
 * @property {string}  [itemDescription] - Artikelomschrijving
 * @property {string}  [sourcePath]     - Firestore-pad van bronorder
 * @property {string}  [__docPath]      - Intern Firestore-pad
 * @property {string}  [lotQr]          - QR-code waarde voor het lot
 * @property {string}  [orderQr]        - QR-code waarde voor de order
 * @property {string}  [operator]       - Operator-ID of naam
 * @property {string[]} [lotNumbers]    - Meerdere lotnummers (BM01 batches)
 * @property {string}  [lotNumbersText] - Gecombineerde tekst van lotnummers
 * @property {Object}  [timestamps]     - Tijdstempelkaart per stap
 * @property {*}       [updatedAt]      - Firestore Timestamp
 * @property {*}       [archivedAt]     - Firestore Timestamp (alleen gearchiveerde items)
 * @property {*}       [completedAt]    - Firestore Timestamp
 */

// ─────────────────────────────────────────────
// WorkstationConfig
// ─────────────────────────────────────────────

/**
 * @typedef {'winding' | 'pipes' | 'post-processing' | 'inspection'} StationCategory
 */

/**
 * @typedef {Object} WorkstationConfig
 *
 * Stationsconfiguratie zoals gedefinieerd in `workstationLogic.js`.
 *
 * @property {string}          id       - Station-ID (bijv. "BH18", "BM01")
 * @property {string}          name     - Weergavenaam of i18n-sleutel
 * @property {StationCategory} category - Categorie van het station
 */

// ─────────────────────────────────────────────
// FactoryConfig
// ─────────────────────────────────────────────

/**
 * @typedef {Object} FactoryConfig
 *
 * Fabrieksconfiguratie opgehaald uit Firestore (`future-factory/config`).
 *
 * @property {Record<string, string>} [printerMapping]
 *   Mapping van stationId naar printerId (bijv. `{ BH18: "BH18-ZEBRA-USB" }`).
 *   Wordt meegegeven aan `getPrinterIdForStation()`.
 * @property {string[]}               [routingKeys]
 *   Routeringstags voor printerselectie (bijv. `["MAZAK", "ROUTE:MAZAK"]`).
 * @property {string[]}              [allowedMachines]
 *   Lijst van toegestane machines per afdeling.
 * @property {Record<string, number>} [productionStandards]
 *   Normtijden per machine/product.
 */

// ─────────────────────────────────────────────
// OrderProgressMeta
// ─────────────────────────────────────────────

/**
 * @typedef {Object} OrderProgressMeta
 *
 * Berekende voortgangsdata per order, geproduceerd door `useTeamleaderDataStore`.
 *
 * @property {number} started   - Aantal gestarte lots
 * @property {number} finished  - Aantal afgeronde lots
 * @property {number} rejected  - Aantal afgekeurde lots
 * @property {number} remaining - Resterend aantal (plan - finished)
 */

export {};
