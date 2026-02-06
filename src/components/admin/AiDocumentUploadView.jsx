import React, { useEffect, useMemo, useState } from "react";
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  BrainCircuit,
  Trash2,
  Search,
  Database,
} from "lucide-react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth, storage } from "../../config/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { PATHS } from "../../config/dbPaths";
import { aiService } from "../../services/aiService";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";

GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const MAX_CHARS = 50000;

const AiDocumentUploadView = () => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const colRef = collection(db, ...PATHS.AI_DOCUMENTS);
    const q = query(colRef, orderBy("uploadedAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setDocuments(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error("Fout bij laden AI documenten:", err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const visibleDocuments = useMemo(() => {
    if (!filter.trim()) return documents;
    const term = filter.toLowerCase();
    return documents.filter((docItem) => {
      const haystack = JSON.stringify({
        name: docItem.fileName,
        summary: docItem.analysis?.summary,
        tags: docItem.analysis?.tags,
        raw: docItem.analysisRaw,
      }).toLowerCase();
      return haystack.includes(term);
    });
  }, [documents, filter]);

  const extractJson = (text) => {
    if (!text) return null;
    
    // Verwijder alle markdown code blocks markers eerst
    let cleaned = text.trim()
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    
    // Als het begint en eindigt met {}, is het waarschijnlijk pure JSON
    if (cleaned.startsWith("{") && cleaned.endsWith("}")) {
      return cleaned;
    }
    
    // Probeer JSON object te vinden met verbeterde regex
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/m);
    if (jsonMatch) {
      let extracted = jsonMatch[0].trim();
      
      // Extra cleaning: verwijder trailing text na de laatste }
      const lastBrace = extracted.lastIndexOf('}');
      if (lastBrace !== -1) {
        extracted = extracted.substring(0, lastBrace + 1);
      }
      
      return extracted;
    }
    
    return null;
  };

  const analyzeDocument = async (text, fileName) => {
    const systemPrompt = `Je bent een AI die bedrijfsdocumenten analyseert voor een MES omgeving.

RETURN ONLY VALID JSON - NO MARKDOWN, NO EXPLANATION, JUST THE JSON OBJECT!

JSON Structure:
{
  "title": "",
  "summary": "",
  "keyFacts": [],
  "processes": [],
  "partNumbers": [],
  "tolerances": [],
  "stations": [],
  "dates": [],
  "warnings": [],
  "tags": [],
  "fullContext": ""
}

IMPORTANT RULES:
- Return ONLY the JSON object, nothing else
- NO markdown formatting, NO code blocks, NO explanations
- summary: minimaal 500 karakters met alle belangrijke details
- fullContext: volledige gestructureerde samenvatting (max 10000 karakters)
- keyFacts: alle belangrijke feiten, specificaties en details
- Arrays van strings voor specifieke categorieën
- Taal: Nederlands
- Wees volledig en uitgebreid
- Lege array [] als niets gevonden, lege string "" als niet van toepassing`;

    try {
      const response = await aiService.chat(
        [{ role: "user", content: `Bestandsnaam: ${fileName}\n\nDocument inhoud:\n${text}` }],
        systemPrompt
      );

      console.log('🔍 Raw AI Response:', response.substring(0, 200));

      const jsonText = extractJson(response);
      if (!jsonText) {
        console.warn('⚠️ Geen JSON gevonden in response');
        // Maak een basis analyse van de ruwe response
        return { 
          parsed: false, 
          analysisRaw: response, 
          analysis: {
            title: fileName,
            summary: response.substring(0, 1000),
            keyFacts: [],
            processes: [],
            partNumbers: [],
            tolerances: [],
            stations: [],
            dates: [],
            warnings: ["Automatische analyse - JSON parsing niet gelukt"],
            tags: ["niet-geparsed"],
            fullContext: response.substring(0, 10000)
          }
        };
      }

      const analysis = JSON.parse(jsonText);
      console.log('✅ JSON parsing succesvol');
      
      // Valideer en vul ontbrekende velden
      const validatedAnalysis = {
        title: analysis.title || fileName,
        summary: analysis.summary || "Geen samenvatting beschikbaar",
        keyFacts: Array.isArray(analysis.keyFacts) ? analysis.keyFacts : [],
        processes: Array.isArray(analysis.processes) ? analysis.processes : [],
        partNumbers: Array.isArray(analysis.partNumbers) ? analysis.partNumbers : [],
        tolerances: Array.isArray(analysis.tolerances) ? analysis.tolerances : [],
        stations: Array.isArray(analysis.stations) ? analysis.stations : [],
        dates: Array.isArray(analysis.dates) ? analysis.dates : [],
        warnings: Array.isArray(analysis.warnings) ? analysis.warnings : [],
        tags: Array.isArray(analysis.tags) ? analysis.tags : [],
        fullContext: analysis.fullContext || analysis.summary || ""
      };
      
      return { parsed: true, analysisRaw: response, analysis: validatedAnalysis };
    } catch (err) {
      console.error("Analyse fout:", err);
      // Fallback: maak een basis analyse
      return { 
        parsed: false, 
        analysisRaw: err.message, 
        analysis: {
          title: fileName,
          summary: `Fout bij analyseren: ${err.message}`,
          keyFacts: [],
          processes: [],
          partNumbers: [],
          tolerances: [],
          stations: [],
          dates: [],
          warnings: ["Analyse fout opgetreden"],
          tags: ["error"],
          fullContext: text.substring(0, 5000)
        }
      };
    }
  };

  const extractTextFromPdf = async (file) => {
    const buffer = await file.arrayBuffer();
    const pdf = await getDocument({ data: buffer }).promise;
    let fullText = "";

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item) => item.str).join(" ");
      fullText += `\n${pageText}`;
      if (fullText.length > MAX_CHARS * 3) {
        break;
      }
    }

    return fullText;
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = [
      "application/pdf",
      "text/plain",
      "text/markdown",
      "text/csv",
      "application/json",
    ];

    const extension = file.name?.toLowerCase() || "";
    const isPdfByName = extension.endsWith(".pdf");

    if (!allowed.includes(file.type) && !isPdfByName) {
      setStatus({
        type: "error",
        message:
          "Alleen .pdf, .txt, .md, .csv of .json bestanden zijn ondersteund.",
      });
      e.target.value = "";
      return;
    }

    setUploading(true);
    setStatus({ type: "info", message: "Document analyseren..." });

    try {
      let text = "";
      let fileUrl = null;
      // Upload bestand naar Firebase Storage
      const storageRef = ref(storage, `ai_documents/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      fileUrl = await getDownloadURL(storageRef);

      if (file.type === "application/pdf") {
        text = await extractTextFromPdf(file);
      } else {
        text = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result || "");
          reader.onerror = reject;
          reader.readAsText(file);
        });
      }

      const content = String(text).slice(0, MAX_CHARS);
      const analysisResult = await analyzeDocument(content, file.name);

      // Sla ook de volledige tekst op (tot 50000 chars) voor betere context
      const fullTextContent = String(text).slice(0, MAX_CHARS);
      
      await addDoc(collection(db, ...PATHS.AI_DOCUMENTS), {
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        uploadedAt: serverTimestamp(),
        uploadedBy: auth.currentUser?.email || "Admin",
        analysis: analysisResult.analysis,
        parsed: analysisResult.parsed,
        tags: analysisResult.analysis?.tags || [],
        fullText: fullTextContent, // Volledige tekst voor context
        characterCount: fullTextContent.length,
        fileUrl, // downloadlink naar storage
      });

      const statusMessage = analysisResult.parsed 
        ? "✅ Document succesvol geüpload, geanalyseerd en opgeslagen." 
        : "⚠️ Document geüpload en opgeslagen met basis analyse (JSON parsing verbeterd met fallback).";
      
      setStatus({
        type: "success",
        message: statusMessage,
      });
    } catch (err) {
      console.error("Upload fout:", err);
      setStatus({
        type: "error",
        message: "Fout bij uploaden, analyseren of opslaan van document.",
      });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Document verwijderen uit de AI kennisbank?")) return;
    try {
      await deleteDoc(doc(db, ...PATHS.AI_DOCUMENTS, id));
    } catch (err) {
      console.error("Verwijderen mislukt:", err);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-5xl mx-auto p-6 text-left pb-32">
      <div className="bg-slate-900 p-8 rounded-[40px] text-white flex flex-col md:flex-row items-center justify-between relative overflow-hidden shadow-xl mb-6 border border-white/5 gap-6">
        <div className="absolute top-0 right-0 p-8 opacity-5 rotate-12">
          <BrainCircuit size={150} />
        </div>
        <div className="relative z-10 text-left flex-1">
          <h2 className="text-2xl font-black uppercase italic tracking-tighter leading-none">
            AI <span className="text-blue-500">Documenten</span>
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1.5 text-[9px] font-black text-emerald-400 bg-white/5 px-2 py-0.5 rounded uppercase border border-white/10 italic">
              <Database size={10} /> {documents.length} records
            </span>
            <span className="text-[9px] font-mono text-slate-500 italic">
              /{PATHS.AI_DOCUMENTS.join("/")}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-[32px] p-6 shadow-sm space-y-6">
        <div className="flex items-center gap-3">
          <Upload className="text-blue-600" />
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">
            Document Upload & Analyse
          </h3>
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
          <label className="inline-flex items-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest cursor-pointer hover:bg-blue-700 transition">
            {uploading ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <Upload size={16} />
            )}
            Upload document
            <input
              type="file"
              accept=".pdf,.txt,.md,.csv,.json,application/pdf"
              onChange={handleFileUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
          <p className="text-xs text-slate-500">
            Ondersteund: .pdf, .txt, .md, .csv, .json. Max {MAX_CHARS} tekens per document.
            Alleen de AI-context wordt opgeslagen; het bestand zelf niet.
          </p>
        </div>

        {status && (
          <div
            className={`flex items-center gap-2 px-4 py-3 rounded-2xl text-xs font-bold uppercase tracking-widest border ${
              status.type === "success"
                ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                : status.type === "error"
                ? "bg-rose-50 text-rose-600 border-rose-200"
                : "bg-blue-50 text-blue-600 border-blue-200"
            }`}
          >
            {status.type === "success" ? (
              <CheckCircle2 size={14} />
            ) : status.type === "error" ? (
              <AlertTriangle size={14} />
            ) : (
              <Loader2 className="animate-spin" size={14} />
            )}
            {status.message}
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-[32px] p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <FileText className="text-slate-600" />
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-700">
              Geanalyseerde Documenten
            </h3>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              className="pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:border-blue-500 outline-none"
              placeholder="Zoeken..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-slate-500 text-xs">
            <Loader2 className="animate-spin" size={14} /> Laden...
          </div>
        ) : visibleDocuments.length === 0 ? (
          <div className="text-xs text-slate-500">Nog geen documenten opgeslagen.</div>
        ) : (
          <div className="space-y-4">
            {visibleDocuments.map((docItem) => (
              <div
                key={docItem.id}
                className="border border-slate-100 rounded-2xl p-4 bg-slate-50/50"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-bold text-slate-800">
                      {docItem.fileName}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {docItem.mimeType} • {Math.round((docItem.size || 0) / 1024)} KB
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(docItem.id)}
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition"
                    title="Verwijderen"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="mt-3 text-xs text-slate-600 space-y-2">
                  <div>
                    <span className="font-bold">Samenvatting:</span>{" "}
                    {docItem.analysis?.summary || "Geen samenvatting"}
                  </div>
                  
                  {docItem.characterCount && (
                    <div className="text-[10px] text-slate-500">
                      📊 Verwerkte tekst: {docItem.characterCount.toLocaleString()} karakters
                    </div>
                  )}
                  
                  {docItem.analysis?.keyFacts && docItem.analysis.keyFacts.length > 0 && (
                    <div className="mt-2">
                      <span className="font-bold text-[10px] text-slate-500 uppercase">Kernpunten:</span>
                      <ul className="mt-1 ml-4 list-disc text-[10px] text-slate-600 space-y-0.5">
                        {docItem.analysis.keyFacts.slice(0, 3).map((fact, idx) => (
                          <li key={idx}>{fact}</li>
                        ))}
                        {docItem.analysis.keyFacts.length > 3 && (
                          <li className="text-slate-400">...en {docItem.analysis.keyFacts.length - 3} meer</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>

                {Array.isArray(docItem.analysis?.tags) && docItem.analysis.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {docItem.analysis.tags.map((tag, idx) => (
                      <span
                        key={`${docItem.id}-tag-${idx}`}
                        className="px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-200 rounded-full text-[10px] font-bold"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {!docItem.parsed && (
                  <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded-lg text-[10px] text-amber-700 flex items-start gap-2">
                    <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" /> 
                    <div>
                      <div className="font-bold">Fallback Analyse Gebruikt</div>
                      <div className="text-[9px] mt-0.5">
                        AI kon geen gestructureerd JSON genereren, maar document is wel verwerkt en doorzoekbaar. 
                        De volledige tekst ({docItem.characterCount?.toLocaleString() || '?'} karakters) is opgeslagen voor context.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AiDocumentUploadView;
