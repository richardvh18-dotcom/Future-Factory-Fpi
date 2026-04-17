/**
 * AI Service - Google Gemini Integration
 * Exclusief voor Firebase/Google ecosystem
 * 
 * Setup:
 * API key wordt uitsluitend server-side geconfigureerd
 * via Firebase Functions config/environment.
 */

import { collection, query, getDocs, addDoc, setDoc, getDoc, doc, limit, orderBy, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import app, { auth, db, logActivity } from '../config/firebase';
import { PATHS } from '../config/dbPaths';
import i18n from '../i18n';

class AIService {
  constructor() {
    this.availableModel = 'gemini-1.5-flash';
    this.functions = getFunctions(app);
    this.aiProxyGenerate = httpsCallable(this.functions, 'aiProxyGenerate');
    
    // Expose debug functie globally voor troubleshooting
    if (typeof window !== 'undefined') {
      window.aiDebug = {
        listDocuments: () => this.debugListDocuments(),
        searchDocuments: (term) => this.debugSearchDocuments(term),
        testContext: (query) => this.debugTestContext(query)
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
  async debugSearchDocuments(searchTerm) {
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
  async debugTestContext(query) {
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
      let allOrders = [];
      
      // Probeer PATHS.PLANNING eerst
      try {
        console.log('🔎 Trying PATHS.PLANNING: /future-factory/production/digital_planning');
        const planningCollection = collection(db, ...PATHS.PLANNING);
        const q = query(planningCollection, limit(limitCount));
        const snapshot = await getDocs(q);
        
        const planningOrders = snapshot.docs.map(doc => ({
          id: doc.id,
          source: 'PLANNING',
          ...doc.data()
        }));
        
        console.log(`📦 PATHS.PLANNING: ${planningOrders.length} documenten gevonden`);
        allOrders.push(...planningOrders);
      } catch (error) {
        console.log('⚠️ PATHS.PLANNING error:', error.message);
      }
      
      // Probeer PATHS.TRACKING
      try {
        console.log('🔎 Trying PATHS.TRACKING: /future-factory/production/tracked_products');
        const trackingCollection = collection(db, ...PATHS.TRACKING);
        const q = query(trackingCollection, limit(limitCount));
        const snapshot = await getDocs(q);
        
        const trackedOrders = snapshot.docs.map(doc => ({
          id: doc.id,
          source: 'TRACKING',
          ...doc.data()
        }));
        
        console.log(`📦 PATHS.TRACKING: ${trackedOrders.length} documenten gevonden`);
        allOrders.push(...trackedOrders);
      } catch (error) {
        console.log('⚠️ PATHS.TRACKING error:', error.message);
      }
      
      // Log eerste doc structure
      if (allOrders.length > 0) {
        console.log('📄 Eerste order strukture:', Object.keys(allOrders[0]));
        console.log('📄 Sample data:', allOrders[0]);
      }
      
      return allOrders;
      
    } catch (error) {
      console.error('Error fetching production orders:', error.message);
      return [];
    }
  }

  /**
   * Zoek productie orders op titel/beschrijving/ordernummer
   * Probeert eerst ordernummers eruit te trekken uit de query
   * @param {string} searchTerm - Zoekterm
   * @returns {Promise<Array>} Gevonden orders met volledige informatie
   */
  async searchProductionOrders(searchTerm) {
    try {
      const orders = await this.getProductionOrders(200);
      const normalize = (value) => (value ?? '').toString();
      const collectLotNumbers = (order) => {
        const lots = [];
        const pushLot = (value) => {
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
  async getCatalogProducts(limitCount = 50) {
    try {
      // Probeer producten uit inventory op te halen
      const inventoryCollection = collection(db, ...PATHS.INVENTORY);
      const q = query(inventoryCollection, limit(limitCount));
      const snapshot = await getDocs(q);
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
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
    const results = [];
    for (const pathKey of ['TRACKING', 'PLANNING']) {
      try {
        const col = collection(db, ...PATHS[pathKey]);
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
        const docs = snapshot.docs.map(d => ({ id: d.id, source: pathKey, ...d.data() }));
        results.push(...docs);
        console.log(`📦 Recent activity from ${pathKey}: ${docs.length} items`);
      } catch (error) {
        console.warn(`⚠️ Kon recente activiteit niet ophalen uit ${pathKey}:`, error.message);
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
    const results = [];
    for (const pathKey of ['TIME_LOGS', 'EFFICIENCY_HOURS']) {
      try {
        const col = collection(db, ...PATHS[pathKey]);
        let snapshot;
        try {
          snapshot = await getDocs(query(col, orderBy('timestamp', 'desc'), limit(limitCount)));
        } catch {
          snapshot = await getDocs(query(col, limit(limitCount)));
        }
        const docs = snapshot.docs.map(d => ({ id: d.id, source: pathKey, ...d.data() }));
        results.push(...docs);
        console.log(`⏱️ Times from ${pathKey}: ${docs.length} items`);
      } catch (error) {
        console.warn(`⚠️ Kon tijden niet ophalen uit ${pathKey}:`, error.message);
      }
    }
    return results;
  }

  /**
   * Haal geanalyseerde AI documenten op
   * @param {number} limitCount - Maximaal aantal documenten
   * @returns {Promise<Array>} Array met documenten
   */
  async getAiDocuments(limitCount = 20) {
    try {
      const docsCollection = collection(db, ...PATHS.AI_DOCUMENTS);
      const q = query(docsCollection, limit(limitCount));
      const snapshot = await getDocs(q);

      return snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
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
    let departments = [];
    try {
      const factorySnap = await getDoc(doc(db, ...PATHS.FACTORY_CONFIG));
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
    const workdays = [];
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
    const occupancyByDay = {};
    try {
      const occSnap = await getDocs(collection(db, ...PATHS.OCCUPANCY));
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
    const behindOrders = [];
    const activeOrders = [];
    try {
      const effSnap = await getDocs(query(collection(db, ...PATHS.EFFICIENCY_HOURS), limit(100)));
      const trackingSnap = await getDocs(query(collection(db, ...PATHS.TRACKING), limit(500)));
      const trackingData = trackingSnap.docs.map(d => d.data());

      effSnap.docs.forEach(d => {
        const std = d.data();
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
            if (end - start > 0) actualMinutes += (end - start) / 60000;
          }
          if (['completed', 'Finished', 'GEREED'].includes(log.status || log.currentStep || log.currentStation)) {
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
   * Extract belangrijke zoektermen uit een vraag
   * Verwijdert stopwoorden en haalt key terms eruit
   */
  extractSearchTerms(query) {
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
   * Zoek in AI documenten op basis van zoekterm
   * @param {string} searchTerm - Zoekterm
   * @returns {Promise<Array>} Gevonden documenten
   */
  async searchAiDocuments(searchTerm) {
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
  async searchCatalogProducts(searchTerm) {
    try {
      const products = await this.getCatalogProducts(100);
      const term = searchTerm.toLowerCase();
      
      return products.filter(product => 
        (product.name && product.name.toLowerCase().includes(term)) ||
        (product.sku && product.sku.toLowerCase().includes(term)) ||
        (product.specifications && JSON.stringify(product.specifications).toLowerCase().includes(term)) ||
        (product.tolerance && JSON.stringify(product.tolerance).toLowerCase().includes(term)) ||
        (product.diameter && product.diameter.toString().includes(searchTerm)) ||
        (product.length && product.length.toString().includes(searchTerm))
      );
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
  async getRelevantContext(userQuery) {
    try {
      let contextData = '';
      const query = userQuery.toLowerCase();
      
      console.log('🔍 AI Context: Zoeken naar:', userQuery);

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
      const isOrderRelated = query.includes('order') || 
                            query.includes('n2') || 
                            query.includes('status') ||
                            query.includes('klaar') ||
                            query.includes('gereed') ||
                            query.includes('hoeveel') ||
                            query.includes('productie') ||
                            query.includes('progress') ||
                            query.includes('nog') ||
                query.includes('gemaakt') ||
                query.includes('lot') ||
                /\b\d{10,20}\b/.test(query);
      
      if (isOrderRelated || query.includes('product')) {
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
              const remaining = order.quantity - order.completed;
              contextData += `Nog te doen: ${remaining} stuks\n`;
            }
            
            // Progress percentage
            if (order.progress !== undefined) {
              contextData += `Progress: ${order.progress}%\n`;
            } else if (order.quantity && order.completed) {
              const percent = Math.round((order.completed / order.quantity) * 100);
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
      const isRecentQuery = query.includes('laatste') ||
                            query.includes('recent') ||
                            query.includes('nieuwste') ||
                            query.includes('laats') ||
                            (query.includes('lot') && (query.includes('welk') || query.includes('wat') || query.includes('nummer')));

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
              if (item.workstation) contextData += `Werkstation: ${item.workstation}\n`;
            });

            contextData += '\n' + '='.repeat(60) + '\n';
          }
        } catch (err) {
          console.warn('Kon recente activiteit niet laden:', err);
        }
      }

      // Vragen over productie tijden / uren / efficiëntie
      const isTimeQuery = query.includes('tijd') ||
                          query.includes('uren') ||
                          query.includes('uur') ||
                          query.includes('effici') ||
                          query.includes('hoelang') ||
                          query.includes('duur') ||
                          query.includes('cyclustijd') ||
                          query.includes('bewerkingstijd') ||
                          query.includes('instelttijd') ||
                          query.includes('takt');

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
        query.includes('werkuur') || query.includes('werkuren') ||
        query.includes('capaciteit') || query.includes('werkdruk') ||
        query.includes('inplannen') || query.includes('inplan') ||
        query.includes('achterstand') || query.includes('achter') ||
        query.includes('deadline') || query.includes('klaar voor') ||
        query.includes('klaar op') || query.includes('hoeveel uur') ||
        query.includes('beschikbaar') || query.includes('vrije') ||
        query.includes('passen') ||
        /\d+\s*(uur|werkuur|manuur)/i.test(userQuery);

      if (isCapacityQuery) {
        try {
          console.log('📊 Capaciteitscontext ophalen...');
          const capacityCtx = await this.getCapacityContext();
          contextData += capacityCtx;
          console.log('✅ Capaciteitscontext toegevoegd');
        } catch (err) {
          console.warn('Kon capaciteitscontext niet laden:', err);
        }
      }

      // Controleer op catalog/maten/toleranties vragen
      if (query.includes('maat') || 
          query.includes('tolerantie') ||
          query.includes('diameter') ||
          query.includes('lengte') ||
          query.includes('catalog') ||
          query.includes('spec')) {
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
      
      console.log('📊 Context data lengte:', contextData.length, 'bytes');
      if (contextData.length > 100) {
        console.log('📋 Context preview:', contextData.substring(0, 200) + '...');
      } else {
        console.log('⚠️ Waarschuwing: Zeer weinig context data!');
      }
      return contextData;
    } catch (error) {
      console.error('Error getting context:', error);
      return `\n\n${i18n.t("ai.context.error", "⚠️ Fout bij ophalen contextgegevens:")} ${error.message}\n`;
    }
  }

  async getAvailableModel() {
    return this.availableModel;
  }

  async chat(messages, systemPrompt = null, options = {}) {
    if (!this.isConfigured()) {
      throw new Error(i18n.t("gemini.api_disabled", "AI functionaliteit is uitgeschakeld."));
    }

    if (!auth.currentUser) {
      throw new Error(i18n.t("gemini.auth_required", "Je moet ingelogd zijn om AI te gebruiken."));
    }

    // Haal beschikbare model op
    const modelName = await this.getAvailableModel();

    try {
      return await this.chatGoogle(messages, systemPrompt, modelName, options);
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
  async chatWithContext(messages, systemPrompt = null, includeContext = true, options = {}) {
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
          enhancedSystemPrompt += '\n\n' + context;
        } else {
          console.log('⚠️ Geen context gevonden, gebruik standaard system prompt');
        }
      }
    }

    console.log(`📤 Verzenden naar AI met system prompt lengte: ${enhancedSystemPrompt.length} karakters`);
    return this.chat(messages, enhancedSystemPrompt, options);
  }

  async chatGoogle(messages, systemPrompt, modelName, options = {}) {
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
    } catch (error) {
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
  async saveMemory({ topic, content, sourceQuestion = "", sourceAnswer = "", userId = null, category = "approved_answer" }) {
    try {
      const keywords = [...new Set([
        ...this.extractSearchTerms(topic),
        ...this.extractSearchTerms(sourceQuestion),
      ])];
      await addDoc(collection(db, ...PATHS.AI_MEMORY), {
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
  async getRelevantMemories(userQuery) {
    try {
      const memRef = collection(db, ...PATHS.AI_MEMORY);
      const q = query(memRef, limit(60));
      const snap = await getDocs(q);
      const memories = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
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
  async saveConversation({ userId, sessionId, messages }) {
    if (!userId) return;
    try {
      const userDocRef = doc(db, ...PATHS.AI_CONVERSATIONS, userId);
      const toSave = messages.slice(-50).map(m => ({
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
  async loadRecentConversation(userId) {
    if (!userId) return null;
    try {
      const userDocRef = doc(db, ...PATHS.AI_CONVERSATIONS, userId);
      const snap = await getDoc(userDocRef);
      if (!snap.exists()) return null;
      return snap.data();
    } catch (error) {
      console.error('Error loading conversation:', error);
      return null;
    }
  }

  async generateFlashcards(topic, systemPrompt) {
    const messages = [
      {
        role: 'user',
        content: `Generate educational flashcards about: ${topic}. Return ONLY valid JSON in the format specified in the system prompt.`,
      },
    ];

    const response = await this.chat(messages, systemPrompt);
    
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
