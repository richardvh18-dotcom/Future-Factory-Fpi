/**
 * AI Service - Google Gemini Integration
 * Exclusief voor Firebase/Google ecosystem
 * 
 * Setup:
 * API key wordt uitsluitend server-side geconfigureerd
 * via Firebase Functions config/environment.
 */

import { collection, collectionGroup, query, getDocs, addDoc, setDoc, getDoc, doc, limit, orderBy, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import app, { auth, db, logActivity } from '../config/firebase';
import { PATHS, getPathString, getPlanningArchivePath } from '../config/dbPaths';
import i18n from '../i18n';
import { fetchScopedEfficiencyHours } from '../utils/efficiencyScopedReader';

export type AiDocument = {
  id: string;
  fileName?: string;
  parsed?: boolean;
  characterCount?: number;
  fullText?: string;
  analysis?: {
    title?: string;
    summary?: string;
    keyFacts?: string[];
    tags?: string[];
    fullContext?: string;
    processes?: string[];
    partNumbers?: string[];
    tolerances?: string[];
    warnings?: string[];
    [key: string]: any;
  };
  [key: string]: any;
};

export type CatalogProduct = {
  id: string;
  name?: string;
  sku?: string;
  description?: string;
  specifications?: any;
  tolerance?: any;
  toleranceRange?: string;
  diameter?: string | number;
  length?: string | number;
  width?: string | number;
  height?: string | number;
  quantity?: number;
  minStock?: number;
  reserved?: number;
  [key: string]: any;
};

export type AiMemory = {
  id: string;
  topic?: string;
  content?: string;
  keywords?: string[];
  active?: boolean;
  [key: string]: any;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

const SYSTEM_PROMPT_BUDGET = 11500;

const clamp = (value: string, maxChars: number): string => String(value || '').slice(0, maxChars);

class AIService {
  public availableModel: string;
  public functions: any;
  public aiProxyGenerate: any;

  constructor() {
    this.availableModel = 'gemini-2.5-flash';
    this.functions = getFunctions(app);
    this.aiProxyGenerate = httpsCallable(this.functions, 'aiProxyGenerate');
    
    // Expose debug functie globally voor troubleshooting
    if (typeof window !== 'undefined') {
      (window as any).aiDebug = {
        listDocuments: () => this.debugListDocuments(),
        searchDocuments: (term: string) => this.debugSearchDocuments(term),
        testContext: (query: string) => this.debugTestContext(query)
      };
    }
  }

  isConfigured() {
    return import.meta.env.VITE_DISABLE_AI !== 'true';
  }

  /**
   * Debug: Lijst alle AI documenten
   */
  async debugListDocuments() {
    try {
      const docs = await this.getAiDocuments(50);
      console.log(`\n📚 === AI DOCUMENTEN DATABASE (${docs.length} totaal) ===`);
      docs.forEach((doc, idx) => {
        console.log(`\n${idx + 1}. ${doc.fileName}`);
        console.log(`   ID: ${doc.id}`);
        console.log(`   Parsed: ${doc.parsed}`);
        console.log(`   Character Count: ${doc.characterCount || 'N/A'}`);
        console.log(`   Has fullText: ${!!doc.fullText}`);
        console.log(`   Summary: ${doc.analysis?.summary?.substring(0, 100) || 'N/A'}...`);
        console.log(`   Tags: ${doc.analysis?.tags?.join(', ') || 'N/A'}`);
      });
      return docs;
    } catch (error) {
      console.error('Debug error:', error);
      return [];
    }
  }

  /**
   * Debug: Test document search
   */
  async debugSearchDocuments(searchTerm: string) {
    console.log(`\n🔍 === SEARCH TEST voor: "${searchTerm}" ===`);
    const terms = this.extractSearchTerms(searchTerm);
    console.log('Geëxtraheerde zoektermen:', terms);
    const results = await this.searchAiDocuments(searchTerm);
    console.log(`Resultaten: ${results.length}`);
    results.forEach((doc, idx) => {
      console.log(`${idx + 1}. ${doc.fileName} (${doc.characterCount || 0} chars)`);
    });
    return results;
  }

  /**
   * Debug: Test context generation
   */
  async debugTestContext(query: string) {
    console.log(`\n📊 === CONTEXT TEST voor: "${query}" ===`);
    const context = await this.getRelevantContext(query);
    console.log(`Context lengte: ${context.length} karakters`);
    console.log(`\nContext preview:\n${context.substring(0, 500)}...`);
    return context;
  }

  /**
   * Haal productie orders op uit de database
   * Zoekt in digital_planning en tracked_products en subcollecties
   * @param {number} limitCount - Maximaal aantal orders
   * @returns {Promise<Array>} Array met productie orders
   */
  async getProductionOrders(limitCount = 50) {
    try {
      let allOrders: any[] = [];
      const seen = new Set<string>();

      const pushUnique = (rows: any[], source: string) => {
        rows.forEach((row) => {
          const stableId = String(
            row.orderId || row.orderNumber || row.id || row.jobId || row.productOrderId || ''
          ).trim();
          const dedupeKey = stableId ? `${source}:${stableId}` : `${source}:${JSON.stringify(row).slice(0, 220)}`;
          if (!seen.has(dedupeKey)) {
            seen.add(dedupeKey);
            allOrders.push({ source, ...row });
          }
        });
      };
      
      // Probeer PATHS.PLANNING eerst
      try {
        console.log('🔎 Trying PATHS.PLANNING: /future-factory/production/digital_planning');
        const planningCollection = collection(db, getPathString(PATHS.PLANNING));
        const q = query(planningCollection, limit(limitCount));
        const snapshot = await getDocs(q);
        
        const planningOrders = snapshot.docs.map(doc => ({
          id: doc.id,
          ...(doc.data() as Record<string, any>)
        }));
        
        console.log(`📦 PATHS.PLANNING: ${planningOrders.length} documenten gevonden`);
        pushUnique(planningOrders, 'PLANNING');
      } catch (error) {
        console.log('⚠️ PATHS.PLANNING error:', getErrorMessage(error));
      }

      // Legacy planning pad fallback
      try {
        const legacyPath = ['future-factory', 'production', 'data', 'digital_planning', 'orders'];
        console.log('🔎 Trying LEGACY planning path:', legacyPath.join('/'));
        const legacyCollection = collection(db, getPathString(legacyPath));
        const legacySnap = await getDocs(query(legacyCollection, limit(limitCount)));

        const legacyOrders = legacySnap.docs.map(doc => ({
          id: doc.id,
          ...(doc.data() as Record<string, any>)
        }));

        console.log(`📦 LEGACY planning: ${legacyOrders.length} documenten gevonden`);
        pushUnique(legacyOrders, 'PLANNING_LEGACY');
      } catch (error) {
        console.log('⚠️ LEGACY planning error:', getErrorMessage(error));
      }

      // Scoped orders fallback via collectionGroup
      try {
        console.log('🔎 Trying collectionGroup("orders") fallback');
        const scopedSnap = await getDocs(query(collectionGroup(db, 'orders'), limit(Math.max(80, limitCount * 3))));

        const scopedOrders = scopedSnap.docs.map(doc => ({
          id: doc.id,
          ...(doc.data() as Record<string, any>)
        }));

        console.log(`📦 Scoped orders: ${scopedOrders.length} documenten gevonden`);
        pushUnique(scopedOrders, 'PLANNING_SCOPED');
      } catch (error) {
        console.log('⚠️ Scoped orders fallback error:', getErrorMessage(error));
      }
      
      // Probeer PATHS.TRACKING
      try {
        console.log('🔎 Trying PATHS.TRACKING: /future-factory/production/tracked_products');
        const trackingCollection = collection(db, getPathString(PATHS.TRACKING));
        const q = query(trackingCollection, limit(limitCount));
        const snapshot = await getDocs(q);
        
        const trackedOrders = snapshot.docs.map(doc => ({
          id: doc.id,
          ...(doc.data() as Record<string, any>)
        }));
        
        console.log(`📦 PATHS.TRACKING: ${trackedOrders.length} documenten gevonden`);
        pushUnique(trackedOrders, 'TRACKING');
      } catch (error) {
        console.log('⚠️ PATHS.TRACKING error:', getErrorMessage(error));
      }
      
      // Log eerste doc structure
      if (allOrders.length > 0) {
        console.log('📄 Eerste order strukture:', Object.keys(allOrders[0]));
        console.log('📄 Sample data:', allOrders[0]);
      }
      
      return allOrders;
      
    } catch (error) {
      console.error('Error fetching production orders:', getErrorMessage(error));
      return [];
    }
  }

  /**
   * Zoek productie orders op titel/beschrijving/ordernummer
   * Probeert eerst ordernummers eruit te trekken uit de query
   * @param {string} searchTerm - Zoekterm
   * @returns {Promise<Array>} Gevonden orders met volledige informatie
   */
  async searchProductionOrders(searchTerm: string) {
    try {
      const orders = await this.getProductionOrders(200);
      const normalize = (value: any) => (value ?? '').toString();
      const collectLotNumbers = (order: any) => {
        const lots: string[] = [];
        const pushLot = (value: any) => {
          const val = normalize(value);
          if (val) lots.push(val);
        };

        pushLot(order.lotNumber);
        pushLot(order.lot);
        pushLot(order.batchNumber);
        pushLot(order.batch);
        pushLot(order.lotId);

        [order.products, order.items, order.units, order.lots, order.trackedProducts].forEach((arr) => {
          if (Array.isArray(arr)) {
            arr.forEach((item) => {
              pushLot(item?.lotNumber);
              pushLot(item?.lot);
              pushLot(item?.batchNumber);
              pushLot(item?.batch);
              pushLot(item?.lotId);
            });
          }
        });

        return lots;
      };
      
      // Probeer ordernummers eruit te trekken uit de zoekterm
      // Ordernummers beginnen meestal met N gevolgd door cijfers (N20023990)
      const orderNumberMatch = searchTerm.match(/N\d+/i);
      const orderNumber = orderNumberMatch ? orderNumberMatch[0].toUpperCase() : null;
      const lotNumberMatch = searchTerm.match(/\b\d{10,20}\b/);
      const lotNumber = lotNumberMatch ? lotNumberMatch[0] : null;
      
      console.log(`🔎 searchProductionOrders: zoeken naar "${searchTerm}"`);
      if (orderNumber) {
        console.log(`   Gevonden ordernummer format: ${orderNumber}`);
      }
      if (lotNumber) {
        console.log(`   Gevonden lotnummer format: ${lotNumber}`);
      }
      
      // Filter orders
      const filtered = orders.filter(order => {
        // Mogelijke ID velden - orderId is het belangrijkste!
        const orderId = (order.orderId || order.orderNumber || order.id || order.jobId || order.productOrderId || '').toUpperCase();
        const itemCode = (order.itemCode || '').toUpperCase();
        const name = (order.name || order.title || order.productName || '').toLowerCase();
        const desc = (order.description || order.details || '').toLowerCase();
        const sku = (order.sku || order.articleCode || order.partNumber || '').toUpperCase();
        const lotNumbers = collectLotNumbers(order).map((n) => n.toUpperCase());
        
        // Als we een ordernummer gevonden hebben, check daar eerst
        if (orderNumber) {
          if (orderId.includes(orderNumber) || itemCode.includes(orderNumber)) {
            console.log(`   ✅ Match gevonden: orderId="${orderId}"`);
            return true;
          }
        }

        // Als we een lotnummer gevonden hebben, check daar op
        if (lotNumber) {
          const lotUpper = lotNumber.toUpperCase();
          if (lotNumbers.some((n) => n.includes(lotUpper))) {
            console.log(`   ✅ Match gevonden: lotnummer="${lotNumber}"`);
            return true;
          }
        }
        
        // Fallback: check ook op item code
        const term = searchTerm.toLowerCase();
        return (
          orderId.includes(term.toUpperCase()) ||
          name.includes(term) ||
          desc.includes(term) ||
          sku.includes(term.toUpperCase()) ||
          itemCode.includes(term.toUpperCase()) ||
          lotNumbers.some((n) => n.includes(term.toUpperCase()))
        );
      });
      
      console.log(`✅ Found ${filtered.length} matching orders`);
      
      // Sorteer zodat exacte matches eerst komen
      return filtered.sort((a, b) => {
        if (orderNumber) {
          const aId = (a.orderId || '').toUpperCase();
          const bId = (b.orderId || '').toUpperCase();
          if (aId === orderNumber && bId !== orderNumber) return -1;
          if (bId === orderNumber && aId !== orderNumber) return 1;
        }
        return 0;
      });
    } catch (error) {
      console.error('Error searching production orders:', error);
      return [];
    }
  }

  /**
   * Haal catalogus producten op
   * @param {number} limitCount - Maximaal aantal producten
   * @returns {Promise<Array>} Array met catalog products
   */
  async getCatalogProducts(limitCount = 50): Promise<CatalogProduct[]> {
    try {
      // Probeer producten uit inventory op te halen
      const inventoryCollection = collection(db, getPathString(PATHS.INVENTORY));
      const q = query(inventoryCollection, limit(limitCount));
      const snapshot = await getDocs(q);
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as Record<string, any>)
      }) as CatalogProduct);
    } catch (error) {
      console.error('Error fetching catalog products:', error);
      return [];
    }
  }

  /**
   * Haal meest recente productie activiteit op gesorteerd op timestamp
   * Gebruikt voor vragen als "welk lotnummer als laatste gebruikt?" of "wat is recentste lot?"
   * @param {number} limitCount - Maximaal aantal items
   * @returns {Promise<Array>} Array met meest recente activiteit
   */
  async getRecentProductionActivity(limitCount = 10) {
    const results: any[] = [];
    for (const pathKey of ['TRACKING', 'PLANNING'] as const) {
      try {
        const col = collection(db, getPathString(PATHS[pathKey]));
        let snapshot;
        // Probeer timestamp desc, dan createdAt desc, dan zonder sortering
        try {
          snapshot = await getDocs(query(col, orderBy('timestamp', 'desc'), limit(limitCount)));
        } catch {
          try {
            snapshot = await getDocs(query(col, orderBy('createdAt', 'desc'), limit(limitCount)));
          } catch {
            snapshot = await getDocs(query(col, limit(limitCount)));
          }
        }
        const docs = snapshot.docs.map(d => ({ id: d.id, source: pathKey, ...(d.data() as Record<string, any>) }));
        results.push(...docs);
        console.log(`📦 Recent activity from ${pathKey}: ${docs.length} items`);
      } catch (error) {
        console.warn(`⚠️ Kon recente activiteit niet ophalen uit ${pathKey}:`, getErrorMessage(error));
      }
    }
    return results;
  }

  /**
   * Haal productie tijden op uit TIME_LOGS en EFFICIENCY_HOURS
   * Gebruikt voor vragen over cyclustijden, bewerkingstijden, efficiëntie
   * @param {number} limitCount - Maximaal aantal items
   * @returns {Promise<Array>} Array met tijdregistraties
   */
  async getProductionTimes(limitCount = 20) {
    const results: any[] = [];
    for (const pathKey of ['TIME_LOGS'] as const) {
      try {
        const col = collection(db, getPathString(PATHS[pathKey]));
        let snapshot;
        try {
          snapshot = await getDocs(query(col, orderBy('timestamp', 'desc'), limit(limitCount)));
        } catch {
          snapshot = await getDocs(query(col, limit(limitCount)));
        }
        const docs = snapshot.docs.map(d => ({ id: d.id, source: pathKey, ...(d.data() as Record<string, any>) }));
        results.push(...docs);
        console.log(`⏱️ Times from ${pathKey}: ${docs.length} items`);
      } catch (error) {
        console.warn(`⚠️ Kon tijden niet ophalen uit ${pathKey}:`, getErrorMessage(error));
      }
    }

    try {
      const efficiencyRows = await fetchScopedEfficiencyHours({ db, mode: 'active', maxDocs: limitCount });
      const docs = efficiencyRows.map((row) => ({ ...row, source: 'EFFICIENCY_HOURS' }));
      results.push(...docs);
      console.log(`⏱️ Times from EFFICIENCY_HOURS(scoped): ${docs.length} items`);
    } catch (error) {
      console.warn('⚠️ Kon scoped efficiency tijden niet ophalen:', getErrorMessage(error));
    }

    return results;
  }

  /**
   * Haal geanalyseerde AI documenten op
   * @param {number} limitCount - Maximaal aantal documenten
   * @returns {Promise<Array>} Array met documenten
   */
  async getAiDocuments(limitCount = 20): Promise<AiDocument[]> {
    try {
      const docsCollection = collection(db, getPathString(PATHS.AI_DOCUMENTS));
      const q = query(docsCollection, limit(limitCount));
      const snapshot = await getDocs(q);

      return snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Record<string, any>),
      }) as AiDocument);
    } catch (error) {
      console.error('Error fetching AI documents:', error);
      return [];
    }
  }

  /**
   * Berekent werkbelasting + beschikbare capaciteit voor de komende weken.
   * Gebruikt voor vragen als:
   * - "Kan ik een order van 130 uur inplannen vóór donderdag over 2 weken?"
   * - "Welke orders lopen achterstand op?"
   * - "Wat is mijn vrije capaciteit volgende week?"
   * @returns {Promise<string>} Geformateerde capaciteits-context string
   */
  async getCapacityContext() {
    let ctx = '\n\n## WERKBELASTING & CAPACITEITSANALYSE:\n';
    ctx += '='.repeat(60) + '\n';

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const DAY_MS = 86400000;

    // --- 1. Fabrieksstructuur (ploegen per afdeling) ---
    let dailyCapacityHours = 0; // totale norm-uren per werkdag op basis van ploegen
    let departments: any[] = [];
    try {
      const factorySnap = await getDoc(doc(db, getPathString(PATHS.FACTORY_CONFIG)));
      if (factorySnap.exists()) {
        const data = factorySnap.data();
        departments = data.departments || [];
        departments.forEach(dept => {
          const shifts = Number(dept.shifts) || 1;
          dailyCapacityHours += shifts * 8; // 8 uur per ploeg
        });
        ctx += `\n### Fabrieksstructuur:\n`;
        departments.forEach(dept => {
          const shifts = Number(dept.shifts) || 1;
          ctx += `- ${dept.name}: ${shifts} ploeg(en) = ${shifts * 8} uur/dag\n`;
        });
        ctx += `**Totale dagcapaciteit: ${dailyCapacityHours} uur/dag (alle afdelingen)**\n`;
      }
    } catch (err) {
      console.warn('Kon fabrieksstructuur niet laden voor capaciteitscontext:', err);
      dailyCapacityHours = 16; // veilig default: 2 ploegen á 8u
      ctx += `- Fabrieksstructuur niet beschikbaar, gebruik default: ${dailyCapacityHours} uur/dag\n`;
    }

    // --- 2. Werkdagen in de komende 3 weken berekenen ---
    const horizon = 21; // dagen vooruit
    const workdays: string[] = [];
    for (let i = 0; i < horizon; i++) {
      const d = new Date(today.getTime() + i * DAY_MS);
      const dow = d.getDay(); // 0=zo, 6=za
      if (dow !== 0 && dow !== 6) {
        workdays.push(d.toISOString().slice(0, 10));
      }
    }
    ctx += `\n### Beschikbare werkdagen (komende 3 weken):\n`;
    ctx += workdays.map(d => `- ${d}`).join('\n') + '\n';
    ctx += `**Totaalaantal werkdagen: ${workdays.length} | Totale capaciteit: ${workdays.length * dailyCapacityHours} uur**\n`;

    // --- 3. Al bezette uren ophalen uit OCCUPANCY ---
    const occupancyByDay: Record<string, number> = {};
    try {
      const occSnap = await getDocs(collection(db, getPathString(PATHS.OCCUPANCY)));
      occSnap.docs.forEach(d => {
        const data = d.data();
        if (data.date && workdays.includes(data.date)) {
          occupancyByDay[data.date] = (occupancyByDay[data.date] || 0) + (Number(data.hours) || 8);
        }
      });
    } catch (err) {
      console.warn('Kon bezetting niet ophalen:', err);
    }

    // --- 4. Geschatte resterende werkuren per lopende order (EFFICIENCY_HOURS) ---
    let totalCommittedHours = 0;
    const behindOrders: any[] = [];
    const activeOrders: any[] = [];
    try {
      const efficiencyRows = await fetchScopedEfficiencyHours({ db, mode: 'active', maxDocs: 100 });
      const trackingSnap = await getDocs(query(collection(db, getPathString(PATHS.TRACKING)), limit(500)));
      const trackingData = trackingSnap.docs.map(d => d.data());

      efficiencyRows.forEach(std => {
        if (!std.orderId) return;

        const relatedLogs = trackingData.filter(t =>
          String(t.orderId || t.orderNumber) === String(std.orderId)
        );

        let actualMinutes = 0;
        let producedQty = 0;
        relatedLogs.forEach(log => {
          if (log.timestamps?.station_start) {
            const start = log.timestamps.station_start.toDate
              ? log.timestamps.station_start.toDate() : new Date(log.timestamps.station_start);
            const end = log.timestamps.completed?.toDate
              ? log.timestamps.completed.toDate()
              : (log.timestamps.finished?.toDate ? log.timestamps.finished.toDate() : new Date());
            if (end.getTime() - start.getTime() > 0) actualMinutes += (end.getTime() - start.getTime()) / 60000;
          }
          if (['completed', 'Finished', 'GEREED'].includes(String(log.status || log.currentStep || log.currentStation))) {
            producedQty++;
          }
        });

        const normPerUnit = Number(std.minutesPerUnit) || 0;
        const totalQty = Number(std.quantity) || 0;
        const remainingQty = Math.max(0, totalQty - producedQty);
        const remainingMinutes = remainingQty * normPerUnit;
        const remainingHours = Math.round(remainingMinutes / 60 * 10) / 10;

        let efficiency = 0;
        if (actualMinutes > 0) {
          const earnedMinutes = producedQty * normPerUnit;
          efficiency = Math.round((earnedMinutes / actualMinutes) * 100);
        }

        const statusLabel = efficiency > 0
          ? (efficiency >= 100 ? 'VOOR op schema' : efficiency >= 85 ? 'OP schema' : 'ACHTER op schema')
          : (producedQty > 0 ? 'Start gemaakt' : 'Nog niet gestart');

        const orderInfo = {
          orderId: std.orderId,
          totalQty,
          producedQty,
          remainingQty,
          remainingHours,
          efficiency,
          status: statusLabel,
          dueDate: std.dueDate || std.deliveryDate || null,
        };

        totalCommittedHours += remainingHours;
        activeOrders.push(orderInfo);
        if (efficiency > 0 && efficiency < 85) behindOrders.push(orderInfo);
      });
    } catch (err) {
      console.warn('Kon efficiency/tracking niet laden voor capaciteitscontext:', err);
    }

    // --- 5. Output: vrije capaciteit ---
    const freeHours = Math.max(0, workdays.length * dailyCapacityHours - totalCommittedHours);
    ctx += `\n### Huidige werkbelasting:\n`;
    ctx += `- Actieve orders totaal resterende uren: **${Math.round(totalCommittedHours)} uur**\n`;
    ctx += `- Vrije capaciteit komende ${workdays.length} werkdagen: **${Math.round(freeHours)} uur**\n`;

    if (activeOrders.length > 0) {
      ctx += `\n### Lopende orders met resterende werkuren:\n`;
      activeOrders.forEach(o => {
        ctx += `- Order ${o.orderId}: ${o.producedQty}/${o.totalQty} stuks, `;
        ctx += `resterend: **${o.remainingHours} uur**, status: ${o.status}`;
        if (o.dueDate) ctx += `, deadline: ${o.dueDate}`;
        ctx += `\n`;
      });
    }

    if (behindOrders.length > 0) {
      ctx += `\n### ⚠️ ORDERS ACHTER OP SCHEMA:\n`;
      behindOrders.forEach(o => {
        ctx += `- Order ${o.orderId}: efficiëntie ${o.efficiency}% — ${o.remainingQty} stuks resterend (${o.remainingHours} uur)\n`;
      });
    } else {
      ctx += `\n### ✅ Geen orders met significante achterstand gevonden.\n`;
    }

    // --- 6. Capaciteitsadvies: beschikbaar venster per dag ---
    ctx += `\n### Dagelijkse capaciteit overzicht (komende 2 weken):\n`;
    workdays.slice(0, 10).forEach(day => {
      const committed = Math.round(occupancyByDay[day] || 0);
      const available = Math.max(0, dailyCapacityHours - committed);
      const date = new Date(day);
      const dayName = date.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
      ctx += `- ${dayName}: ${available} uur beschikbaar (${committed} uur bezet)\n`;
    });

    ctx += '='.repeat(60) + '\n';
    ctx += `\n**INSTRUCTIE VOOR AI:** Gebruik bovenstaande data om:
- Te berekenen of een nieuwe order (bijv. 130 uur) past binnen een gevraagd tijdvenster
- Te adviseren over de meest gunstige startdatum
- Te rapporteren welke orders achterstand hebben
- Spreiding voor te stellen (uren per dag) om deadline te halen\n`;

    return ctx;
  }

  /**
   * Parse what-if/planning scenario uit vrije tekst.
   * Ondersteunt o.a. uitstel in dagen, extra capaciteit en voorrang op orders.
   */
  parsePlanningScenario(query: string) {
    const raw = String(query || '').trim();
    if (!raw) return null;

    const lower = raw.toLowerCase();
    const isScenarioIntent = /(wat\s+als|what\s*if|scenario|stel\s+dat|als\s+we)/i.test(raw);

    const orderIds = [...new Set((raw.match(/\bN\d{5,}\b/gi) || []).map(v => v.toUpperCase()))];

    let delayDays = 0;
    const delayA = lower.match(/(?:uitstel|uitstellen|later|opschuiven|vertragen)\s*(?:met|van)?\s*(\d{1,2})\s*(?:werkdagen|werkdag|dagen|dag|wd)/i);
    const delayB = lower.match(/(\d{1,2})\s*(?:werkdagen|werkdag|dagen|dag|wd)\s*(?:uitstellen|later|opschuiven|vertragen)/i);
    if (delayA?.[1]) delayDays = Number(delayA[1]) || 0;
    else if (delayB?.[1]) delayDays = Number(delayB[1]) || 0;

    let extraCapacityHours = 0;
    const capA = lower.match(/(?:extra|\+)\s*(\d{1,3})\s*(?:uur|uren)/i);
    const capB = lower.match(/(\d{1,3})\s*(?:uur|uren)\s*(?:extra|capaciteit)/i);
    if (capA?.[1]) extraCapacityHours += Number(capA[1]) || 0;
    else if (capB?.[1]) extraCapacityHours += Number(capB[1]) || 0;

    const extraShiftMatch = lower.match(/(\d{1,2})\s*(?:extra\s+)?ploeg(?:en)?/i);
    if (extraShiftMatch?.[1]) {
      extraCapacityHours += (Number(extraShiftMatch[1]) || 0) * 8;
    } else if (/extra\s+ploeg/.test(lower)) {
      extraCapacityHours += 8;
    }

    const prioritizeOrderIds = [...new Set([
      ...((raw.match(/(?:prioriteit|voorrang|eerst)\s*(?:voor|aan)?\s*(N\d{5,})/gi) || [])
        .map(v => (v.match(/N\d{5,}/i)?.[0] || '').toUpperCase())
        .filter(Boolean)),
    ])];

    const hasScenarioData = delayDays > 0 || extraCapacityHours > 0 || prioritizeOrderIds.length > 0;
    if (!isScenarioIntent && !hasScenarioData) return null;

    return {
      isScenarioIntent: true,
      orderIds,
      delayOrderIds: orderIds,
      delayDays: Math.max(0, Math.min(30, delayDays)),
      extraCapacityHours: Math.max(0, Math.min(72, extraCapacityHours)),
      prioritizeOrderIds,
      raw,
    };
  }

  /**
   * Voorspellende planning op basis van resterende uren, deadlines en beschikbare dagcapaciteit.
   * Resultaat: ETA per order, risicoscore en prioriteitenlijst.
   */
  async getPredictivePlanningContext(scenario: any = null) {
    let ctx = '\n\n## VOORSPELLENDE PLANNING (ETA + RISICO + PRIORITEIT):\n';
    ctx += '='.repeat(60) + '\n';

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const parseDate = (value: any): Date | null => {
      if (!value) return null;
      const maybeDate = value?.toDate ? value.toDate() : new Date(value);
      if (!(maybeDate instanceof Date) || Number.isNaN(maybeDate.getTime())) return null;
      return maybeDate;
    };

    const weekday = (d: Date) => {
      const day = d.getDay();
      return day !== 0 && day !== 6;
    };

    const addWorkingDays = (start: Date, days: number): Date => {
      const out = new Date(start.getTime());
      if (days <= 0) return out;
      let remaining = days;
      while (remaining > 0) {
        out.setDate(out.getDate() + 1);
        if (weekday(out)) remaining -= 1;
      }
      return out;
    };

    const diffWorkingDays = (fromDate: Date, toDate: Date): number => {
      const start = new Date(fromDate.getTime());
      const end = new Date(toDate.getTime());
      if (end.getTime() <= start.getTime()) return 0;
      let count = 0;
      const cursor = new Date(start.getTime());
      while (cursor.getTime() < end.getTime()) {
        cursor.setDate(cursor.getDate() + 1);
        if (weekday(cursor)) count += 1;
      }
      return count;
    };

    const safeNum = (value: any): number => {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    };

    try {
      // 1) Basis dagcapaciteit uit fabrieksstructuur
      let dailyCapacityHours = 16;
      try {
        const factorySnap = await getDoc(doc(db, getPathString(PATHS.FACTORY_CONFIG)));
        if (factorySnap.exists()) {
          const departments = (factorySnap.data()?.departments || []) as any[];
          const computed = departments.reduce((sum, dept) => {
            const shifts = Number(dept?.shifts) || 1;
            return sum + shifts * 8;
          }, 0);
          if (computed > 0) dailyCapacityHours = computed;
        }
      } catch {
        // Default blijft actief.
      }

      // 2) Real-time bezetting vandaag -> effectieve restcapaciteit
      let occupiedToday = 0;
      try {
        const occSnap = await getDocs(query(collection(db, getPathString(PATHS.OCCUPANCY)), limit(500)));
        const todayIso = new Date().toISOString().slice(0, 10);
        occSnap.docs.forEach((docSnap) => {
          const row = docSnap.data() as Record<string, any>;
          if (String(row.date || '') === todayIso) {
            occupiedToday += safeNum(row.hours || 8);
          }
        });
      } catch {
        // Geen blokkade als bezetting niet leesbaar is.
      }

      const baseDailyCapacity = Math.max(1, Math.round((dailyCapacityHours - Math.min(dailyCapacityHours, occupiedToday)) * 10) / 10);
      const scenarioExtraCapacity = scenario?.extraCapacityHours ? Number(scenario.extraCapacityHours) : 0;
      const effectiveDailyCapacity = Math.max(1, Math.round((baseDailyCapacity + scenarioExtraCapacity) * 10) / 10);
      const loadFactor = dailyCapacityHours > 0
        ? Math.max(0, Math.min(2, occupiedToday / dailyCapacityHours))
        : 1;

      // 3) Werk met efficiency + tracking + planningdata
      const [efficiencyRows, trackingSnap, planningSnap, planningLegacySnap, planningScopedSnap] = await Promise.all([
        fetchScopedEfficiencyHours({ db, mode: 'active', maxDocs: 200 }),
        getDocs(query(collection(db, getPathString(PATHS.TRACKING)), limit(1200))),
        getDocs(query(collection(db, getPathString(PATHS.PLANNING)), limit(600))),
        getDocs(query(collection(db, 'future-factory/production/data/digital_planning/orders'), limit(600))).catch(() => ({ docs: [] } as any)),
        getDocs(query(collectionGroup(db, 'orders'), limit(1800))).catch(() => ({ docs: [] } as any)),
      ]);

      const trackingRows = trackingSnap.docs.map(d => d.data() as Record<string, any>);
      const planningRowsRaw = [
        ...planningSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) })),
        ...(planningLegacySnap?.docs || []).map((d: any) => ({ id: d.id, ...(d.data() as Record<string, any>) })),
        ...(planningScopedSnap?.docs || []).map((d: any) => ({ id: d.id, ...(d.data() as Record<string, any>) })),
      ];
      const planningSeen = new Set<string>();
      const planningRows = planningRowsRaw.filter((row) => {
        const key = String(row.orderId || row.orderNumber || row.id || '').trim();
        const dedupeKey = key || JSON.stringify(row).slice(0, 220);
        if (planningSeen.has(dedupeKey)) return false;
        planningSeen.add(dedupeKey);
        return true;
      });

      const planningByOrder = new Map<string, Record<string, any>>();
      planningRows.forEach((row) => {
        const key = String(row.orderId || row.orderNumber || row.id || '').trim();
        if (key) planningByOrder.set(key, row);
      });

      const predictions = (efficiencyRows as any[])
        .filter(row => row?.orderId)
        .map((row) => {
          const orderId = String(row.orderId);
          const related = trackingRows.filter(r => String(r.orderId || r.orderNumber || '') === orderId);

          let producedQty = 0;
          let actualMinutes = 0;
          related.forEach((log) => {
            const statusTag = String(log.status || log.currentStep || log.currentStation || '').toLowerCase();
            if (statusTag.includes('complete') || statusTag.includes('gereed') || statusTag.includes('finished')) producedQty += 1;

            const start = parseDate(log?.timestamps?.station_start || log?.station_start || log?.startedAt);
            const end = parseDate(log?.timestamps?.completed || log?.timestamps?.finished || log?.completedAt || log?.finishedAt) || new Date();
            if (start && end.getTime() > start.getTime()) {
              actualMinutes += (end.getTime() - start.getTime()) / 60000;
            }
          });

          const normPerUnit = safeNum(row.minutesPerUnit);
          const totalQty = Math.max(0, safeNum(row.quantity));
          const remainingQty = Math.max(0, totalQty - producedQty);
          const remainingHours = normPerUnit > 0
            ? (remainingQty * normPerUnit) / 60
            : Math.max(0, safeNum(row.standardTimeTotal) / 60);

          const earnedMinutes = producedQty * normPerUnit;
          const efficiency = actualMinutes > 0 ? Math.max(30, (earnedMinutes / actualMinutes) * 100) : 100;
          const adjustedHours = remainingHours * (100 / Math.max(30, efficiency));
          let etaWorkDays = Math.max(0, Math.ceil(adjustedHours / effectiveDailyCapacity));

          // Scenario: order bewust uitstellen in werkdagen.
          if (scenario?.delayDays && Array.isArray(scenario?.delayOrderIds) && scenario.delayOrderIds.includes(orderId)) {
            etaWorkDays += Number(scenario.delayDays) || 0;
          }
          const etaDate = addWorkingDays(now, etaWorkDays);

          const plan = planningByOrder.get(orderId) || {};
          const dueDate = parseDate(
            plan.deliveryDate || plan.leverDatum || plan.dueDate || plan.deadline || row.deliveryDate || row.dueDate
          );
          const daysToDeadline = dueDate ? diffWorkingDays(now, dueDate) : null;
          const slackDays = daysToDeadline === null ? null : (daysToDeadline - etaWorkDays);

          let riskScore = 30;
          if (slackDays !== null) {
            if (slackDays < 0) riskScore = 92;
            else if (slackDays === 0) riskScore = 82;
            else if (slackDays <= 1) riskScore = 72;
            else if (slackDays <= 3) riskScore = 58;
            else if (slackDays <= 5) riskScore = 45;
            else riskScore = 30;
          }
          if (efficiency < 80) riskScore += 14;
          else if (efficiency < 90) riskScore += 8;

          if (remainingHours > 120) riskScore += 12;
          else if (remainingHours > 80) riskScore += 8;
          else if (remainingHours > 40) riskScore += 4;

          const completionRatio = totalQty > 0 ? (producedQty / totalQty) : 0;
          if (completionRatio < 0.2 && remainingHours > 30) riskScore += 5;

          if (loadFactor > 0.95) riskScore += 10;
          else if (loadFactor > 0.85) riskScore += 6;

          if (!dueDate && remainingHours > 60) riskScore += 10;

          if (Array.isArray(scenario?.prioritizeOrderIds) && scenario.prioritizeOrderIds.includes(orderId)) {
            riskScore = Math.max(riskScore, 88);
          }

          riskScore = Math.max(5, Math.min(99, Math.round(riskScore)));

          const priority = riskScore >= 85
            ? 'NU STARTEN'
            : riskScore >= 68
              ? 'HOGE PRIORITEIT'
              : riskScore >= 48
                ? 'NORMALE PRIORITEIT'
                : 'KAN WACHTEN';

          return {
            orderId,
            producedQty,
            totalQty,
            remainingQty,
            remainingHours: Math.round(adjustedHours * 10) / 10,
            etaWorkDays,
            etaDate,
            dueDate,
            efficiency: Math.round(efficiency),
            riskScore,
            priority,
            slackDays,
          };
        })
        .filter(p => p.remainingHours > 0)
        .sort((a, b) => b.riskScore - a.riskScore)
        .slice(0, 20);

      if (scenario) {
        ctx += '\n### Scenario actief:\n';
        ctx += `- Input: "${clamp(String(scenario.raw || ''), 200)}"\n`;
        if (scenario.delayDays > 0 && scenario.delayOrderIds?.length) {
          ctx += `- Uitstel: ${scenario.delayOrderIds.join(', ')} met ${scenario.delayDays} werkdag(en)\n`;
        }
        if (scenario.extraCapacityHours > 0) {
          ctx += `- Extra capaciteit: +${scenario.extraCapacityHours} uur/dag\n`;
        }
        if (scenario.prioritizeOrderIds?.length) {
          ctx += `- Handmatige voorrang: ${scenario.prioritizeOrderIds.join(', ')}\n`;
        }
      }

      ctx += `- Dagcapaciteit model: ${dailyCapacityHours} uur\n`;
      ctx += `- Bezet vandaag: ${Math.round(occupiedToday)} uur\n`;
      ctx += `- Basiscapaciteit na bezetting: ${baseDailyCapacity} uur\n`;
      ctx += `- Effectieve planningscapaciteit vandaag: ${effectiveDailyCapacity} uur\n`;

      if (predictions.length === 0) {
        ctx += '- Geen actieve orders met voorspelbare resterende uren gevonden.\n';
      } else {
        ctx += '\n### ETA & Risico per order (top op urgentie):\n';
        predictions.forEach((p) => {
          const etaText = p.etaDate.toLocaleDateString('nl-NL');
          const dueText = p.dueDate ? p.dueDate.toLocaleDateString('nl-NL') : 'onbekend';
          const slackText = p.slackDays === null ? 'onbekend' : `${p.slackDays} wd`; 
          ctx += `- ${p.orderId}: ${p.priority}, risico ${p.riskScore}/100, ETA ${etaText}, deadline ${dueText}, slack ${slackText}, resterend ${p.remainingHours}u, voortgang ${p.producedQty}/${p.totalQty}, eff ${p.efficiency}%\n`;
        });

        const nowStart = predictions.filter(p => p.priority === 'NU STARTEN').slice(0, 5);
        const high = predictions.filter(p => p.priority === 'HOGE PRIORITEIT').slice(0, 5);
        const wait = predictions.filter(p => p.priority === 'KAN WACHTEN').slice(0, 5);

        ctx += '\n### Prioriteitenlijst:\n';
        if (nowStart.length) {
          ctx += '- NU STARTEN: ' + nowStart.map(p => p.orderId).join(', ') + '\n';
        }
        if (high.length) {
          ctx += '- HOGE PRIORITEIT: ' + high.map(p => p.orderId).join(', ') + '\n';
        }
        if (wait.length) {
          ctx += '- KAN WACHTEN: ' + wait.map(p => p.orderId).join(', ') + '\n';
        }
      }

      ctx += '\n**INSTRUCTIE VOOR AI:** Gebruik ETA, risicoscore en prioriteit expliciet in advies. Geef concrete herplanning (welke order eerst, hoeveel uren per dag, en welke deadline risico loopt).\n';
      ctx += '='.repeat(60) + '\n';
      return clamp(ctx, 5200);
    } catch (error) {
      console.warn('Kon voorspellende planning niet opbouwen:', getErrorMessage(error));
      return '\n\n## VOORSPELLENDE PLANNING:\n- Niet beschikbaar door een databasefout.\n';
    }
  }

  /**
   * Extract belangrijke zoektermen uit een vraag
   * Verwijdert stopwoorden en haalt key terms eruit
   */
  extractSearchTerms(query: string) {
    // Stopwoorden die we willen negeren
    const stopWords = ['wat', 'weet', 'je', 'van', 'over', 'vertel', 'me', 'het', 'de', 'een', 'is', 'zijn', 'heeft', 'kan', 'waar', 'hoe', 'welke', 'informatie', 'document'];
    
    // Split query in woorden
    const words = query.toLowerCase()
      .replace(/[?!.,;]/g, '') // Verwijder punctuatie
      .split(/\s+/);
    
    // Filter stopwoorden en korte woorden
    const importantWords = words.filter(word => 
      word.length >= 3 && !stopWords.includes(word)
    );
    
    // Return unieke termen
    return [...new Set(importantWords)];
  }

  /**
   * Extraheer herkenbare entiteiten uit de vraag:
   * ordernummers, itemcodes/sku-achtige tokens en maatwaarden.
   */
  extractEntityTokens(query: string) {
    const raw = String(query || '');
    const orderIds = [...new Set((raw.match(/\bN\d{5,}\b/gi) || []).map(v => v.toUpperCase()))];
    const lotIds = [...new Set((raw.match(/\b\d{10,20}\b/g) || []).map(v => v.trim()))];
    const codeTokens = [...new Set(
      (raw.match(/\b[A-Z]{1,4}[-_]?\d{2,}[A-Z0-9_-]*\b/g) || [])
        .map(v => v.toUpperCase())
    )];

    const dimensions = [...new Set(
      (raw.match(/\b\d{1,4}(?:[.,]\d+)?\s?(?:mm|cm|m|inch|in)\b/gi) || [])
        .map(v => v.toLowerCase().replace(/\s+/g, ''))
    )];

    const numericHints = [...new Set(
      (raw.match(/\b\d{2,5}(?:[.,]\d+)?\b/g) || []).map(v => v.replace(',', '.'))
    )];

    return { orderIds, lotIds, codeTokens, dimensions, numericHints };
  }

  /**
   * Compacte live snapshot die ALTIJD wordt toegevoegd,
   * zodat de AI basis-inzicht heeft in orders/capaciteit/voorraad.
   */
  async getOperationalSnapshotContext() {
    try {
      const thisYear = new Date().getFullYear();
      const [planningSnap, planningLegacySnap, planningScopedSnap, trackingSnap, trackingScopedItemsSnap, occupancySnap, inventorySnap, archiveCurrentYearSnap, archivePrevYearSnap] = await Promise.all([
        getDocs(query(collection(db, getPathString(PATHS.PLANNING)), limit(250))),
        getDocs(query(collection(db, 'future-factory/production/data/digital_planning/orders'), limit(250))).catch(() => ({ docs: [] } as any)),
        getDocs(query(collectionGroup(db, 'orders'), limit(800))).catch(() => ({ docs: [] } as any)),
        getDocs(query(collection(db, getPathString(PATHS.TRACKING)), limit(1200))),
        getDocs(query(collectionGroup(db, 'items'), limit(3000))).catch(() => ({ docs: [] } as any)),
        getDocs(query(collection(db, getPathString(PATHS.OCCUPANCY)), limit(200))),
        getDocs(query(collection(db, getPathString(PATHS.INVENTORY)), limit(200))),
        getDocs(query(collection(db, getPathString(getPlanningArchivePath(thisYear))), limit(2500))).catch(() => ({ docs: [] } as any)),
        getDocs(query(collection(db, getPathString(getPlanningArchivePath(thisYear - 1))), limit(2500))).catch(() => ({ docs: [] } as any)),
      ]);

      const planningRowsRaw = [
        ...planningSnap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) })),
        ...(planningLegacySnap?.docs || []).map((d: any) => ({ id: d.id, ...(d.data() as Record<string, any>) })),
        ...(planningScopedSnap?.docs || []).map((d: any) => ({ id: d.id, ...(d.data() as Record<string, any>) })),
      ];
      const planningSeen = new Set<string>();
      const planningRows = planningRowsRaw.filter((row) => {
        const key = String(row.orderId || row.orderNumber || row.id || '').trim();
        const dedupeKey = key || JSON.stringify(row).slice(0, 220);
        if (planningSeen.has(dedupeKey)) return false;
        planningSeen.add(dedupeKey);
        return true;
      });

      const trackingRowsRaw = [
        ...trackingSnap.docs.map((d) => ({
          id: d.id,
          __path: String((d as any)?.ref?.path || ''),
          ...(d.data() as Record<string, any>),
        })),
        ...(trackingScopedItemsSnap?.docs || [])
          .map((d: any) => ({
            id: d.id,
            __path: String(d?.ref?.path || ''),
            ...(d.data() as Record<string, any>),
          }))
          .filter((row: any) => row.__path.includes('/production/tracked_products/')),
      ];

      const trackingSeen = new Set<string>();
      const trackingRows = trackingRowsRaw.filter((row) => {
        const lot = String(row.lotNumber || row.lot || row.batchNumber || row.batch || row.id || '').trim();
        const path = String(row.__path || '').trim();
        const dedupeKey = path || lot || JSON.stringify(row).slice(0, 220);
        if (trackingSeen.has(dedupeKey)) return false;
        trackingSeen.add(dedupeKey);
        return true;
      });
      const occupancyRows = occupancySnap.docs.map(d => d.data() as Record<string, any>);
      const inventoryRows = inventorySnap.docs.map(d => d.data() as Record<string, any>);

      const isCompleted = (value: any) => {
        const v = String(value || '').toLowerCase();
        return v.includes('complete') || v.includes('gereed') || v.includes('finished') || v === 'done';
      };

      const hasStartSignal = (row: Record<string, any>) => {
        return !!(
          row?.timestamps?.station_start ||
          row?.timestamps?.started ||
          row?.station_start ||
          row?.startedAt ||
          row?.startTime ||
          row?.timestamp ||
          row?.createdAt ||
          row?.updatedAt
        );
      };

      const hasEndSignal = (row: Record<string, any>) => {
        return !!(
          row?.timestamps?.completed ||
          row?.timestamps?.finished ||
          row?.completedAt ||
          row?.finishedAt ||
          row?.endTime
        );
      };

      const getLotNumber = (row: Record<string, any>) => String(
        row?.lotNumber || row?.lot || row?.batchNumber || row?.batch || row?.lotId || ''
      ).trim();

      const normalize = (value: any) => String(value || '').toLowerCase().trim().replace(/[\s-]+/g, '_');

      const isActiveTrackedStatus = (row: Record<string, any>) => {
        const status = normalize(row?.status);
        const step = normalize(row?.currentStep);
        const station = normalize(row?.currentStation || row?.machine || row?.originMachine);

        const activeTokens = [
          'new', 'todo', 'to_do', 'te_doen', 'in_behandeling', 'processing',
          'running', 'lopend', 'ingepland', 'gereed_voor_productie', 'productie',
          'started', 'gestart', 'in_progress', 'busy',
        ];

        return activeTokens.some((token) =>
          status.includes(token) || step.includes(token) || station.includes(token)
        );
      };

      const activeTrackingRows = trackingRows.filter((row) => {
        if (isCompleted(row.status) || isCompleted(row.currentStep) || isCompleted(row.currentStation)) return false;
        const lot = getLotNumber(row);
        if (!lot) return false;
        if (hasEndSignal(row)) return false;
        return hasStartSignal(row) || isActiveTrackedStatus(row);
      });

      const activeOrderIdsFromLots = new Set<string>();
      activeTrackingRows.forEach((row) => {
        const orderId = String(row.orderId || row.orderNumber || '').trim();
        if (orderId) activeOrderIdsFromLots.add(orderId);
      });

      const activeOrders = planningRows.filter((r) => {
        const orderId = String(r.orderId || r.orderNumber || r.id || '').trim();
        return orderId ? activeOrderIdsFromLots.has(orderId) : false;
      });
      const completedOrders = planningRows.filter(r => isCompleted(r.status) || isCompleted(r.currentStep));
      const archivedCompletedCount = (archiveCurrentYearSnap?.docs?.length || 0) + (archivePrevYearSnap?.docs?.length || 0);

      const today = new Date().toISOString().slice(0, 10);
      const activeOperatorsToday = occupancyRows.filter(r => String(r.date || '') === today).length;
      const hoursToday = occupancyRows
        .filter(r => String(r.date || '') === today)
        .reduce((sum, row) => sum + (Number(row.hours) || 8), 0);

      const lowStock = inventoryRows.filter(r => {
        const qty = Number(r.quantity ?? r.stock ?? 0);
        const min = Number(r.minStock ?? r.minimumStock ?? 0);
        return Number.isFinite(min) && min > 0 && qty <= min;
      });

      const activeTrackingByOrder = new Map<string, number>();
      activeTrackingRows.forEach((row) => {
        const orderId = String(row.orderId || row.orderNumber || '').trim();
        if (!orderId) return;
        activeTrackingByOrder.set(orderId, (activeTrackingByOrder.get(orderId) || 0) + 1);
      });

      const parseDateSafe = (value: any): Date | null => {
        if (!value) return null;
        const d = value?.toDate ? value.toDate() : new Date(value);
        if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
        return d;
      };

      const formatDateTime = (value: Date | null): string => {
        if (!value) return 'onbekend';
        return value.toLocaleString('nl-NL', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      };

      const formatDateOnly = (value: Date | null): string => {
        if (!value) return 'onbekend';
        return value.toLocaleDateString('nl-NL', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
      };

      const planningByOrder = new Map<string, Record<string, any>>();
      planningRows.forEach((row) => {
        const key = String(row.orderId || row.orderNumber || row.id || '').trim();
        if (key && !planningByOrder.has(key)) planningByOrder.set(key, row);
      });

      const hotOrders = [...activeTrackingByOrder.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      let ctx = '\n\n## LIVE OPERATIE SNAPSHOT (ALTIJD MEENEMEN):\n';
      ctx += `- Planning orders totaal: ${planningRows.length}\n`;
      ctx += `- Lopende orders (actieve lotnummers): ${activeOrderIdsFromLots.size}\n`;
      ctx += `- Actieve lotnummers in uitvoering: ${activeTrackingRows.length}\n`;
      ctx += `- Gemaakte orders (actief pad): ${completedOrders.length}\n`;
      ctx += `- Gearchiveerde afgeronde orders (dit+vorig jaar): ${archivedCompletedCount}\n`;
      ctx += `- Tracking records totaal: ${trackingRows.length}\n`;
      ctx += `- Tracking bron: root + scoped items\n`;
      ctx += `- Actieve operators vandaag: ${activeOperatorsToday}\n`;
      ctx += `- Ingeplande/bezette uren vandaag: ${Math.round(hoursToday)} uur\n`;
      ctx += `- Catalogus items (sample): ${inventoryRows.length}\n`;
      ctx += `- Lage voorraad items (sample): ${lowStock.length}\n`;

      if (hotOrders.length > 0) {
        ctx += '\nTop lopende orders o.b.v. actieve lotnummers:\n';
        hotOrders.forEach(([orderId, count]) => {
          const plan = planningByOrder.get(orderId) || {};
          const relatedLots = activeTrackingRows.filter((r) => String(r.orderId || r.orderNumber || '').trim() === orderId);
          const lotNumbers = [...new Set(relatedLots.map((r) => getLotNumber(r)).filter(Boolean))];

          const product = String(
            plan.item || plan.itemDescription || plan.productName || plan.product || plan.itemCode ||
            relatedLots[0]?.item || relatedLots[0]?.itemDescription || relatedLots[0]?.productName || relatedLots[0]?.itemCode ||
            'onbekend'
          ).trim();

          const startCandidates = relatedLots
            .map((r) => parseDateSafe(r?.timestamps?.station_start || r?.timestamps?.started || r?.startedAt || r?.startTime || r?.createdAt || r?.updatedAt))
            .filter((d): d is Date => !!d)
            .sort((a, b) => a.getTime() - b.getTime());
          const startedAt = startCandidates[0] || null;

          const dueDate = parseDateSafe(
            plan.deliveryDate || plan.leverDatum || plan.dueDate || plan.deadline || plan.plannedDeliveryDate
          );

          const etaDate = parseDateSafe(
            plan.estimatedDeliveryDate || plan.expectedDeliveryDate || plan.predictedDeliveryDate || plan.eta ||
            plan.estimatedEnd || plan.estimatedCompletionDate
          );

          const lotsPreview = lotNumbers.slice(0, 6).join(', ');
          const lotsSuffix = lotNumbers.length > 6 ? ' …' : '';

          ctx += `- ${orderId}: ${count} actieve lotrecords | lotnummers: ${lotsPreview || 'onbekend'}${lotsSuffix} | product: ${product} | gestart: ${formatDateTime(startedAt)} | leverdatum: ${formatDateOnly(dueDate)} | geschatte leverdatum: ${formatDateOnly(etaDate)}\n`;
        });
      }

      ctx += '\nDefinitie: Lopend = order met minimaal 1 actief lotnummer (gestart, nog niet afgerond).\n';
      ctx += 'Bij detailvragen over een order: geef altijd lotnummers, product, startmoment, leverdatum en geschatte leverdatum uit bovenstaande regels.\n';

      return clamp(ctx, 4200);
    } catch (error) {
      console.warn('Kon live operatie snapshot niet laden:', getErrorMessage(error));
      return '\n\n## LIVE OPERATIE SNAPSHOT:\n- Niet beschikbaar door een databasefout.\n';
    }
  }

  composeSystemPrompt(basePrompt: string, dbContext: string) {
    const base = String(basePrompt || '');
    const ctx = String(dbContext || '');
    if (!ctx.trim()) return clamp(base, SYSTEM_PROMPT_BUDGET);

    const ctxBudget = Math.min(7000, Math.floor(SYSTEM_PROMPT_BUDGET * 0.62));
    const baseBudget = SYSTEM_PROMPT_BUDGET - ctxBudget;

    const trimmedContext = clamp(ctx, ctxBudget);
    const trimmedBase = clamp(base, baseBudget);

    return `${trimmedContext}\n\n## BASISINSTRUCTIES\n${trimmedBase}`;
  }

  /**
   * Zoek in AI documenten op basis van zoekterm
   * @param {string} searchTerm - Zoekterm
   * @returns {Promise<Array>} Gevonden documenten
   */
  async searchAiDocuments(searchTerm: string): Promise<AiDocument[]> {
    try {
      const docs = await this.getAiDocuments(30);
      console.log(`📑 searchAiDocuments: ${docs.length} totale documenten beschikbaar`);
      
      if (docs.length === 0) {
        console.warn('⚠️ Geen documenten in database!');
        return [];
      }
      
      // Extracteer belangrijke zoektermen
      const searchTerms = this.extractSearchTerms(searchTerm);
      console.log(`🔍 Zoektermen geëxtraheerd:`, searchTerms);
      
      // Als geen goede termen, gebruik originele search term
      if (searchTerms.length === 0) {
        searchTerms.push(searchTerm.toLowerCase());
      }
      
      const results = docs.filter((docItem) => {
        // Zoek in alle relevante velden inclusief fullText
        const searchableContent = {
          name: docItem.fileName || '',
          summary: docItem.analysis?.summary || '',
          keyFacts: docItem.analysis?.keyFacts || [],
          tags: docItem.analysis?.tags || [],
          fullContext: docItem.analysis?.fullContext || '',
          processes: docItem.analysis?.processes || [],
          partNumbers: docItem.analysis?.partNumbers || [],
          fullTextSnippet: docItem.fullText?.substring(0, 5000) || ''
        };
        
        const haystack = JSON.stringify(searchableContent).toLowerCase();
        
        // Check of ENIGE zoekterm matcht
        const found = searchTerms.some(term => haystack.includes(term));
        
        if (found) {
          console.log(`✅ Match gevonden in: ${docItem.fileName} (matched terms: ${searchTerms.filter(t => haystack.includes(t)).join(', ')})`);
        }
        
        return found;
      });
      
      console.log(`📊 Search voor "${searchTerm}": ${results.length} resultaten`);
      return results;
    } catch (error) {
      console.error('Error searching AI documents:', error);
      return [];
    }
  }

  /**
   * Zoek catalog producten op naam, maten of toleranties
   * @param {string} searchTerm - Zoekterm
   * @returns {Promise<Array>} Gevonden producten
   */
  async searchCatalogProducts(searchTerm: string): Promise<CatalogProduct[]> {
    try {
      const products = await this.getCatalogProducts(100);
      const term = searchTerm.toLowerCase().trim();
      const tokens = this.extractSearchTerms(searchTerm);
      const entities = this.extractEntityTokens(searchTerm);
      const allTerms = [...new Set([
        term,
        ...tokens,
        ...entities.orderIds.map(v => v.toLowerCase()),
        ...entities.codeTokens.map(v => v.toLowerCase()),
        ...entities.dimensions,
        ...entities.numericHints,
      ].filter(Boolean))];

      return products.filter(product => {
        const codeCandidates = [
          product.sku,
          (product as any).itemCode,
          (product as any).articleCode,
          (product as any).extraCode,
          (product as any).extraCodes,
          (product as any).partNumber,
          (product as any).drawingNumber,
        ].filter(Boolean).map(v => String(v).toLowerCase());

        const haystack = JSON.stringify({
          name: product.name || '',
          description: product.description || '',
          codeCandidates,
          specifications: product.specifications || '',
          tolerance: product.tolerance || '',
          toleranceRange: product.toleranceRange || '',
          dimensions: [product.diameter, product.length, product.width, product.height],
          raw: product,
        }).toLowerCase();

        return allTerms.some(t => haystack.includes(String(t).toLowerCase()));
      });
    } catch (error) {
      console.error('Error searching catalog products:', error);
      return [];
    }
  }

  /**
   * Get relevante data context voor AI op basis van query
   * @param {string} userQuery - De gebruikersvraag
   * @returns {Promise<string>} Geformateerde context string
   */
  async getRelevantContext(userQuery: string) {
    try {
      let contextData = '';
      const queryStr = userQuery.toLowerCase();
      const entities = this.extractEntityTokens(userQuery);
      const scenario = this.parsePlanningScenario(userQuery);
      
      console.log('🔍 AI Context: Zoeken naar:', userQuery);

      // ALTIJD eerst een compacte live snapshot toevoegen.
      try {
        contextData += await this.getOperationalSnapshotContext();
      } catch (err) {
        console.warn('Kon operationele snapshot niet toevoegen:', err);
      }

      // GEHEUGEN: Eerder geleerde feiten uit goedgekeurde antwoorden
      try {
        const memories = await this.getRelevantMemories(userQuery);
        if (memories.length > 0) {
          contextData += '\n\n## GELEERD GEHEUGEN (goedgekeurde antwoorden):\n';
          memories.forEach(mem => {
            contextData += `- **${mem.topic}**: ${mem.content}\n`;
          });
          contextData += '\n';
          console.log(`🧠 ${memories.length} geheugen-item(s) gevonden voor context`);
        }
      } catch (err) { console.warn('Kon geheugen niet laden voor context:', err); }

      // EERSTE: Probeer ALTIJD document context te vinden
      // Doe een brede zoekactie in alle documenten
      const docs = await this.searchAiDocuments(userQuery);
      console.log(`📚 Document search resultaten: ${docs.length} documenten gevonden`);
      
      if (docs.length > 0) {
        console.log('📚 Gevonden documenten:', docs.map(d => `"${d.fileName}" (${d.characterCount || 0} chars)`).join(', '));
        contextData += `\n\n${i18n.t("ai.context.relevant_docs", "📚 RELEVANTE DOCUMENTEN:")}\n`;
        contextData += '='.repeat(60) + '\n';

        docs.slice(0, 3).forEach((docItem, idx) => {
          console.log(`  📄 Document ${idx + 1}: ${docItem.fileName}, parsed: ${docItem.parsed}, has fullText: ${!!docItem.fullText}`);
          contextData += `\n[Document ${idx + 1}]\n`;
          contextData += `Bestand: ${docItem.fileName || 'Onbekend'}\n`;
          if (docItem.analysis?.title) contextData += `Titel: ${docItem.analysis.title}\n`;
          if (docItem.analysis?.summary) contextData += `Samenvatting: ${docItem.analysis.summary}\n`;
          
          // Voeg fullContext toe als die beschikbaar is voor uitgebreidere informatie
          if (docItem.analysis?.fullContext) {
            contextData += `Volledige Context: ${docItem.analysis.fullContext}\n`;
          }
          
          if (docItem.analysis?.keyFacts?.length) contextData += `Kernpunten: ${docItem.analysis.keyFacts.join('; ')}\n`;
          if (docItem.analysis?.processes?.length) contextData += `Processen: ${docItem.analysis.processes.join('; ')}\n`;
          if (docItem.analysis?.partNumbers?.length) contextData += `Part Numbers: ${docItem.analysis.partNumbers.join(', ')}\n`;
          if (docItem.analysis?.tolerances?.length) contextData += `Toleranties: ${docItem.analysis.tolerances.join('; ')}\n`;
          if (docItem.analysis?.warnings?.length) contextData += `Waarschuwingen: ${docItem.analysis.warnings.join('; ')}\n`;
          if (docItem.analysis?.tags?.length) contextData += `Tags: ${docItem.analysis.tags.join(', ')}\n`;
          
          // Als fullText beschikbaar is, voeg een deel toe (max 5000 chars per document)
          if (docItem.fullText) {
            const textSnippet = docItem.fullText.slice(0, 5000);
            contextData += `\nDocument Text Excerpt:\n${textSnippet}\n`;
            if (docItem.fullText.length > 5000) {
              contextData += `... (${docItem.fullText.length - 5000} meer karakters beschikbaar)\n`;
            }
          }
        });

        contextData += '\n' + '='.repeat(60) + '\n';
      }
      
      // Controleer altijd op ordernummers of productie gerelateerde vragen
      const isOrderRelated = queryStr.includes('order') || 
                            queryStr.includes('n2') || 
                            queryStr.includes('status') ||
                            queryStr.includes('klaar') ||
                            queryStr.includes('gereed') ||
                            queryStr.includes('hoeveel') ||
                            queryStr.includes('productie') ||
                            queryStr.includes('progress') ||
                            queryStr.includes('nog') ||
                            queryStr.includes('gemaakt') ||
                            queryStr.includes('lot') ||
                            /\b\d{10,20}\b/.test(queryStr) ||
                            entities.orderIds.length > 0 ||
                            entities.lotIds.length > 0 ||
                            entities.codeTokens.length > 0;
      
      if (isOrderRelated || queryStr.includes('product')) {
        const orders = await this.searchProductionOrders(userQuery);
        console.log('📦 Orders gevonden:', orders.length);
        
        if (orders.length > 0) {
          contextData += `\n\n${i18n.t("ai.context.prod_orders", "📦 PRODUCTIE ORDER INFORMATIE:")}\n`;
          contextData += '='.repeat(60) + '\n';
          
          orders.slice(0, 3).forEach((order, idx) => {
            contextData += `\n[Order ${idx + 1}]\n`;
            contextData += `Ordernummer: ${order.orderId || order.orderNumber || order.id || 'N/A'}\n`;
            if (order.lotNumber) contextData += `Lotnummer: ${order.lotNumber}\n`;
            
            if (order.name) contextData += `Product Naam: ${order.name}\n`;
            if (order.sku) contextData += `SKU: ${order.sku}\n`;
            if (order.description) contextData += `Beschrijving: ${order.description}\n`;
            
            // Status informatie
            if (order.status) contextData += `Status: ${order.status}\n`;
            if (order.workstation) contextData += `Werkstation: ${order.workstation}\n`;
            if (order.operator) contextData += `Operator: ${order.operator}\n`;
            
            // Hoeveelheid informatie - KRITIEK
            if (order.quantity !== undefined) {
              contextData += `Total Hoeveelheid: ${order.quantity} stuks\n`;
            }
            if (order.completed !== undefined) {
              contextData += `Afgerond: ${order.completed} stuks\n`;
            }
            if (order.remaining !== undefined) {
              contextData += `Nog te doen: ${order.remaining} stuks\n`;
            } else if (order.quantity && order.completed) {
              const remaining = Number(order.quantity) - Number(order.completed);
              contextData += `Nog te doen: ${remaining} stuks\n`;
            }
            
            // Progress percentage
            if (order.progress !== undefined) {
              contextData += `Progress: ${order.progress}%\n`;
            } else if (order.quantity && order.completed) {
              const percent = Math.round((Number(order.completed) / Number(order.quantity)) * 100);
              contextData += `Progress: ${percent}%\n`;
            }
            
            // Datum informatie
            if (order.startDate) contextData += `Startdatum: ${order.startDate}\n`;
            if (order.dueDate) contextData += `Vervaldatum: ${order.dueDate}\n`;
            if (order.completedDate) contextData += `Voltooid op: ${order.completedDate}\n`;
            
            // Technische specs
            if (order.specifications) contextData += `Specificaties: ${JSON.stringify(order.specifications)}\n`;
            if (order.tolerances) contextData += `Toleranties: ${JSON.stringify(order.tolerances)}\n`;
            
            // Kwaliteit/QC info
            if (order.qualityStatus) contextData += `Kwaliteit Status: ${order.qualityStatus}\n`;
            if (order.defects) contextData += `Geconstateerde afwijkingen: ${order.defects}\n`;
            if (order.notes) contextData += `Opmerkingen: ${order.notes}\n`;
            
            // Alle overige velden als fallback
            Object.keys(order).forEach(key => {
                if (!['id', 'orderId', 'orderNumber', 'lotNumber', 'name', 'sku', 'description', 'status', 'workstation', 
                    'operator', 'quantity', 'completed', 'remaining', 'progress', 'startDate',
                    'dueDate', 'completedDate', 'specifications', 'tolerances', 'qualityStatus',
                    'defects', 'notes'].includes(key)) {
                const value = order[key];
                if (value !== null && value !== undefined && value !== '') {
                  contextData += `${key}: ${JSON.stringify(value)}\n`;
                }
              }
            });
          });
          
          contextData += '\n' + '='.repeat(60) + '\n';
        } else {
          console.log('⚠️ Geen orders gevonden voor:', userQuery);
          contextData += `\n\n${i18n.t("ai.context.no_orders_found", "⚠️ Geen productie orders gevonden in database voor:")} ${userQuery}\n`;
        }
      }

      // Vragen over meest recente lot / laatste activiteit
      const isRecentQuery = queryStr.includes('laatste') ||
                            queryStr.includes('recent') ||
                            queryStr.includes('nieuwste') ||
                            queryStr.includes('laats') ||
                            (queryStr.includes('lot') && (queryStr.includes('welk') || queryStr.includes('wat') || queryStr.includes('nummer')));

      if (isRecentQuery) {
        try {
          const recent = await this.getRecentProductionActivity(10);
          if (recent.length > 0) {
            contextData += `\n\n📋 RECENTSTE PRODUCTIE ACTIVITEIT:\n`;
            contextData += '='.repeat(60) + '\n';

            recent.slice(0, 5).forEach((item, idx) => {
              contextData += `\n[Activiteit ${idx + 1}]\n`;
              const orderId = item.orderId || item.orderNumber || item.id || 'N/A';
              contextData += `Order: ${orderId}\n`;

              const lotNr = item.lotNumber || item.lot || item.batchNumber || item.batch || item.lotId;
              if (lotNr) contextData += `Lotnummer: ${lotNr}\n`;

              const productName = item.name || item.productName || item.title || item.itemCode;
              if (productName) contextData += `Product: ${productName}\n`;
              if (item.sku) contextData += `SKU: ${item.sku}\n`;

              const ts = item.timestamp || item.createdAt || item.updatedAt || item.completedAt;
              if (ts) {
                const date = ts?.toDate ? ts.toDate().toLocaleString('nl-NL') : new Date(ts).toLocaleString('nl-NL');
                contextData += `Tijdstip: ${date}\n`;
              }

              if (item.status) contextData += `Status: ${item.status}\n`;
              if (item.operator) contextData += `Operator: ${item.operator}\n`;
              if (item.workstation || item.workcenter) contextData += `Werkstation: ${item.workstation || item.workcenter}\n`;
            });

            contextData += '\n' + '='.repeat(60) + '\n';
          }
        } catch (err) {
          console.warn('Kon recente activiteit niet laden:', err);
        }
      }

      // Vragen over productie tijden / uren / efficiëntie
      const isTimeQuery = queryStr.includes('tijd') ||
                          queryStr.includes('uren') ||
                          queryStr.includes('uur') ||
                          queryStr.includes('effici') ||
                          queryStr.includes('hoelang') ||
                          queryStr.includes('duur') ||
                          queryStr.includes('cyclustijd') ||
                          queryStr.includes('bewerkingstijd') ||
                          queryStr.includes('instelttijd') ||
                          queryStr.includes('takt');

      if (isTimeQuery) {
        try {
          const times = await this.getProductionTimes(20);
          if (times.length > 0) {
            contextData += `\n\n⏱️ PRODUCTIE TIJDEN:\n`;
            contextData += '='.repeat(60) + '\n';

            times.slice(0, 10).forEach((item, idx) => {
              contextData += `\n[Tijdregistratie ${idx + 1}]\n`;
              const productName = item.name || item.productName || item.itemCode || item.sku;
              if (productName) contextData += `Product: ${productName}\n`;
              const orderId = item.orderId || item.orderNumber || item.id || 'N/A';
              contextData += `Order: ${orderId}\n`;
              if (item.workstation || item.workcenter) contextData += `Werkstation: ${item.workstation || item.workcenter}\n`;
              if (item.operator) contextData += `Operator: ${item.operator}\n`;
              if (item.duration !== undefined) contextData += `Duur: ${item.duration} min\n`;
              if (item.setupTime !== undefined) contextData += `Instelttijd: ${item.setupTime} min\n`;
              if (item.cycleTime !== undefined) contextData += `Cyclustijd: ${item.cycleTime} sec\n`;
              if (item.totalTime !== undefined) contextData += `Totale tijd: ${item.totalTime} min\n`;
              if (item.startTime) contextData += `Starttijd: ${item.startTime}\n`;
              if (item.endTime) contextData += `Eindtijd: ${item.endTime}\n`;
              if (item.quantity !== undefined) contextData += `Aantal: ${item.quantity}\n`;
              if (item.efficiency !== undefined) contextData += `Efficiëntie: ${item.efficiency}%\n`;
              const ts = item.timestamp || item.createdAt;
              if (ts) {
                const date = ts?.toDate ? ts.toDate().toLocaleString('nl-NL') : new Date(ts).toLocaleString('nl-NL');
                contextData += `Datum: ${date}\n`;
              }
              Object.keys(item).forEach(key => {
                if (!['id', 'orderId', 'orderNumber', 'name', 'productName', 'itemCode', 'sku',
                       'workstation', 'workcenter', 'operator', 'duration', 'setupTime', 'cycleTime',
                       'totalTime', 'startTime', 'endTime', 'quantity', 'efficiency', 'timestamp',
                       'createdAt', 'source'].includes(key)) {
                  const value = item[key];
                  if (value !== null && value !== undefined && value !== '') {
                    contextData += `${key}: ${JSON.stringify(value)}\n`;
                  }
                }
              });
            });

            contextData += '\n' + '='.repeat(60) + '\n';
          }
        } catch (err) {
          console.warn('Kon productie tijden niet laden:', err);
        }
      }

      // Vragen over capaciteitsplanning, werkdruk, achterstand, inplannen
      const isCapacityQuery =
        queryStr.includes('werkuur') || queryStr.includes('werkuren') ||
        queryStr.includes('capaciteit') || queryStr.includes('werkdruk') ||
        queryStr.includes('inplannen') || queryStr.includes('inplan') ||
        queryStr.includes('achterstand') || queryStr.includes('achter') ||
        queryStr.includes('deadline') || queryStr.includes('klaar voor') ||
        queryStr.includes('klaar op') || queryStr.includes('hoeveel uur') ||
        queryStr.includes('beschikbaar') || queryStr.includes('vrije') ||
        queryStr.includes('passen') ||
        /\d+\s*(uur|werkuur|manuur)/i.test(userQuery) ||
        !!scenario;

      if (isCapacityQuery) {
        try {
          console.log('📊 Capaciteitscontext ophalen...');
          const capacityCtx = await this.getCapacityContext();
          contextData += capacityCtx;
          console.log('✅ Capaciteitscontext toegevoegd');
        } catch (err) {
          console.warn('Kon capaciteitscontext niet laden:', err);
        }

        try {
          console.log('🧠 Voorspellende planningscontext ophalen...');
          const predictiveCtx = await this.getPredictivePlanningContext(scenario);
          contextData += predictiveCtx;
          console.log('✅ Voorspellende planningscontext toegevoegd');
        } catch (err) {
          console.warn('Kon voorspellende planning niet laden:', err);
        }
      }

      // Controleer op catalog/maten/toleranties vragen
      if (queryStr.includes('maat') || 
          queryStr.includes('tolerantie') ||
          queryStr.includes('diameter') ||
          queryStr.includes('lengte') ||
          queryStr.includes('catalog') ||
          queryStr.includes('spec') ||
          entities.codeTokens.length > 0 ||
          entities.dimensions.length > 0 ||
          entities.numericHints.length > 0) {
        const products = await this.searchCatalogProducts(userQuery);
        if (products.length > 0) {
          contextData += `\n\n${i18n.t("ai.context.catalog_info", "📋 CATALOGUS PRODUCT INFORMATIE:")}\n`;
          contextData += '='.repeat(60) + '\n';
          
          products.slice(0, 3).forEach((product, idx) => {
            contextData += `\n[Product ${idx + 1}]\n`;
            contextData += `Productnaam: ${product.name || product.sku}\n`;
            
            if (product.sku) contextData += `SKU: ${product.sku}\n`;
            if (product.description) contextData += `Beschrijving: ${product.description}\n`;
            
            // Maten
            if (product.diameter) contextData += `Diameter: ${product.diameter}mm\n`;
            if (product.length) contextData += `Lengte: ${product.length}mm\n`;
            if (product.width) contextData += `Breedte: ${product.width}mm\n`;
            if (product.height) contextData += `Hoogte: ${product.height}mm\n`;
            
            // Toleranties
            if (product.tolerance) contextData += `Tolerantie: ${JSON.stringify(product.tolerance)}\n`;
            if (product.toleranceRange) contextData += `Tolerantie Range: ${product.toleranceRange}\n`;
            
            // Specificaties
            if (product.specifications) {
              contextData += `Specificaties: ${JSON.stringify(product.specifications)}\n`;
            }
            
            // Stock informatie
            if (product.quantity !== undefined) contextData += `Beschikbare Hoeveelheid: ${product.quantity}\n`;
            if (product.minStock) contextData += `Min. Voorraad: ${product.minStock}\n`;
            if (product.reserved) contextData += `Gereserveerd: ${product.reserved}\n`;
          });
          
          contextData += '\n' + '='.repeat(60) + '\n';
        }
      }
      
      contextData = clamp(contextData, 7800);

      console.log('📊 Context data lengte:', contextData.length, 'bytes');
      if (contextData.length > 100) {
        console.log('📋 Context preview:', contextData.substring(0, 200) + '...');
      } else {
        console.log('⚠️ Waarschuwing: Zeer weinig context data!');
      }
      return contextData;
    } catch (error) {
      console.error('Error getting context:', error);
      return `\n\n${i18n.t("ai.context.error", "⚠️ Fout bij ophalen contextgegevens:")} ${getErrorMessage(error)}\n`;
    }
  }

  async getAvailableModel() {
    return this.availableModel;
  }

  async chat(messages: any[], systemPrompt: string | null = null, options = {}) {
    if (!this.isConfigured()) {
      throw new Error(i18n.t("gemini.api_disabled", "AI functionaliteit is uitgeschakeld."));
    }

    if (!auth.currentUser) {
      throw new Error(i18n.t("gemini.auth_required", "Je moet ingelogd zijn om AI te gebruiken."));
    }

    // Haal beschikbare model op
    const modelName = await this.getAvailableModel();

    try {
      return await this.chatGoogle(messages, systemPrompt || '', modelName, options);
    } catch (error) {
      console.error('AI Chat Error:', error);
      throw error;
    }
  }

  /**
   * Enhanced chat met automatische context van productie orders en catalogus
   * @param {Array} messages - Chat messages
   * @param {string} systemPrompt - System prompt
   * @param {boolean} includeContext - Include productie data context
   * @returns {Promise<string>} Response
   */
  async chatWithContext(messages: any[], systemPrompt: string | null = null, includeContext = true, options = {}) {
    if (!this.isConfigured()) {
      throw new Error('AI functionaliteit is uitgeschakeld');
    }

    // Als includeContext true is, voeg relevante data toe aan de system prompt
    let enhancedSystemPrompt = systemPrompt || '';
    
    if (includeContext && messages.length > 0) {
      const lastUserMessage = messages[messages.length - 1];
      if (lastUserMessage && lastUserMessage.role === 'user') {
        console.log('🤖 Gathering context for:', lastUserMessage.content.substring(0, 50));
        const context = await this.getRelevantContext(lastUserMessage.content);
        
        console.log(`📊 Context opgehaald: ${context.length} karakters`);
        
        if (context && context.trim().length > 0) {
          console.log('✅ Context toegevoegd aan prompt');
          console.log('📝 Context bevat documenten:', context.includes('RELEVANTE DOCUMENTEN'));
          console.log('📝 Context bevat orders:', context.includes('PRODUCTIE ORDER'));
          enhancedSystemPrompt = this.composeSystemPrompt(enhancedSystemPrompt, context);
        } else {
          console.log('⚠️ Geen context gevonden, gebruik standaard system prompt');
        }
      }
    }

    console.log(`📤 Verzenden naar AI met system prompt lengte: ${enhancedSystemPrompt.length} karakters`);
    return this.chat(messages, enhancedSystemPrompt, options);
  }

  async chatGoogle(messages: any[], systemPrompt: string, modelName: string, options = {}) {
    try {
      const response = await this.aiProxyGenerate({
        messages,
        systemPrompt: systemPrompt || '',
        modelName,
      });

      const text = response?.data?.text;
      if (!text) {
        throw new Error(i18n.t("gemini.no_answer", "Geen antwoord ontvangen van AI"));
      }

      return text;
    } catch (error: any) {
      console.error('AI proxy error:', error);

      if (error?.code === 'resource-exhausted') {
        throw new Error(i18n.t("gemini.rate_limit", "Te veel AI aanvragen. Probeer het over een minuut opnieuw."));
      }

      if (error?.code === 'unauthenticated') {
        throw new Error(i18n.t("gemini.auth_required", "Je moet ingelogd zijn om AI te gebruiken."));
      }

      throw new Error(error?.message || i18n.t("gemini.proxy_error", "AI proxy request mislukt"));
    }
  }

  /**
   * Sla een geleerd feit op in het AI geheugen (Firestore)
   * Wordt opgeslagen wanneer de gebruiker een antwoord goedkeurt (thumbs up)
   */
  async saveMemory({ topic, content, sourceQuestion = "", sourceAnswer = "", userId = null, category = "approved_answer" }: Record<string, any>) {
    try {
      const keywords = [...new Set([
        ...this.extractSearchTerms(topic),
        ...this.extractSearchTerms(sourceQuestion),
      ])];
      await addDoc(collection(db, getPathString(PATHS.AI_MEMORY)), {
        category,
        topic,
        content,
        sourceQuestion,
        sourceAnswer,
        userId,
        keywords,
        learnedAt: serverTimestamp(),
        useCount: 0,
        active: true,
      });
      await logActivity(
        userId || 'system',
        'AI_MEMORY_SAVE',
        `AI memory opgeslagen: ${topic || 'zonder onderwerp'}`
      );
      console.log('💾 AI Geheugen opgeslagen:', topic);
    } catch (error) {
      console.error('Error saving AI memory:', error);
      throw error;
    }
  }

  /**
   * Laad relevante herinneringen op basis van de gebruikersvraag
   * Filtert client-side op keyword overlap
   */
  async getRelevantMemories(userQuery: string): Promise<AiMemory[]> {
    try {
      const memRef = collection(db, getPathString(PATHS.AI_MEMORY));
      const q = query(memRef, limit(60));
      const snap = await getDocs(q);
      const memories = snap.docs
        .map(d => ({ id: d.id, ...(d.data() as Record<string, any>) } as AiMemory))
        .filter(m => m.active !== false);

      const terms = this.extractSearchTerms(userQuery);
      if (terms.length === 0) return [];

      return memories
        .filter(mem => {
          const haystack = `${mem.topic || ''} ${mem.content || ''} ${(mem.keywords || []).join(' ')}`.toLowerCase();
          return terms.some(t => haystack.includes(t));
        })
        .slice(0, 5);
    } catch (error) {
      console.error('Error fetching AI memories:', error);
      return [];
    }
  }

  /**
   * Sla de volledige gesprekgeschiedenis op per gebruiker (max 50 berichten)
   */
  async saveConversation({ userId, sessionId, messages }: Record<string, any>) {
    if (!userId) return;
    try {
      const userDocRef = doc(db, `${getPathString(PATHS.AI_CONVERSATIONS)}/${userId}`);
      const toSave = messages.slice(-50).map((m: any) => ({
        role: m.role,
        content: (m.content || '').substring(0, 2000),
        sessionId: sessionId || '',
        timestamp: new Date().toISOString(),
      }));
      await setDoc(userDocRef, {
        messages: toSave,
        sessionId: sessionId || '',
        lastUpdated: serverTimestamp(),
        userId,
      });
      await logActivity(
        userId,
        'AI_CONVERSATION_SAVE',
        `AI conversatie opgeslagen (${toSave.length} berichten)`
      );
    } catch (error) {
      console.error('Error saving conversation:', error);
    }
  }

  /**
   * Laad de meest recente gesprekgeschiedenis van een gebruiker
   * @returns {{ messages: Array, sessionId: string } | null}
   */
  async loadRecentConversation(userId: string) {
    if (!userId) return null;
    try {
      const userDocRef = doc(db, `${getPathString(PATHS.AI_CONVERSATIONS)}/${userId}`);
      const snap = await getDoc(userDocRef);
      if (!snap.exists()) return null;
      return snap.data();
    } catch (error) {
      console.error('Error loading conversation:', error);
      return null;
    }
  }

  async generateFlashcards(topic: string, systemPrompt: string | undefined) {
    const messages = [
      {
        role: 'user',
        content: `Generate educational flashcards about: ${topic}. Return ONLY valid JSON in the format specified in the system prompt.`,
      },
    ];

    const response = await this.chat(messages, systemPrompt || '');
    
    // Try to parse JSON from response
    try {
      // Remove markdown code blocks if present
      const cleanedResponse = response
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      return JSON.parse(cleanedResponse);
    } catch (error) {
      console.error('Failed to parse flashcard JSON:', error);
      throw new Error(i18n.t("ai.flashcard_error", "AI returned invalid flashcard format"), { cause: error });
    }
  }
}

export const aiService = new AIService();
