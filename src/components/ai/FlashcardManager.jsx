import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  Plus,
  Edit,
  Trash2,
  Save,
  X,
  Sparkles,
  TrendingUp,
  CheckCircle2,
  Clock,
  BarChart3,
  Loader2,
  Lightbulb,
  FileText,
  Factory,
} from "lucide-react";
import {
  collection,
  query,
  onSnapshot,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  orderBy,
  getDocs,
} from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import { aiService } from "../../services/aiService";

/**
 * FlashcardManager V1.0
 * Admin interface voor het maken en beheren van flashcards en het bekijken van resultaten.
 */
const FlashcardManager = () => {
  const { t } = useTranslation();
  const [flashcards, setFlashcards] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState("cards"); // 'cards' of 'results'
  const [editingCard, setEditingCard] = useState(null);
  const [newCard, setNewCard] = useState({
    front: "",
    back: "",
    category: "products",
    difficulty: "medium",
  });
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Load flashcards from Firestore
  useEffect(() => {
    const flashcardsRef = collection(db, "future-factory", "settings", "flashcards");
    const q = query(flashcardsRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setFlashcards(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error("Error loading flashcards:", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Load flashcard results
  useEffect(() => {
    const resultsRef = collection(db, "future-factory", "settings", "flashcard_results");
    const q = query(resultsRef, orderBy("timestamp", "desc"));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setResults(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => {
        console.error("Error loading results:", err);
      }
    );

    return () => unsubscribe();
  }, []);

  const handleSaveCard = async () => {
    if (!newCard.front.trim() || !newCard.back.trim()) {
      alert("Voer zowel een vraag als antwoord in.");
      return;
    }

    setSaving(true);
    try {
      const flashcardsRef = collection(db, "future-factory", "settings", "flashcards");
      await addDoc(flashcardsRef, {
        front: { text: newCard.front, language: "nl-NL" },
        back: { text: newCard.back, language: "nl-NL" },
        category: newCard.category,
        difficulty: newCard.difficulty,
        createdAt: serverTimestamp(),
        active: true,
      });
      
      setNewCard({ front: "", back: "", category: "products", difficulty: "medium" });
    } catch (error) {
      console.error("Error saving card:", error);
      alert("Kon kaart niet opslaan.");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateCard = async (id, updates) => {
    try {
      const cardRef = doc(db, "future-factory", "settings", "flashcards", id);
      await updateDoc(cardRef, {
        ...updates,
        updatedAt: serverTimestamp(),
      });
      setEditingCard(null);
    } catch (error) {
      console.error("Error updating card:", error);
    }
  };

  const handleDeleteCard = async (id) => {
    if (!window.confirm("Weet je zeker dat je deze kaart wilt verwijderen?")) return;
    
    try {
      await deleteDoc(doc(db, "future-factory", "settings", "flashcards", id));
    } catch (error) {
      console.error("Error deleting card:", error);
    }
  };

  // Calculate statistics
  const totalAttempts = results.length;
  const correctAnswers = results.filter(r => r.correct).length;
  const accuracy = totalAttempts > 0 ? ((correctAnswers / totalAttempts) * 100).toFixed(1) : 0;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-4 h-full">
        <Loader2 className="animate-spin text-purple-500" size={40} />
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 italic">
          Flashcards laden...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-6xl mx-auto p-6 text-left pb-32">
      {/* HEADER */}
      <div className="bg-gradient-to-br from-purple-600 to-purple-800 p-8 rounded-[40px] text-white relative overflow-hidden shadow-xl mb-10">
        <div className="absolute top-0 right-0 p-8 opacity-10 rotate-12">
          <BookOpen size={150} />
        </div>
        <div className="relative z-10 flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-black uppercase italic tracking-tighter leading-none mb-3">
              Flashcard <span className="text-purple-300">Manager</span>
            </h2>
            <p className="text-purple-200 text-sm font-medium max-w-xl">
              Maak en beheer interactieve leerkaarten voor training. Bekijk statistieken van gebruikers.
            </p>
          </div>
          <div className="flex gap-4">
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 p-4 rounded-2xl text-center">
              <div className="text-[8px] font-black text-purple-300 uppercase mb-1">Totaal Kaarten</div>
              <div className="text-2xl font-black">{flashcards.length}</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 p-4 rounded-2xl text-center">
              <div className="text-[8px] font-black text-purple-300 uppercase mb-1">Pogingen</div>
              <div className="text-2xl font-black">{totalAttempts}</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm border border-white/20 p-4 rounded-2xl text-center">
              <div className="text-[8px] font-black text-purple-300 uppercase mb-1">Correctheid</div>
              <div className="text-2xl font-black text-emerald-300">{accuracy}%</div>
            </div>
          </div>
        </div>
      </div>

      {/* VIEW TABS */}
      <div className="flex bg-slate-100 p-1 rounded-xl gap-1 w-fit">
        <button
          onClick={() => setActiveView("cards")}
          className={`px-6 py-3 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${
            activeView === "cards"
              ? "bg-white text-purple-600 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <BookOpen size={16} /> Kaarten Beheer
        </button>
        <button
          onClick={() => setActiveView("results")}
          className={`px-6 py-3 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${
            activeView === "results"
              ? "bg-white text-blue-600 shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          <BarChart3 size={16} /> Resultaten & Stats
        </button>
      </div>

      {/* CARDS VIEW */}
      {activeView === "cards" && (
        <div className="space-y-6">
                    {/* AI SUGGESTIONS BUTTON */}
                    <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-[3rem] p-6 border-2 border-blue-100">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h3 className="text-lg font-black text-slate-800 mb-2 flex items-center gap-2">
                            <Lightbulb size={20} className="text-yellow-600" /> AI Suggesties
                          </h3>
                          <p className="text-sm text-slate-600 font-medium">
                            Laat AI automatisch flashcards voorstellen op basis van geüploade PDF's, planning data en geverifieerde kennis.
                          </p>
                          <div className="flex gap-3 mt-3 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <FileText size={12} /> PDF Documenten
                            </span>
                            <span className="flex items-center gap-1">
                              <Factory size={12} /> Planning Data
                            </span>
                            <span className="flex items-center gap-1">
                              <BookOpen size={12} /> AI Kennisbank
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={handleGenerateSuggestions}
                          disabled={generating}
                          className="px-8 py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-black text-sm uppercase tracking-wider hover:shadow-xl active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50 shrink-0"
                        >
                          {generating ? (
                            <>
                              <Loader2 className="animate-spin" size={18} />
                              Genereren...
                            </>
                          ) : (
                            <>
                              <Sparkles size={18} />
                              Genereer Suggesties
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* SUGGESTIONS PANEL */}
                    {showSuggestions && suggestions.length > 0 && (
                      <div className="bg-white rounded-[3rem] p-8 border-2 border-purple-200 shadow-lg">
                        <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                          <Sparkles size={20} className="text-purple-600" /> AI Gegenereerde Suggesties
                          <span className="bg-purple-100 text-purple-600 px-3 py-1 rounded-full text-xs">
                            {suggestions.length} kaarten
                          </span>
                        </h3>
              
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {suggestions.map((suggestion, idx) => (
                            <div
                              key={idx}
                              className="bg-gradient-to-br from-purple-50 to-blue-50 border-2 border-purple-100 rounded-2xl p-6 hover:border-purple-300 transition-all"
                            >
                              <div className="flex justify-between items-start mb-4">
                                <div className="flex gap-2">
                                  <span className="text-[8px] font-black uppercase px-2 py-1 rounded-lg bg-purple-200 text-purple-700">
                                    {suggestion.category}
                                  </span>
                                  <span className="text-[8px] font-black uppercase px-2 py-1 rounded-lg bg-blue-200 text-blue-700">
                                    {suggestion.difficulty}
                                  </span>
                                </div>
                                <button
                                  onClick={() => setSuggestions(prev => prev.filter((_, i) => i !== idx))}
                                  className="p-1 text-slate-400 hover:text-rose-600 rounded-lg transition-all"
                                >
                                  <X size={16} />
                                </button>
                              </div>
                    
                              <div className="space-y-3 mb-4">
                                <div className="bg-white p-3 rounded-xl">
                                  <div className="text-[8px] font-black text-slate-500 uppercase mb-1">Vraag</div>
                                  <p className="text-sm font-bold text-slate-800">{suggestion.front}</p>
                                </div>
                                <div className="bg-white p-3 rounded-xl">
                                  <div className="text-[8px] font-black text-purple-600 uppercase mb-1">Antwoord</div>
                                  <p className="text-sm text-slate-700">{suggestion.back}</p>
                                </div>
                              </div>
                    
                              <button
                                onClick={() => handleAcceptSuggestion(suggestion)}
                                className="w-full bg-purple-600 text-white py-3 rounded-xl font-black text-xs uppercase tracking-wider hover:bg-purple-700 active:scale-95 transition-all flex items-center justify-center gap-2"
                              >
                                <CheckCircle2 size={16} />
                                Accepteer & Opslaan
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

          {/* NEW CARD FORM */}
          <div className="bg-white rounded-[3rem] p-8 border-2 border-purple-100 shadow-lg">
            <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
              <Plus size={20} className="text-purple-600" /> Nieuwe Flashcard Maken
            </h3>
            
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-600 uppercase mb-2">Categorie</label>
                  <select
                    value={newCard.category}
                    onChange={(e) => setNewCard({ ...newCard, category: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-purple-400 outline-none"
                  >
                    <option value="products">Producten</option>
                    <option value="procedures">Procedures</option>
                    <option value="safety">Veiligheid</option>
                    <option value="machines">Machines</option>
                    <option value="terminology">Terminologie</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-600 uppercase mb-2">Moeilijkheid</label>
                  <select
                    value={newCard.difficulty}
                    onChange={(e) => setNewCard({ ...newCard, difficulty: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-purple-400 outline-none"
                  >
                    <option value="easy">Makkelijk</option>
                    <option value="medium">Gemiddeld</option>
                    <option value="hard">Moeilijk</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-600 uppercase mb-2">Voorkant (Vraag)</label>
                <input
                  type="text"
                  value={newCard.front}
                  onChange={(e) => setNewCard({ ...newCard, front: e.target.value })}
                  placeholder="Bijv: Wat betekent EST?"
                  className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-purple-400 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-slate-600 uppercase mb-2">Achterkant (Antwoord)</label>
                <textarea
                  value={newCard.back}
                  onChange={(e) => setNewCard({ ...newCard, back: e.target.value })}
                  placeholder="Bijv: Epoxy Standard (Wavistrong Blauw)"
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-purple-400 outline-none"
                />
              </div>

              <button
                onClick={handleSaveCard}
                disabled={saving}
                className="w-full bg-purple-600 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-wider hover:bg-purple-700 shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                Kaart Opslaan
              </button>
            </div>
          </div>

          {/* EXISTING CARDS */}
          <div className="space-y-4">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <BookOpen size={18} className="text-purple-600" /> Bestaande Kaarten
              <span className="bg-purple-100 text-purple-600 px-3 py-0.5 rounded-full text-[10px]">
                {flashcards.length}
              </span>
            </h3>

            {flashcards.length === 0 ? (
              <div className="bg-slate-50 p-10 rounded-[3rem] text-center">
                <BookOpen size={48} className="mx-auto mb-4 text-slate-300" />
                <p className="text-sm text-slate-500 font-medium">
                  Nog geen flashcards. Maak je eerste kaart hierboven!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {flashcards.map((card) => (
                  <div
                    key={card.id}
                    className="bg-white border-2 border-slate-100 rounded-[2rem] p-6 hover:border-purple-200 transition-all shadow-sm"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex gap-2">
                        <span className="text-[8px] font-black uppercase px-2 py-1 rounded-lg bg-purple-100 text-purple-600">
                          {card.category}
                        </span>
                        <span className="text-[8px] font-black uppercase px-2 py-1 rounded-lg bg-slate-100 text-slate-600">
                          {card.difficulty}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDeleteCard(card.id)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="bg-slate-50 p-4 rounded-xl">
                        <div className="text-[8px] font-black text-slate-500 uppercase mb-1">Vraag</div>
                        <p className="text-sm font-bold text-slate-800">{card.front?.text}</p>
                      </div>
                      <div className="bg-purple-50 p-4 rounded-xl">
                        <div className="text-[8px] font-black text-purple-600 uppercase mb-1">Antwoord</div>
                        <p className="text-sm text-slate-700">{card.back?.text}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* RESULTS VIEW */}
      {activeView === "results" && (
        <div className="space-y-6">
          <div className="bg-white rounded-[3rem] p-8 border-2 border-blue-100 shadow-lg">
            <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
              <BarChart3 size={20} className="text-blue-600" /> Training Resultaten
            </h3>

            {results.length === 0 ? (
              <div className="bg-slate-50 p-10 rounded-[3rem] text-center">
                <TrendingUp size={48} className="mx-auto mb-4 text-slate-300" />
                <p className="text-sm text-slate-500 font-medium">
                  Nog geen resultaten. Begin met trainen om statistieken te zien!
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {results.slice(0, 50).map((result) => (
                  <div
                    key={result.id}
                    className={`p-4 rounded-xl border-2 flex items-center justify-between ${
                      result.correct
                        ? "bg-emerald-50 border-emerald-100"
                        : "bg-rose-50 border-rose-100"
                    }`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        {result.correct ? (
                          <CheckCircle2 size={18} className="text-emerald-600" />
                        ) : (
                          <X size={18} className="text-rose-600" />
                        )}
                        <span className="text-xs font-black text-slate-700">
                          {result.cardQuestion || "Vraag"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500">
                        <Clock size={12} />
                        {result.timestamp?.toDate?.()?.toLocaleString("nl-NL") || "Onbekend"}
                        <span className="mx-2">•</span>
                        <span>Gebruiker: {result.userId || "Anoniem"}</span>
                      </div>
                    </div>
                    <div className={`text-xs font-black uppercase px-3 py-1 rounded-lg ${
                      result.correct ? "bg-emerald-200 text-emerald-700" : "bg-rose-200 text-rose-700"
                    }`}>
                      {result.correct ? "Correct" : "Fout"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

  const handleGenerateSuggestions = async () => {
    setGenerating(true);
    setSuggestions([]);
    setShowSuggestions(true);
    
    try {
      // 1. Haal PDF documenten op
      const documents = await aiService.getAiDocuments(10);
      
      // 2. Haal planning data op
      const planningData = await aiService.getProductionOrders(10);
      
      // 3. Haal geverifieerde AI knowledge op
      const knowledgeRef = collection(db, "future-factory", "settings", "ai_knowledge_base");
      const knowledgeSnap = await getDocs(query(knowledgeRef, orderBy("timestamp", "desc")));
      const knowledgeItems = knowledgeSnap.docs
        .filter(doc => doc.data().verified)
        .slice(0, 10)
        .map(doc => ({
          question: doc.data().question || doc.data().userInput,
          answer: doc.data().correctedAnswer || doc.data().answer,
        }));
      
      // 4. Bouw context voor AI
      let contextText = "Genereer 5 educatieve flashcards voor training op basis van de volgende informatie:\n\n";
      
      if (documents.length > 0) {
        contextText += "=== PDF DOCUMENTEN ===\n";
        documents.forEach((doc, idx) => {
          contextText += `Document ${idx + 1}: ${doc.fileName}\n`;
          if (doc.analysis?.summary) contextText += `Samenvatting: ${doc.analysis.summary}\n`;
          if (doc.analysis?.keyFacts) contextText += `Kernpunten: ${doc.analysis.keyFacts.join("; ")}\n`;
          if (doc.analysis?.processes) contextText += `Processen: ${doc.analysis.processes.join("; ")}\n`;
          contextText += "\n";
        });
      }
      
      if (planningData.length > 0) {
        contextText += "\n=== PLANNING & PRODUCTIE ===\n";
        planningData.slice(0, 5).forEach((order, idx) => {
          contextText += `Order ${idx + 1}: ${order.orderId || order.name}\n`;
          if (order.name) contextText += `Product: ${order.name}\n`;
          if (order.status) contextText += `Status: ${order.status}\n`;
          if (order.workstation) contextText += `Werkstation: ${order.workstation}\n`;
          contextText += "\n";
        });
      }
      
      if (knowledgeItems.length > 0) {
        contextText += "\n=== GEVERIFIEERDE KENNIS ===\n";
        knowledgeItems.forEach((item, idx) => {
          contextText += `Q${idx + 1}: ${item.question}\n`;
          contextText += `A${idx + 1}: ${item.answer}\n\n`;
        });
      }
      
      contextText += `\nMAKE 5 FLASHCARDS met vraag en antwoord. Retourneer ALLEEN valid JSON zonder markdown:
{
  "flashcards": [
    {
      "front": "Vraag hier",
      "back": "Antwoord hier",
      "category": "products|procedures|safety|machines|terminology",
      "difficulty": "easy|medium|hard"
    }
  ]
}`;

      // 5. Vraag AI om flashcards te genereren
      const systemPrompt = "Je bent een educatieve training expert. Genereer relevante flashcards voor productie medewerkers.";
      const response = await aiService.chat([
        { role: "user", content: contextText }
      ], systemPrompt);
      
      // 6. Parse response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        if (data.flashcards && Array.isArray(data.flashcards)) {
          setSuggestions(data.flashcards);
        } else {
          throw new Error("Ongeldige flashcard data");
        }
      } else {
        throw new Error("Geen JSON gevonden in response");
      }
      
    } catch (error) {
      console.error("Error generating suggestions:", error);
      alert("Kon geen suggesties genereren: " + error.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleAcceptSuggestion = async (suggestion) => {
    try {
      const flashcardsRef = collection(db, "future-factory", "settings", "flashcards");
      await addDoc(flashcardsRef, {
        front: { text: suggestion.front, language: "nl-NL" },
        back: { text: suggestion.back, language: "nl-NL" },
        category: suggestion.category || "general",
        difficulty: suggestion.difficulty || "medium",
        createdAt: serverTimestamp(),
        active: true,
        aiGenerated: true,
      });
      
      // Verwijder uit suggesties
      setSuggestions(prev => prev.filter(s => s !== suggestion));
    } catch (error) {
      console.error("Error accepting suggestion:", error);
      alert("Kon kaart niet opslaan.");
    }
  };

export default FlashcardManager;
