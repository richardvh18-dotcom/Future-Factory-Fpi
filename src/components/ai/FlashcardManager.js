import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// @ts-nocheck
import { useState, useEffect } from "react";
import { BookOpen, Plus, Trash2, Save, X, Sparkles, TrendingUp, CheckCircle2, Clock, BarChart3, Loader2, Lightbulb, FileText, Factory, } from "lucide-react";
import { collection, query, onSnapshot, addDoc, doc, deleteDoc, serverTimestamp, orderBy, getDocs, } from "firebase/firestore";
import { db, auth, logActivity } from "../../config/firebase";
import { aiService } from "../../services/aiService";
import { useNotifications } from '../../contexts/NotificationContext';
/**
 * FlashcardManager V1.0
 * Admin interface voor het maken en beheren van flashcards en het bekijken van resultaten.
 */
const FlashcardManager = () => {
    const { notify } = useNotifications();
    const [flashcards, setFlashcards] = useState([]);
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeView, setActiveView] = useState("cards"); // 'cards' of 'results'
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
        const unsubscribe = onSnapshot(q, (snap) => {
            setFlashcards(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
            setLoading(false);
        }, (err) => {
            console.error("Error loading flashcards:", err);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);
    // Load flashcard results
    useEffect(() => {
        const resultsRef = collection(db, "future-factory", "settings", "flashcard_results");
        const q = query(resultsRef, orderBy("timestamp", "desc"));
        const unsubscribe = onSnapshot(q, (snap) => {
            setResults(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        }, (err) => {
            console.error("Error loading results:", err);
        });
        return () => unsubscribe();
    }, []);
    const handleSaveCard = async () => {
        if (!newCard.front.trim() || !newCard.back.trim()) {
            notify("Voer zowel een vraag als antwoord in.");
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
            await logActivity(auth.currentUser?.uid, "FLASHCARD_CREATE", `Flashcard aangemaakt (${newCard.category}/${newCard.difficulty})`);
            setNewCard({ front: "", back: "", category: "products", difficulty: "medium" });
        }
        catch (error) {
            console.error("Error saving card:", error);
            notify("Kon kaart niet opslaan.");
        }
        finally {
            setSaving(false);
        }
    };
    const handleDeleteCard = async (id) => {
        if (!window.confirm("Weet je zeker dat je deze kaart wilt verwijderen?"))
            return;
        try {
            await deleteDoc(doc(db, "future-factory", "settings", "flashcards", id));
            await logActivity(auth.currentUser?.uid, "FLASHCARD_DELETE", `Flashcard verwijderd: ${id}`);
        }
        catch (error) {
            console.error("Error deleting card:", error);
        }
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
                    if (doc.analysis?.summary)
                        contextText += `Samenvatting: ${doc.analysis.summary}\n`;
                    if (doc.analysis?.keyFacts)
                        contextText += `Kernpunten: ${doc.analysis.keyFacts.join("; ")}\n`;
                    if (doc.analysis?.processes)
                        contextText += `Processen: ${doc.analysis.processes.join("; ")}\n`;
                    contextText += "\n";
                });
            }
            if (planningData.length > 0) {
                contextText += "\n=== PLANNING & PRODUCTIE ===\n";
                planningData.slice(0, 5).forEach((order, idx) => {
                    contextText += `Order ${idx + 1}: ${order.orderId || order.name}\n`;
                    if (order.name)
                        contextText += `Product: ${order.name}\n`;
                    if (order.status)
                        contextText += `Status: ${order.status}\n`;
                    if (order.workstation)
                        contextText += `Werkstation: ${order.workstation}\n`;
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
                }
                else {
                    throw new Error("Ongeldige flashcard data");
                }
            }
            else {
                throw new Error("Geen JSON gevonden in response");
            }
        }
        catch (error) {
            console.error("Error generating suggestions:", error);
            notify("Kon geen suggesties genereren: " + error.message);
        }
        finally {
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
            await logActivity(auth.currentUser?.uid, "FLASHCARD_CREATE", `AI-suggestie opgeslagen als flashcard (${suggestion.category || "general"})`);
            // Verwijder uit suggesties
            setSuggestions(prev => prev.filter(s => s !== suggestion));
        }
        catch (error) {
            console.error("Error accepting suggestion:", error);
            notify("Kon kaart niet opslaan.");
        }
    };
    // Calculate statistics
    const totalAttempts = results.length;
    const correctAnswers = results.filter(r => r.correct).length;
    const accuracy = totalAttempts > 0 ? ((correctAnswers / totalAttempts) * 100).toFixed(1) : 0;
    if (loading) {
        return (_jsxs("div", { className: "flex flex-col items-center justify-center p-20 gap-4 h-full", children: [_jsx(Loader2, { className: "animate-spin text-purple-500", size: 40 }), _jsx("p", { className: "text-[10px] font-black uppercase tracking-widest text-slate-400 italic", children: "Flashcards laden..." })] }));
    }
    return (_jsxs("div", { className: "space-y-8 animate-in fade-in duration-500 max-w-6xl mx-auto p-6 text-left pb-32", children: [_jsxs("div", { className: "bg-gradient-to-br from-purple-600 to-purple-800 p-8 rounded-[40px] text-white relative overflow-hidden shadow-xl mb-10", children: [_jsx("div", { className: "absolute top-0 right-0 p-8 opacity-10 rotate-12", children: _jsx(BookOpen, { size: 150 }) }), _jsxs("div", { className: "relative z-10 flex justify-between items-start", children: [_jsxs("div", { children: [_jsxs("h2", { className: "text-2xl font-black uppercase italic tracking-tighter leading-none mb-3", children: ["Flashcard ", _jsx("span", { className: "text-purple-300", children: "Manager" })] }), _jsx("p", { className: "text-purple-200 text-sm font-medium max-w-xl", children: "Maak en beheer interactieve leerkaarten voor training. Bekijk statistieken van gebruikers." })] }), _jsxs("div", { className: "flex gap-4", children: [_jsxs("div", { className: "bg-white/10 backdrop-blur-sm border border-white/20 p-4 rounded-2xl text-center", children: [_jsx("div", { className: "text-[8px] font-black text-purple-300 uppercase mb-1", children: "Totaal Kaarten" }), _jsx("div", { className: "text-2xl font-black", children: flashcards.length })] }), _jsxs("div", { className: "bg-white/10 backdrop-blur-sm border border-white/20 p-4 rounded-2xl text-center", children: [_jsx("div", { className: "text-[8px] font-black text-purple-300 uppercase mb-1", children: "Pogingen" }), _jsx("div", { className: "text-2xl font-black", children: totalAttempts })] }), _jsxs("div", { className: "bg-white/10 backdrop-blur-sm border border-white/20 p-4 rounded-2xl text-center", children: [_jsx("div", { className: "text-[8px] font-black text-purple-300 uppercase mb-1", children: "Correctheid" }), _jsxs("div", { className: "text-2xl font-black text-emerald-300", children: [accuracy, "%"] })] })] })] })] }), _jsxs("div", { className: "flex bg-slate-100 p-1 rounded-xl gap-1 w-fit", children: [_jsxs("button", { onClick: () => setActiveView("cards"), className: `px-6 py-3 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeView === "cards"
                            ? "bg-white text-purple-600 shadow-sm"
                            : "text-slate-500 hover:text-slate-700"}`, children: [_jsx(BookOpen, { size: 16 }), " Kaarten Beheer"] }), _jsxs("button", { onClick: () => setActiveView("results"), className: `px-6 py-3 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${activeView === "results"
                            ? "bg-white text-blue-600 shadow-sm"
                            : "text-slate-500 hover:text-slate-700"}`, children: [_jsx(BarChart3, { size: 16 }), " Resultaten & Stats"] })] }), activeView === "cards" && (_jsxs("div", { className: "space-y-6", children: [_jsx("div", { className: "bg-gradient-to-r from-blue-50 to-purple-50 rounded-[3rem] p-6 border-2 border-blue-100", children: _jsxs("div", { className: "flex items-center justify-between", children: [_jsxs("div", { className: "flex-1", children: [_jsxs("h3", { className: "text-lg font-black text-slate-800 mb-2 flex items-center gap-2", children: [_jsx(Lightbulb, { size: 20, className: "text-yellow-600" }), " AI Suggesties"] }), _jsx("p", { className: "text-sm text-slate-600 font-medium", children: "Laat AI automatisch flashcards voorstellen op basis van ge\u00FCploade PDF's, planning data en geverifieerde kennis." }), _jsxs("div", { className: "flex gap-3 mt-3 text-xs text-slate-500", children: [_jsxs("span", { className: "flex items-center gap-1", children: [_jsx(FileText, { size: 12 }), " PDF Documenten"] }), _jsxs("span", { className: "flex items-center gap-1", children: [_jsx(Factory, { size: 12 }), " Planning Data"] }), _jsxs("span", { className: "flex items-center gap-1", children: [_jsx(BookOpen, { size: 12 }), " AI Kennisbank"] })] })] }), _jsx("button", { onClick: handleGenerateSuggestions, disabled: generating, className: "px-8 py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-black text-sm uppercase tracking-wider hover:shadow-xl active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50 shrink-0", children: generating ? (_jsxs(_Fragment, { children: [_jsx(Loader2, { className: "animate-spin", size: 18 }), "Genereren..."] })) : (_jsxs(_Fragment, { children: [_jsx(Sparkles, { size: 18 }), "Genereer Suggesties"] })) })] }) }), showSuggestions && suggestions.length > 0 && (_jsxs("div", { className: "bg-white rounded-[3rem] p-8 border-2 border-purple-200 shadow-lg", children: [_jsxs("h3", { className: "text-lg font-black text-slate-800 mb-6 flex items-center gap-2", children: [_jsx(Sparkles, { size: 20, className: "text-purple-600" }), " AI Gegenereerde Suggesties", _jsxs("span", { className: "bg-purple-100 text-purple-600 px-3 py-1 rounded-full text-xs", children: [suggestions.length, " kaarten"] })] }), _jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: suggestions.map((suggestion, idx) => (_jsxs("div", { className: "bg-gradient-to-br from-purple-50 to-blue-50 border-2 border-purple-100 rounded-2xl p-6 hover:border-purple-300 transition-all", children: [_jsxs("div", { className: "flex justify-between items-start mb-4", children: [_jsxs("div", { className: "flex gap-2", children: [_jsx("span", { className: "text-[8px] font-black uppercase px-2 py-1 rounded-lg bg-purple-200 text-purple-700", children: suggestion.category }), _jsx("span", { className: "text-[8px] font-black uppercase px-2 py-1 rounded-lg bg-blue-200 text-blue-700", children: suggestion.difficulty })] }), _jsx("button", { onClick: () => setSuggestions(prev => prev.filter((_, i) => i !== idx)), className: "p-1 text-slate-400 hover:text-rose-600 rounded-lg transition-all", children: _jsx(X, { size: 16 }) })] }), _jsxs("div", { className: "space-y-3 mb-4", children: [_jsxs("div", { className: "bg-white p-3 rounded-xl", children: [_jsx("div", { className: "text-[8px] font-black text-slate-500 uppercase mb-1", children: "Vraag" }), _jsx("p", { className: "text-sm font-bold text-slate-800", children: suggestion.front })] }), _jsxs("div", { className: "bg-white p-3 rounded-xl", children: [_jsx("div", { className: "text-[8px] font-black text-purple-600 uppercase mb-1", children: "Antwoord" }), _jsx("p", { className: "text-sm text-slate-700", children: suggestion.back })] })] }), _jsxs("button", { onClick: () => handleAcceptSuggestion(suggestion), className: "w-full bg-purple-600 text-white py-3 rounded-xl font-black text-xs uppercase tracking-wider hover:bg-purple-700 active:scale-95 transition-all flex items-center justify-center gap-2", children: [_jsx(CheckCircle2, { size: 16 }), "Accepteer & Opslaan"] })] }, idx))) })] })), _jsxs("div", { className: "bg-white rounded-[3rem] p-8 border-2 border-purple-100 shadow-lg", children: [_jsxs("h3", { className: "text-lg font-black text-slate-800 mb-6 flex items-center gap-2", children: [_jsx(Plus, { size: 20, className: "text-purple-600" }), " Nieuwe Flashcard Maken"] }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-xs font-black text-slate-600 uppercase mb-2", children: "Categorie" }), _jsxs("select", { value: newCard.category, onChange: (e) => setNewCard({ ...newCard, category: e.target.value }), className: "w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-purple-400 outline-none", children: [_jsx("option", { value: "products", children: "Producten" }), _jsx("option", { value: "procedures", children: "Procedures" }), _jsx("option", { value: "safety", children: "Veiligheid" }), _jsx("option", { value: "machines", children: "Machines" }), _jsx("option", { value: "terminology", children: "Terminologie" })] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-black text-slate-600 uppercase mb-2", children: "Moeilijkheid" }), _jsxs("select", { value: newCard.difficulty, onChange: (e) => setNewCard({ ...newCard, difficulty: e.target.value }), className: "w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-purple-400 outline-none", children: [_jsx("option", { value: "easy", children: "Makkelijk" }), _jsx("option", { value: "medium", children: "Gemiddeld" }), _jsx("option", { value: "hard", children: "Moeilijk" })] })] })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-black text-slate-600 uppercase mb-2", children: "Voorkant (Vraag)" }), _jsx("input", { type: "text", value: newCard.front, onChange: (e) => setNewCard({ ...newCard, front: e.target.value }), placeholder: "Bijv: Wat betekent EST?", className: "w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-purple-400 outline-none" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-black text-slate-600 uppercase mb-2", children: "Achterkant (Antwoord)" }), _jsx("textarea", { value: newCard.back, onChange: (e) => setNewCard({ ...newCard, back: e.target.value }), placeholder: "Bijv: Epoxy Standard (Wavistrong Blauw)", rows: 3, className: "w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-purple-400 outline-none" })] }), _jsxs("button", { onClick: handleSaveCard, disabled: saving, className: "w-full bg-purple-600 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-wider hover:bg-purple-700 shadow-lg flex items-center justify-center gap-2 disabled:opacity-50", children: [saving ? _jsx(Loader2, { className: "animate-spin", size: 18 }) : _jsx(Save, { size: 18 }), "Kaart Opslaan"] })] })] }), _jsxs("div", { className: "space-y-4", children: [_jsxs("h3", { className: "text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2", children: [_jsx(BookOpen, { size: 18, className: "text-purple-600" }), " Bestaande Kaarten", _jsx("span", { className: "bg-purple-100 text-purple-600 px-3 py-0.5 rounded-full text-[10px]", children: flashcards.length })] }), flashcards.length === 0 ? (_jsxs("div", { className: "bg-slate-50 p-10 rounded-[3rem] text-center", children: [_jsx(BookOpen, { size: 48, className: "mx-auto mb-4 text-slate-300" }), _jsx("p", { className: "text-sm text-slate-500 font-medium", children: "Nog geen flashcards. Maak je eerste kaart hierboven!" })] })) : (_jsx("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-4", children: flashcards.map((card) => (_jsxs("div", { className: "bg-white border-2 border-slate-100 rounded-[2rem] p-6 hover:border-purple-200 transition-all shadow-sm", children: [_jsxs("div", { className: "flex justify-between items-start mb-4", children: [_jsxs("div", { className: "flex gap-2", children: [_jsx("span", { className: "text-[8px] font-black uppercase px-2 py-1 rounded-lg bg-purple-100 text-purple-600", children: card.category }), _jsx("span", { className: "text-[8px] font-black uppercase px-2 py-1 rounded-lg bg-slate-100 text-slate-600", children: card.difficulty })] }), _jsx("div", { className: "flex gap-2", children: _jsx("button", { onClick: () => handleDeleteCard(card.id), className: "p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all", children: _jsx(Trash2, { size: 16 }) }) })] }), _jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "bg-slate-50 p-4 rounded-xl", children: [_jsx("div", { className: "text-[8px] font-black text-slate-500 uppercase mb-1", children: "Vraag" }), _jsx("p", { className: "text-sm font-bold text-slate-800", children: card.front?.text })] }), _jsxs("div", { className: "bg-purple-50 p-4 rounded-xl", children: [_jsx("div", { className: "text-[8px] font-black text-purple-600 uppercase mb-1", children: "Antwoord" }), _jsx("p", { className: "text-sm text-slate-700", children: card.back?.text })] })] })] }, card.id))) }))] })] })), activeView === "results" && (_jsx("div", { className: "space-y-6", children: _jsxs("div", { className: "bg-white rounded-[3rem] p-8 border-2 border-blue-100 shadow-lg", children: [_jsxs("h3", { className: "text-lg font-black text-slate-800 mb-6 flex items-center gap-2", children: [_jsx(BarChart3, { size: 20, className: "text-blue-600" }), " Training Resultaten"] }), results.length === 0 ? (_jsxs("div", { className: "bg-slate-50 p-10 rounded-[3rem] text-center", children: [_jsx(TrendingUp, { size: 48, className: "mx-auto mb-4 text-slate-300" }), _jsx("p", { className: "text-sm text-slate-500 font-medium", children: "Nog geen resultaten. Begin met trainen om statistieken te zien!" })] })) : (_jsx("div", { className: "space-y-3", children: results.slice(0, 50).map((result) => (_jsxs("div", { className: `p-4 rounded-xl border-2 flex items-center justify-between ${result.correct
                                    ? "bg-emerald-50 border-emerald-100"
                                    : "bg-rose-50 border-rose-100"}`, children: [_jsxs("div", { className: "flex-1", children: [_jsxs("div", { className: "flex items-center gap-3 mb-2", children: [result.correct ? (_jsx(CheckCircle2, { size: 18, className: "text-emerald-600" })) : (_jsx(X, { size: 18, className: "text-rose-600" })), _jsx("span", { className: "text-xs font-black text-slate-700", children: result.cardQuestion || "Vraag" })] }), _jsxs("div", { className: "flex items-center gap-2 text-[10px] text-slate-500", children: [_jsx(Clock, { size: 12 }), result.timestamp?.toDate?.()?.toLocaleString("nl-NL") || "Onbekend", _jsx("span", { className: "mx-2", children: "\u2022" }), _jsxs("span", { children: ["Gebruiker: ", result.userId || "Anoniem"] })] })] }), _jsx("div", { className: `text-xs font-black uppercase px-3 py-1 rounded-lg ${result.correct ? "bg-emerald-200 text-emerald-700" : "bg-rose-200 text-rose-700"}`, children: result.correct ? "Correct" : "Fout" })] }, result.id))) }))] }) }))] }));
};
export default FlashcardManager;
