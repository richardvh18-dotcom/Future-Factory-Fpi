import React, { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Send,
  Paperclip,
} from "lucide-react";
import { addDoc, collection, doc, getDoc, getDocs, serverTimestamp, query, limit, orderBy } from "firebase/firestore";
import { db, auth, logActivity } from "../../config/firebase";
import { aiService } from "../../services/aiService";
import { useNotifications } from "../../contexts/NotificationContext";
import { PATHS } from "../../config/dbPaths";
import { getLivePlanningContext } from "../../services/planningContext";
import { useTranslation } from "react-i18next";
import { extractTextFromPdf } from "../../utils/pdfUtils";
import AiMessage from "./AiMessage";

const logRejectedAnswer = async ({ content, userInput, context, userId }) => {
  try {
    const colRef = collection(db, ...(PATHS?.AI_KNOWLEDGE_BASE || ['future-factory', 'settings', 'ai_knowledge_base']));
    await addDoc(colRef, {
      type: "rejected",
      feedback: "negative",
      answer: content,
      userInput,
      context,
      userId: userId || null,
      timestamp: serverTimestamp(),
      status: "pending"
    });
  } catch (err) {
    console.error("Fout bij loggen van afgewezen antwoord:", err);
  }
};

const getWelcomeMessage = (lang, t) => {
  return t ? t('ai.chat.welcome') : "Hallo! Ik ben je AI assistent. Hoe kan ik je helpen?";
};

const AiChatView = () => {
  const { t, i18n } = useTranslation();
  const { showError, showSuccess } = useNotifications();
  const location = useLocation();
  const navigate = useNavigate();
  
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const messagesEndRef = useRef(null);
  const abortControllerRef = useRef(null);

  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: getWelcomeMessage(i18n.language, t),
    },
  ]);
  const [input, setInput] = useState("");
  const [systemContext, setSystemContext] = useState("");
  const [factoryStructure, setFactoryStructure] = useState(null);

  // Update welcome message when language changes (only if chat hasn't started)
  useEffect(() => {
    setMessages(prev => {
      if (prev.length === 1 && prev[0].role === 'assistant') {
        return [{
          role: "assistant",
          content: getWelcomeMessage(i18n.language, t)
        }];
      }
      return prev;
    });
  }, [i18n.language, t]);

  // Handle initial query from header search
  useEffect(() => {
    if (location.state?.initialQuery) {
      setInput(location.state.initialQuery);
      setTimeout(() => {
        handleSendChat(null, location.state.initialQuery);
      }, 100);
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Context laden
  useEffect(() => {
    const fetchContext = async () => {
      try {
        const factoryRef = doc(db, ...(PATHS?.FACTORY_CONFIG || ['future-factory', 'settings', 'factory_config', 'main']));
        const factorySnap = await getDoc(factoryRef);
        if (factorySnap.exists()) {
          setFactoryStructure(factorySnap.data());
        }

        const docRef = doc(db, ...(PATHS?.AI_CONFIG || ['future-factory', 'settings', 'ai_config', 'main']));
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists() && docSnap.data().systemPrompt) {
          setSystemContext(docSnap.data().systemPrompt);
        } else {
          setSystemContext(DEFAULT_CONTEXT);
        }
      } catch (err) {
        console.error("Kon AI context niet laden, gebruik fallback:", err);
        setSystemContext(DEFAULT_CONTEXT);
      } finally {
        setIsInitializing(false);
      }
    };
    fetchContext();
  }, []);

  // Document Analyse
  const MAX_DOC_CHARS = 50000;
  const extractJson = (text) => {
    if (!text) return null;
    let cleaned = text.trim().replace(/```json/gi, '').replace(/```/g, '').trim();
    if (cleaned.startsWith("{") && cleaned.endsWith("}")) return cleaned;
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/m);
    if (jsonMatch) {
      let extracted = jsonMatch[0].trim();
      const lastBrace = extracted.lastIndexOf('}');
      if (lastBrace !== -1) extracted = extracted.substring(0, lastBrace + 1);
      return extracted;
    }
    return null;
  };

  const analyzeDocument = async (text, fileName) => {
    const systemPrompt = `Je bent een AI die bedrijfsdocumenten analyseert voor een MES omgeving. RETURN ONLY VALID JSON.`;
    try {
      const response = await aiService.chat([{ role: "user", content: `Bestandsnaam: ${fileName}\n\nDocument inhoud:\n${text}` }], systemPrompt);
      const jsonText = extractJson(response);
      if (!jsonText) return { parsed: false, analysis: { title: fileName, summary: response.substring(0, 1000), tags: ["niet-geparsed"], fullContext: response.substring(0, 10000) } };
      const analysis = JSON.parse(jsonText);
      return { parsed: true, analysis };
    } catch (err) {
      console.error("Analyse fout:", err);
      return { parsed: false, analysis: { title: fileName, summary: `Fout: ${err.message}`, tags: ["error"], fullContext: text.substring(0, 5000) } };
    }
  };

  const handleChatFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["application/pdf", "text/plain", "text/markdown", "text/csv", "application/json"];
    if (!allowed.includes(file.type)) {
      showError("Alleen .pdf, .txt, .md, .csv of .json bestanden zijn ondersteund.");
      e.target.value = "";
      return;
    }
    setIsUploadingDocument(true);
    try {
      let text = "";
      if (file.type === "application/pdf") text = await extractTextFromPdf(file);
      else text = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result || "");
        reader.onerror = reject;
        reader.readAsText(file);
      });
      const content = String(text).slice(0, MAX_DOC_CHARS);
      const analysisResult = await analyzeDocument(content, file.name);
      if (!analysisResult.parsed || !analysisResult.analysis) {
        showError("Analyse mislukt.");
        return;
      }
      await addDoc(collection(db, ...(PATHS?.AI_DOCUMENTS || ['future-factory', 'settings', 'ai_documents', 'knowledge', 'records'])), {
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        uploadedAt: serverTimestamp(),
        uploadedBy: auth.currentUser?.email || "Admin",
        analysis: analysisResult.analysis,
        parsed: true,
        tags: analysisResult.analysis?.tags || [],
        fullText: String(text).slice(0, MAX_DOC_CHARS),
        characterCount: text.length,
      });
      setMessages((prev) => [...prev, { role: "assistant", content: "📄 Document verwerkt en context opgeslagen." }]);
      showSuccess("Document geanalyseerd en opgeslagen.");
    } catch (error) {
      console.error("Document upload fout:", error);
      showError("Fout bij analyseren of opslaan.");
    } finally {
      setIsUploadingDocument(false);
      e.target.value = "";
    }
  };

  const handleSendChat = async (e, queryOverride = null) => {
    if (e) e.preventDefault();
    const messageText = queryOverride || input;
    if (!messageText.trim() || isLoading) return;

    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    const userMsg = { role: "user", content: messageText };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    await logActivity(auth.currentUser?.uid, 'AI_CHAT', `Query: ${messageText.substring(0, 50)}...`);

    try {
      if (!aiService.isConfigured()) throw new Error('Google AI API key niet gevonden.');
      
      const chatHistory = messages
        .filter(msg => msg.role !== "assistant" || msg.content !== messages[0].content)
        .map(msg => ({ role: msg.role, content: msg.content }));
      chatHistory.push(userMsg);

      let currentSystemContext = systemContext || DEFAULT_CONTEXT;
      
      // Dynamische taal instructie
      const currentLang = i18n.language?.split('-')[0] || 'nl';
      const langMap = {
        nl: "Dutch",
        en: "English",
        de: "German",
        fr: "French",
        es: "Spanish"
      };
      const targetLang = langMap[currentLang] || "English";
      currentSystemContext += `\n\nIMPORTANT: Answer in ${targetLang}. Ignore previous language instructions if they conflict.`;
      
      // Context verrijking (Fabriek, Bezetting, Efficiency)
      if (factoryStructure) {
        let structureContext = "\n\n## ACTUELE FABRIEKSSTRUCTUUR (LIVE DATABASE):\n";
        factoryStructure.departments?.forEach(dept => {
          structureContext += `### Afdeling: ${dept.name}\n`;
          if (dept.shifts) {
            const shifts = Number(dept.shifts) || 0;
            structureContext += `**Rooster:** ${shifts} ploegen (${shifts * 8} uur capaciteit per dag).\n`;
          }
          structureContext += dept.stations?.length > 0 ? `Machines: ${dept.stations.map(s => s.name).join(", ")}\n` : "Machines: Geen machines.\n";
        });
        currentSystemContext += structureContext;
      }

      try {
        const occupancyRef = collection(db, ...(PATHS?.OCCUPANCY || ['future-factory', 'production', 'occupancy']));
        const occupancySnap = await getDocs(occupancyRef);
        const today = new Date().toISOString().slice(0, 10);
        const activeOperators = occupancySnap.docs.map(d => d.data()).filter(d => d.date === today);
        if (activeOperators.length > 0) {
          let occupancyContext = "\n\n## ACTUELE PERSONEELSBEZETTING (VANDAAG):\n";
          activeOperators.forEach(op => {
            occupancyContext += `- ${op.operatorName} (${op.operatorNumber}) -> ${op.machineId} [${op.shift}] (${op.hours || 8} uur)\n`;
          });
          currentSystemContext += occupancyContext;
        }
      } catch (err) { console.error("Kon bezetting niet ophalen:", err); }

      try {
        const efficiencyRef = collection(db, ...PATHS.EFFICIENCY_HOURS);
        const efficiencySnap = await getDocs(query(efficiencyRef, limit(50)));
        const trackingRef = collection(db, ...(PATHS?.TRACKING || ['future-factory', 'production', 'tracking']));
        const trackingSnap = await getDocs(query(trackingRef, orderBy("updatedAt", "desc"), limit(500)));
        const trackingData = trackingSnap.docs.map(d => d.data());

        if (!efficiencySnap.empty) {
          let efficiencyContext = "\n\n## CAPACITEITSNORMEN & PLANNING STATUS:\n";
          efficiencySnap.forEach(doc => {
             const std = doc.data();
             if (std.orderId) {
                const relatedLogs = trackingData.filter(t => String(t.orderId || t.orderNumber) === String(std.orderId));
                let actualMinutes = 0, producedQty = 0;
                relatedLogs.forEach(log => {
                   if (log.timestamps?.station_start) {
                      const start = log.timestamps.station_start.toDate ? log.timestamps.station_start.toDate() : new Date(log.timestamps.station_start);
                      const end = log.timestamps.completed?.toDate ? log.timestamps.completed.toDate() : (log.timestamps.finished?.toDate ? log.timestamps.finished.toDate() : new Date());
                      if (end - start > 0) actualMinutes += (end - start) / 60000;
                   }
                   if (log.status === 'completed' || log.currentStep === 'Finished' || log.currentStation === 'GEREED') producedQty++;
                });
                const normPerUnit = std.minutesPerUnit || 0;
                const earnedMinutes = producedQty * normPerUnit;
                 let status;
                 let efficiency = 0;
                if (actualMinutes > 0) {
                   efficiency = (earnedMinutes / actualMinutes) * 100;
                   status = efficiency >= 100 ? "VOOR op schema" : efficiency >= 85 ? "OP schema" : "ACHTER op schema";
                } else if (producedQty > 0) status = "Start gemaakt";
                else status = "Nog niet gestart";

                const totalQty = Number(std.quantity) || (std.standardTimeTotal && normPerUnit ? Math.round(std.standardTimeTotal / normPerUnit) : 0);
                const remainingQty = Math.max(0, totalQty - producedQty);
                let estimatedEnd = "Nog niet te bepalen";
                if (remainingQty <= 0 && producedQty > 0) estimatedEnd = "Reeds voltooid";
                else if (remainingQty > 0 && normPerUnit > 0) {
                    const effectiveEfficiency = efficiency > 0 ? (efficiency / 100) : 1.0;
                    const minutesNeeded = (remainingQty * normPerUnit) / effectiveEfficiency;
                    const endDate = new Date(Date.now() + minutesNeeded * 60000);
                    estimatedEnd = endDate.toLocaleTimeString('nl-NL', {hour: '2-digit', minute: '2-digit'});
                }
                efficiencyContext += `- Order ${std.orderId}: Status: **${status}** (Eff: ${Math.round(efficiency)}%). Voortgang: ${producedQty}/${totalQty}. Verwacht gereed: **${estimatedEnd}**.\n`;
             }
          });
          currentSystemContext += efficiencyContext;
        }
      } catch (err) { console.error("Kon efficiency niet ophalen:", err); }

      try {
        const planningContext = await getLivePlanningContext();
        currentSystemContext += `\n\n${planningContext}`;
      } catch (err) { console.error("Kon planning context niet ophalen:", err); }

      const response = await aiService.chatWithContext(chatHistory, currentSystemContext, true, { signal: abortControllerRef.current.signal });
      setMessages((prev) => [...prev, { role: "assistant", content: response }]);
      showSuccess('Antwoord ontvangen!');
    } catch (error) {
      if (error?.name === 'AbortError') {
        setMessages((prev) => [...prev, { role: "assistant", content: "⏹️ Antwoord gestopt op verzoek." }]);
        return;
      }
      console.error("AI Chat Error:", error);
      showError("AI verbinding mislukt: " + error.message);
      setMessages((prev) => [...prev, { role: "assistant", content: "⚠️ Er is een fout opgetreden bij het verbinden met de AI." }]);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleStopChat = () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
  };

  if (isInitializing) {
    return (
      <div className="flex flex-col h-full bg-slate-50 items-center justify-center animate-in fade-in">
        <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4"></div>
        <h2 className="text-lg font-bold text-slate-700">AI Assistent Starten...</h2>
        <p className="text-slate-500 text-sm">Even geduld, we laden de context.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col max-w-4xl mx-auto">
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((msg, idx) => (
          <AiMessage 
            key={idx} 
            message={msg} 
            factoryStructure={factoryStructure}
            onNavigate={navigate}
            onQuery={(text) => handleSendChat(null, text)}
            onReject={async () => {
              await logRejectedAnswer({ content: msg.content, userInput: messages[idx - 1]?.content || "", context: systemContext, userId: auth.currentUser?.uid || null });
              showSuccess("Antwoord gemarkeerd voor AI review.");
            }}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="p-4 bg-white border-t border-slate-200">
        <form onSubmit={handleSendChat} className="flex gap-2">
          <input
            type="text"
            className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 transition-colors"
            placeholder="Typ je vraag..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading || isUploadingDocument}
          />
          <label className={`inline-flex items-center justify-center p-3 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer ${isUploadingDocument ? "opacity-50 cursor-not-allowed" : ""}`} title="Upload document (PDF of tekst)">
            <Paperclip size={18} />
            <input type="file" accept=".pdf,.txt,.md,.csv,.json" onChange={handleChatFileUpload} disabled={isUploadingDocument} className="hidden" />
          </label>
          <button type="button" onClick={handleStopChat} disabled={!isLoading} className="bg-white text-slate-700 border border-slate-200 p-3 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed" title="Stop antwoord">Stop</button>
          <button type="submit" disabled={isLoading} className="bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {isLoading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send size={20} />}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AiChatView;

// Fallback context (lokaal) - Geëxporteerd voor gebruik in Admin
export const DEFAULT_CONTEXT = `Je bent een AI assistent voor FPi Future Factory, een MES (Manufacturing Execution System) voor de productie van GRE-buizen (Glass Reinforced Epoxy) en fittings.

BELANGRIJK: Gebruik altijd proper Markdown formatting in je antwoorden:
- Gebruik **vetgedrukt** voor belangrijke termen
- Gebruik genummerde lijsten (1. 2. 3.) voor stappen
- Gebruik bullet points (- of *) voor opsommingen en overzichtelijke samenvattingen
- Gebruik ## voor hoofdkoppen en ### voor subkoppen
- Laat lege regels tussen alinea's voor leesbaarheid
- Gebruik code formatting voor technische termen en knoppen
- Gebruik --- voor visuele scheiding tussen secties waar nuttig
- **Cruciaal:** Als een gebruiker vraagt naar een machine (bijv. BH11, Mazak) of order (N...), noem deze dan expliciet in je antwoord. Het systeem maakt hier automatisch klikbare links van.

## PRODUCTIE INFORMATIE:

**GRE Specificaties:**
- GRE = Glass Reinforced Epoxy (Glasvezelversterkte Epoxy)
- EST = Epoxy Standard Type (Wavistrong Blauw, bijv. 32mm, 40mm, 50mm)
- CST = Conductive Standard Type (Zwart, Geleidend)
- Belangrijke producten: Wavistrong (drukriool), Bocht 87.5°, T-stukken, Moffen
- **Definitie Lossen:** Producten worden om een mal gewikkeld. Na een uur voorharden op 100°C wordt het product van de mal gehaald; dit heet "lossen".

**Fabrieksstructuur:**
De actuele afdelingen, machines en ploegendiensten worden dynamisch geladen uit de database. Gebruik deze data voor antwoorden over locaties en machines.

## SYSTEEM HANDLEIDING:

### 1. PORTAAL (Dashboard)
Het portaal is je startpagina met een overzicht van:
- Snelle toegang tot alle modules
- Statistieken en KPI's
- Recente activiteiten
- Notificaties en meldingen

**Gebruik:** Navigeer via de sidebar naar "/" of klik op het logo

### 2. PLANNING MODULE

De planning module bestaat uit verschillende hubs:

#### **WorkstationHub (Hoofdplanning):**

- **Plan producten en orders** voor machines
- **Wijs personeel toe** aan werkstations
- **Bekijk real-time bezetting** per machine
- Tabs beschikbaar: Planning, Productie, Lossen
- Personeel toewijzing toont actieve shift in kleur
- Meerdere operators per machine mogelijk

**Navigatie:** Sidebar → Planning → Selecteer afdeling → Selecteer machine

---

#### **LossenView (Lossen afdeling):**

- Bekijk orders voor afwerking
- Los orders en markeer gereed
- Registreer afwijkingen
- Bekijk afwijzingen analyse

**Navigatie:** Sidebar → Planning → Tab "Lossen"

---

#### **DigitalPlanningHub:**

- Overkoepelend overzicht alle afdelingen
- Monitor machine status real-time
- Selecteer specifieke afdelingen

**Tips voor personeelstoewijzing:**
1. Sleep operators naar machines
2. Kleur geeft shift aan (amber=ochtend, indigo=avond, paars=nacht, blauw=dag)
3. Meerdere operators kunnen als team werken
4. Timestamp voorkomt duplicaten

**DigitalPlanningHub:**
- Overzicht van alle afdelingen
- Departement selectie
- Machine status monitoring

**Gebruik:** Sidebar → Planning → Selecteer afdeling → Selecteer machine → Plan order

---

### 3. CATALOGUS (Producten)

De productcatalogus bevat alle beschikbare producten.

**Functionaliteit:**
- Zoeken op productnaam, code, categorie
- Filteren op type (bijv. Bocht, T-stuk, Mof)
- Product details bekijken (specificaties, afmetingen)
- Technische tekeningen
- Voorraad status

**Filters gebruiken:**
1. Klik op Filters knop in sidebar (alleen zichtbaar op catalog pagina)
2. Filter op categorie, maat, materiaal
3. Reset filters met Clear knop

**Navigatie:** Sidebar → Catalogus → Zoek of filter producten

---

### 4. GEREEDSCHAP (Inventory)

Voorraadbeheer voor gereedschap en materialen.

**Functionaliteit:**
- Real-time voorraad overzicht
- Toevoegen/verwijderen items
- Geschiedenis van mutaties
- Low stock waarschuwingen
- Barcode scanning (mobiel)

**Navigatie:** Sidebar → Gereedschap → Bekijk voorraad of voeg items toe

---

### 5. AI ASSISTENT (deze pagina!)

Jouw digitale assistent voor hulp en training.

#### **Chat Mode:**
- Stel vragen over producten, processen, specificaties
- Vraag uitleg over systeem functionaliteit
- Krijg hulp bij problemen
- Beantwoord in de geselecteerde taal

#### **Training Mode:**
- Genereer flashcards over elk onderwerp
- Test je kennis over GRE, veiligheid, codes
- Interactief leren met vraag/antwoord
- Voer onderwerp in bijv. "Wavistrong codes"

#### **Header Zoekbalk Integratie:**
1. Klik op het Bot icoontje (🤖) in de zoekbalk
2. Of typ ? voor je vraag
3. Druk Enter om vraag naar AI te sturen

**Navigatie:** Sidebar → AI Assistent → Kies Chat of Training

---

### 6. CALCULATOR

Berekeningstools voor productie.

**Functionaliteit:**
- Volume berekeningen
- Materiaal berekeningen
- Gewicht calculator
- Custom formules

**Navigatie:** Sidebar → Calculator → Selecteer berekening type

---

### 7. BERICHTEN (Messages)

Interne communicatiesysteem voor meldingen.

**Functionaliteit:**
- Ontvang meldingen van admins
- Systeem berichten
- Order updates
- Push notificaties (browser + mobiel)
- Ongelezen teller in sidebar (rood bolletje)

**Notificatie Types:**
- Toast messages (rechtsonder)
- Browser notifications
- Mobiele push (PWA)

**Navigatie:** Sidebar → Berichten → Bekijk inbox

---

### 8. PROFIEL

Je persoonlijke instellingen en account informatie.

**Functionaliteit:**
- Bekijk account info
- Wijzig wachtwoord
- Taal instelling (NL/EN)
- Thema voorkeuren
- Notificatie instellingen

**Navigatie:** Sidebar → Profiel icoon (onderaan)

---

### 9. ADMIN (alleen voor admins)

Beheer paneel voor administratoren met uitgebreide modules.

**Modules:**
- Users - Gebruikersbeheer, rollen, rechten
- Products - Product database beheer
- Settings - Globale instellingen (logo, app naam)
- Locations - Afdelingen en machines configureren
- Messages - Verstuur berichten naar gebruikers
- Drilling - Boorgegevens
- Database - Data export/import
- Logs - Systeem activiteiten

**Navigatie:** Sidebar → Beheer (⚙️) → Selecteer admin module

---

### 10. TAAL WISSELEN

Wissel tussen Nederlands en Engels.

**Stappen:**
1. Sidebar → Globe icoon (🌐) onderaan
2. Klik om te wisselen tussen NL/EN
3. Wijziging is direct actief

---

## TIPS & TRICKS

**Sneltoetsen:**
- Klik logo → Naar portaal
- Sidebar hover → Uitklappen voor labels
- Header zoekbalk → Zoek overal + AI mode

**Mobiel gebruik:**
- Responsive design
- Touch gestures
- PWA installeerbaar
- Barcode scanner voor voorraad

**Real-time updates:**
- Firebase Firestore sync
- Automatische refresh bij wijzigingen
- Geen handmatig herladen nodig

**Personeelstoewijzing:**
- Sleep operators naar machines
- Kleur = shift type
- Meerdere operators = team
- Timestamp voorkomt duplicaten

**Zoektips:**
- Gebruik filters voor sneller zoeken
- Zoekbalk werkt op alle pagina's
- AI mode: klik bot icon of typ ?

---

## VEELGESTELDE VRAGEN

**Q: Hoe wijs ik personeel toe aan een machine?**

A: Planning → Selecteer afdeling → Klik machine → Klik Personeel → Selecteer operator → Bevestig

**Q: Waar vind ik product specificaties?**

A: Catalogus → Zoek product → Klik op product kaart → Bekijk details tab

**Q: Hoe los ik een order los?**

A: Planning → Lossen tab → Selecteer order → Klik Los knop → Bevestig

**Q: Kan ik notificaties uitschakelen?**

A: Profiel → Notificatie instellingen → Schakel types uit

**Q: Hoe verander ik mijn wachtwoord?**

A: Profiel → Beveiliging → Wijzig wachtwoord → Bevestig

**Q: Wat betekenen de kleuren bij personeel?**

A: Amber=Ochtend, Indigo=Avond, Paars=Nacht, Blauw=Dag shift

**Q: Hoe gebruik ik de AI assistent?**

A: Type je vraag in chat mode, of gebruik header zoekbalk met bot icon, of typ ? voor je vraag

---

**ANTWOORD INSTRUCTIES:**
- Beantwoord vragen in de geselecteerde taal (zie systeem instructie)
- Wees specifiek en verwijs naar de juiste modules/pagina's
- Gebruik Markdown formatting voor duidelijke structuur
- Gebruik genummerde stappen voor processen
- Gebruik bullet points voor lijsten
- Gebruik code formatting voor knoppen en technische termen`;
