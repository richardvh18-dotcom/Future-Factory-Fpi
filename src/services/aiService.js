/**
 * AI Service - Google Gemini Integration
 * Exclusief voor Firebase/Google ecosystem
 * 
 * Setup:
 * API key is al geconfigureerd in .env:
 * VITE_GOOGLE_AI_KEY=AIza...
 */

import { collection, query, getDocs, limit, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { PATHS } from '../config/dbPaths';

class AIService {
  constructor() {
    this.apiKey = import.meta.env.VITE_GOOGLE_AI_KEY;
    this.availableModel = null; // Cache voor het gevonden model
    
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
    return !!this.apiKey;
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
      
      // EERSTE: Probeer ALTIJD document context te vinden
      // Doe een brede zoekactie in alle documenten
      const docs = await this.searchAiDocuments(userQuery);
      console.log(`📚 Document search resultaten: ${docs.length} documenten gevonden`);
      
      if (docs.length > 0) {
        console.log('📚 Gevonden documenten:', docs.map(d => `"${d.fileName}" (${d.characterCount || 0} chars)`).join(', '));
        contextData += '\n\n📚 RELEVANTE DOCUMENTEN:\n';
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
          contextData += '\n\n📦 PRODUCTIE ORDER INFORMATIE:\n';
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
          contextData += '\n\n⚠️ Geen productie orders gevonden in database voor: ' + userQuery + '\n';
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
          contextData += '\n\n📋 CATALOGUS PRODUCT INFORMATIE:\n';
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
      return '\n\n⚠️ Fout bij ophalen contextgegevens: ' + error.message + '\n';
    }
  }

  async getAvailableModel() {
    // Als we al een werkend model hebben, gebruik dat
    if (this.availableModel) {
      return this.availableModel;
    }

    try {
      // Haal lijst met beschikbare modellen op
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`
      );
      
      if (!response.ok) {
        console.error('Failed to fetch models');
        return 'gemini-pro'; // Fallback
      }

      const data = await response.json();
      console.log('Available models:', data.models?.map(m => m.name));
      
      // Zoek een geschikt model voor generateContent
      const suitableModel = data.models?.find(model => 
        model.supportedGenerationMethods?.includes('generateContent') &&
        (model.name.includes('gemini') || model.name.includes('chat'))
      );

      if (suitableModel) {
        // Haal alleen de model naam (laatste deel na /)
        this.availableModel = suitableModel.name.split('/').pop();
        console.log('✅ Using model:', this.availableModel);
        return this.availableModel;
      }

      // Fallback naar gemini-pro
      this.availableModel = 'gemini-pro';
      return this.availableModel;
    } catch (error) {
      console.error('Error fetching models:', error);
      return 'gemini-pro'; // Fallback
    }
  }

  async chat(messages, systemPrompt = null, options = {}) {
    if (!this.apiKey) {
      throw new Error('Geen Google AI API key gevonden in .env');
    }

    // Haal beschikbare model op
    const modelName = await this.getAvailableModel();

    try {
      return await this.chatGoogle(messages, systemPrompt, this.apiKey, modelName, options);
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
    if (!this.apiKey) {
      throw new Error('Geen Google AI API key gevonden in .env');
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

  async chatGoogle(messages, systemPrompt, apiKey, modelName, options = {}) {
    // Gemini API format: converteer chat history naar Gemini format
    const contents = [];
    
    // Voeg system prompt toe als eerste user message
    if (systemPrompt) {
      contents.push({
        role: 'user',
        parts: [{ text: systemPrompt }]
      });
      contents.push({
        role: 'model',
        parts: [{ text: 'Begrepen. Ik zal je helpen met je vragen over FPi Future Factory.' }]
      });
    }

    // Converteer messages naar Gemini format
    messages.forEach(msg => {
      contents.push({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      });
    });

    try {
      const { signal } = options || {};
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          signal,
          body: JSON.stringify({
            contents: contents,
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 8000,
              topP: 0.95,
              topK: 40,
            },
            safetySettings: [
              {
                category: "HARM_CATEGORY_HARASSMENT",
                threshold: "BLOCK_NONE"
              },
              {
                category: "HARM_CATEGORY_HATE_SPEECH",
                threshold: "BLOCK_NONE"
              },
              {
                category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                threshold: "BLOCK_NONE"
              },
              {
                category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                threshold: "BLOCK_NONE"
              }
            ]
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Gemini API Error Response:', errorData);
        throw new Error(errorData.error?.message || `API fout: ${response.status}`);
      }

      const data = await response.json();
      
      // Check of er een response is
      if (!data.candidates || data.candidates.length === 0) {
        throw new Error('Geen antwoord ontvangen van AI');
      }

      const candidate = data.candidates[0];
      
      // Check blocking
      if (candidate.finishReason === 'SAFETY') {
        throw new Error('Antwoord geblokkeerd door veiligheidsfilters');
      }

      return candidate.content.parts[0].text;
    } catch (error) {
      console.error('Gemini Chat Error:', error);
      throw error;
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
      throw new Error('AI returned invalid flashcard format');
    }
  }
}

export const aiService = new AIService();
