import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  Bot,
  Send,
  Sparkles,
  GraduationCap,
  MessageSquare,
  BookOpen,
  AlertCircle,
} from "lucide-react";
import FlashcardViewer from "./ai/FlashcardViewer";
import { FLASHCARD_SYSTEM_PROMPT, MOCK_FLASHCARDS } from "../data/aiPrompts";
import { aiService } from "../services/aiService";
import { useNotifications } from "../contexts/NotificationContext";

const AiAssistantView = () => {
  const { showError, showSuccess } = useNotifications();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState("chat"); // 'chat' of 'training'
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = React.useRef(null);

  // Chat State
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: `Hallo! 👋 Ik ben de **FPi AI Assistent**.

Ik kan je helpen met:

- ❓ Vragen over producten, voorraad of technische specificaties
- 📖 Uitleg over hoe het systeem werkt
- 🧭 Navigatie naar de juiste modules
- 💡 Tips en best practices

**Tip:** Gebruik de zoekbalk in de header en klik op het Bot icoon voor snelle vragen!

Waar kan ik je mee helpen?`,
    },
  ]);
  const [input, setInput] = useState("");

  // Handle initial query from header search
  useEffect(() => {
    if (location.state?.initialQuery) {
      setInput(location.state.initialQuery);
      // Auto-submit the query
      setTimeout(() => {
        handleSendChat(null, location.state.initialQuery);
      }, 100);
      // Clear the state
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  // Auto-scroll naar beneden bij nieuwe berichten
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Training State
  const [trainingTopic, setTrainingTopic] = useState("");
  const [flashcardData, setFlashcardData] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Simpele formatter voor AI responses
  const formatResponse = (text) => {
    return text.split('\n').map((line, i) => {
      // Headers
      if (line.startsWith('### ')) {
        return <h3 key={i} className="text-base font-bold mt-3 mb-2 first:mt-0">{line.replace('### ', '')}</h3>;
      }
      if (line.startsWith('## ')) {
        return <h2 key={i} className="text-lg font-bold mt-4 mb-2 first:mt-0">{line.replace('## ', '')}</h2>;
      }
      // Bold text
      if (line.startsWith('**') && line.endsWith('**')) {
        return <p key={i} className="font-bold mb-2">{line.replace(/\*\*/g, '')}</p>;
      }
      // Lists
      if (line.match(/^\d+\./)) {
        return <li key={i} className="ml-6 mb-1 list-decimal">{line.replace(/^\d+\.\s/, '')}</li>;
      }
      if (line.startsWith('- ') || line.startsWith('* ')) {
        return <li key={i} className="ml-6 mb-1 list-disc">{line.substring(2)}</li>;
      }
      // Horizontal rule
      if (line === '---') {
        return <hr key={i} className="my-4 border-slate-200" />;
      }
      // Empty lines
      if (line.trim() === '') {
        return <br key={i} />;
      }
      // Normal text
      return <p key={i} className="mb-2">{line}</p>;
    });
  };

  // System context for chat - bevat MES-specifieke informatie EN handleiding
  const MES_CONTEXT = `Je bent een AI assistent voor FPi Future Factory, een MES (Manufacturing Execution System) voor de productie van PVC-buizen en fittings.

BELANGRIJK: Gebruik altijd proper Markdown formatting in je antwoorden:
- Gebruik **vetgedrukt** voor belangrijke termen
- Gebruik genummerde lijsten (1. 2. 3.) voor stappen
- Gebruik bullet points (- of *) voor opsommingen
- Gebruik ## voor hoofdkoppen en ### voor subkoppen
- Laat lege regels tussen alinea's voor leesbaarheid
- Gebruik code formatting voor technische termen en knoppen
- Gebruik --- voor visuele scheiding tussen secties waar nuttig

## PRODUCTIE INFORMATIE:

**GRE Specificaties:**
- GRE = Gereedstands- en Renvooiliggeld Eenheid
- EST = Eastern Standard Time specificaties (bijv. 32mm, 40mm, 50mm)
- CST = Canadian Standard Time specificaties (zwart, geleidend)
- Belangrijke producten: Wavistrong (drukriool), Bocht 87.5°, T-stukken, Moffen

**Afdelingen:**
- Spuitgieten: Productie van PVC componenten
- Verpakking: Afwerking en verpakken
- Lossen: Eindcontrole en verzending
- Nabewerking: Post-processing

**Ploegendiensten:**
- Ochtend: 05:30-14:00 (amber kleur)
- Avond: 14:00-22:30 (indigo kleur)
- Nacht: 22:30-05:30 (paars kleur)
- Dag: 07:15-16:00 (blauw kleur)

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
- Beantwoord in het Nederlands

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
- Beantwoord vragen altijd in het Nederlands
- Wees specifiek en verwijs naar de juiste modules/pagina's
- Gebruik Markdown formatting voor duidelijke structuur
- Gebruik genummerde stappen voor processen
- Gebruik bullet points voor lijsten
- Gebruik code formatting voor knoppen en technische termen`;

  // --- CHAT LOGICA ---
  const handleSendChat = async (e, queryOverride = null) => {
    if (e) e.preventDefault();
    const messageText = queryOverride || input;
    if (!messageText.trim() || isLoading) return;

    const userMsg = { role: "user", content: messageText };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      // Check of AI service geconfigureerd is
      if (!aiService.isConfigured()) {
        throw new Error('Google AI API key niet gevonden. Check .env bestand.');
      }

      // Maak chat history voor AI (zonder system messages in de array)
      const chatHistory = messages
        .filter(msg => msg.role !== "assistant" || msg.content !== messages[0].content)
        .map(msg => ({ role: msg.role, content: msg.content }));
      
      chatHistory.push(userMsg);

      console.log('📤 Sending to AI:', { historyLength: chatHistory.length, lastMessage: messageText.substring(0, 50) });

      // Stuur naar AI service met MES context als system prompt
      const response = await aiService.chat(chatHistory, MES_CONTEXT);

      console.log('📥 Received from AI:', response.substring(0, 100));

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: response,
        },
      ]);
      
      showSuccess('Antwoord ontvangen!');
    } catch (error) {
      console.error("AI Chat Error:", error);
      
      let errorMessage = "⚠️ AI verbinding mislukt: " + (error.message || "Onbekende fout");
      
      // Specifieke error messages
      if (error.message?.includes('API key')) {
        errorMessage = "⚠️ Google AI API key ontbreekt of is ongeldig. Check het .env bestand en herstart de server.";
      } else if (error.message?.includes('403')) {
        errorMessage = "⚠️ API key is niet geautoriseerd. Controleer of de Gemini API is ingeschakeld in Google Cloud Console.";
      } else if (error.message?.includes('429')) {
        errorMessage = "⚠️ Rate limit bereikt. Wacht een minuut en probeer opnieuw.";
      } else if (error.message?.includes('quota')) {
        errorMessage = "⚠️ API quota overschreden. Check je Google Cloud quota instellingen.";
      }
      
      showError(errorMessage);
      
      // Toon error in chat
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: errorMessage + "\n\n💡 Test de API met: Open browser console (F12) en typ:\n```\nimport('./src/services/testGemini.js').then(m => m.testGeminiAPI())\n```",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // --- TRAINING LOGICA ---
  const handleStartTraining = async (e) => {
    e.preventDefault();
    if (!trainingTopic.trim() || isGenerating) return;

    setIsGenerating(true);

    try {
      // Roep AI service aan om flashcards te genereren
      const flashcards = await aiService.generateFlashcards(
        trainingTopic,
        FLASHCARD_SYSTEM_PROMPT
      );

      if (flashcards && flashcards.flashcards && flashcards.flashcards.length > 0) {
        setFlashcardData(flashcards);
        showSuccess(`${flashcards.flashcards.length} flashcards gegenereerd!`);
      } else {
        throw new Error("Geen flashcards ontvangen");
      }
    } catch (error) {
      console.error("Flashcard Generation Error:", error);
      showError(error.message || "Kon geen flashcards genereren");
      
      // Fallback naar mock data bij error
      setFlashcardData(MOCK_FLASHCARDS);
      showError("Fout bij genereren, demo data wordt getoond");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 animate-in fade-in">
      {/* HEADER */}
      <div className="px-6 py-4 bg-white border-b border-slate-200 flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <Bot className="text-blue-600" />
            AI Assistent
          </h1>
          <p className="text-slate-500 font-medium text-sm mt-1">
            Stel vragen, vraag om uitleg, of start een trainingssessie.
          </p>
        </div>

        {/* TABS */}
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab("chat")}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${
              activeTab === "chat"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <MessageSquare size={16} /> Chat
          </button>
          <button
            onClick={() => setActiveTab("training")}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${
              activeTab === "training"
                ? "bg-white text-purple-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <GraduationCap size={16} /> Training
          </button>
        </div>
      </div>

      {/* CONTENT AREA */}
      <div className="flex-1 overflow-hidden relative">
        {/* === MODE: CHAT === */}
        {activeTab === "chat" && (
          <div className="h-full flex flex-col max-w-4xl mx-auto">
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-blue-600 text-white rounded-br-none"
                        : "bg-white border border-slate-200 text-slate-700 rounded-bl-none shadow-sm"
                    }`}
                  >
                    {msg.role === "user" ? (
                      msg.content
                    ) : (
                      <div className="prose prose-sm max-w-none">
                        {formatResponse(msg.content)}
                      </div>
                    )}
                  </div>
                </div>
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
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  disabled={isLoading}
                  className="bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Send size={20} />
                  )}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* === MODE: TRAINING === */}
        {activeTab === "training" && (
          <div className="h-full flex flex-col items-center justify-center p-6">
            {!flashcardData ? (
              <div className="w-full max-w-lg text-center space-y-6">
                <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mx-auto text-purple-600 mb-4">
                  <GraduationCap size={40} />
                </div>
                <h2 className="text-2xl font-black text-slate-900">
                  Start een Kennissessie
                </h2>
                <p className="text-slate-500">
                  Wil je je kennis over GRE, veiligheid of specifieke
                  productcodes testen? Voer een onderwerp in en de AI genereert
                  een oefenset voor je.
                </p>

                <form onSubmit={handleStartTraining} className="mt-8">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Bijv. 'Wavistrong Codes' of 'Veiligheid'"
                      className="w-full bg-white border-2 border-slate-200 rounded-2xl px-6 py-4 outline-none focus:border-purple-500 transition-colors shadow-sm text-lg"
                      value={trainingTopic}
                      onChange={(e) => setTrainingTopic(e.target.value)}
                      disabled={isGenerating}
                    />
                    <button
                      type="submit"
                      disabled={isGenerating || !trainingTopic}
                      className="absolute right-2 top-2 bottom-2 bg-purple-600 text-white px-6 rounded-xl font-bold uppercase tracking-wider hover:bg-purple-700 transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                      {isGenerating ? (
                        "Genereren..."
                      ) : (
                        <>
                          <Sparkles size={18} /> Start
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <FlashcardViewer
                data={flashcardData}
                onClose={() => setFlashcardData(null)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AiAssistantView;
