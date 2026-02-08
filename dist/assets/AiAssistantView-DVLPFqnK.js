import{c as F,j as e,K as _,X as se,o as W,g as ne,p as re,T as P,V as ie,r as oe,h as le,e as V,d as K,W as ce}from"./index-BTvH6YyB.js";import{r as d,b as de,u as ue,h as H}from"./react-vendor-CkwvfVK2.js";import{l as pe,p as ge,k as me,j as he,s as be}from"./firebase-CLQDquqN.js";import{B as fe}from"./book-open-DOiWVfBN.js";import{C as xe}from"./chevron-left-Bhajs37j.js";import{_ as ke,a as ve}from"./pdf-CDWh1jo9.js";/**
 * @license lucide-react v0.309.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const U=F("GraduationCap",[["path",{d:"M22 10v6M2 10l10-5 10 5-10 5z",key:"1ef52a"}],["path",{d:"M6 12v5c3 3 9 3 12 0v-5",key:"1f75yj"}]]);/**
 * @license lucide-react v0.309.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const je=F("Paperclip",[["path",{d:"m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48",key:"1u3ebp"}]]);/**
 * @license lucide-react v0.309.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const ye=F("RotateCw",[["path",{d:"M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8",key:"1p45f6"}],["path",{d:"M21 3v5h-5",key:"1q7to0"}]]),we=({data:u,onClose:f})=>{const[x,N]=d.useState(0),[k,v]=d.useState(!1);if(d.useEffect(()=>{const p="flashcard-3d-styles";if(!document.getElementById(p)){const h=document.createElement("style");h.id=p,h.innerText=`
        .perspective-1000 { perspective: 1000px; }
        .transform-style-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; -webkit-backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
      `,document.head.appendChild(h)}},[]),!u||!u.flashcards||u.flashcards.length===0)return null;const m=u.flashcards,j=m[x],y=()=>{v(!1),setTimeout(()=>{N(p=>(p+1)%m.length)},150)},S=()=>{v(!1),setTimeout(()=>{N(p=>(p-1+m.length)%m.length)},150)};return e.jsxs("div",{className:"flex flex-col items-center justify-center h-full w-full p-4 animate-in fade-in zoom-in-95 text-left",children:[e.jsxs("div",{className:"mb-10 flex items-center justify-between w-full max-w-xl bg-white/50 backdrop-blur-sm p-4 rounded-[25px] border border-slate-200",children:[e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsx("div",{className:"p-2 bg-purple-600 text-white rounded-xl shadow-lg",children:e.jsx(_,{size:16})}),e.jsxs("span",{className:"text-[10px] font-black text-slate-800 uppercase tracking-[0.2em] italic",children:["Kaart ",x+1," ",e.jsx("span",{className:"text-slate-300 mx-1",children:"/"})," ",m.length]})]}),e.jsx("button",{onClick:f,className:"p-2 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-xl transition-all active:scale-90",children:e.jsx(se,{size:20})})]}),e.jsx("div",{className:"relative w-full max-w-xl aspect-[3/2] cursor-pointer group perspective-1000",onClick:()=>v(!k),children:e.jsxs("div",{className:`w-full h-full transition-all duration-700 ease-in-out transform-style-3d relative ${k?"rotate-y-180":""}`,children:[e.jsxs("div",{className:"absolute inset-0 backface-hidden bg-white rounded-[45px] shadow-2xl border-2 border-slate-100 flex flex-col items-center justify-center p-12 text-center hover:border-purple-300 transition-all group-hover:shadow-purple-900/5",children:[e.jsx("div",{className:"mb-6 p-4 bg-purple-50 text-purple-600 rounded-[20px] ring-8 ring-purple-50/50",children:e.jsx(fe,{size:32,strokeWidth:2.5})}),e.jsx("h3",{className:"text-2xl md:text-3xl font-black text-slate-900 tracking-tighter uppercase italic leading-tight",children:j.front.text}),e.jsxs("div",{className:"absolute bottom-10 flex flex-col items-center gap-2 opacity-40 group-hover:opacity-100 transition-opacity",children:[e.jsx("span",{className:"text-[8px] font-black text-slate-400 uppercase tracking-[0.4em]",children:"Klik om te onthullen"}),e.jsx(Ne,{className:"text-slate-300 animate-bounce",size:16})]})]}),e.jsxs("div",{className:"absolute inset-0 backface-hidden bg-slate-900 text-white rounded-[45px] shadow-2xl flex flex-col items-center justify-center p-12 text-center rotate-y-180 border border-white/10 overflow-hidden",children:[e.jsx("div",{className:"absolute top-0 right-0 p-8 opacity-5 -rotate-12",children:e.jsx(W,{size:150})}),e.jsx("div",{className:"mb-6 p-4 bg-white/10 text-emerald-400 rounded-[20px] backdrop-blur-md relative z-10",children:e.jsx(ye,{size:32,strokeWidth:2.5})}),e.jsxs("div",{className:"relative z-10 max-w-md",children:[e.jsx("h4",{className:"text-[10px] font-black text-emerald-500 uppercase tracking-[0.3em] mb-4",children:"Definitie / Antwoord"}),e.jsx("p",{className:"text-lg md:text-xl font-medium leading-relaxed italic text-slate-200",children:j.back.text})]})]})]})}),e.jsxs("div",{className:"mt-12 flex items-center gap-6 animate-in slide-in-from-bottom-4 duration-700",children:[e.jsx("button",{onClick:p=>{p.stopPropagation(),S()},className:"p-5 rounded-3xl bg-white border-2 border-slate-100 text-slate-400 hover:text-purple-600 hover:border-purple-200 shadow-xl active:scale-90 transition-all group",title:"Vorige kaart",children:e.jsx(xe,{size:28,className:"group-hover:-translate-x-1 transition-transform"})}),e.jsxs("button",{onClick:p=>{p.stopPropagation(),y()},className:"px-12 py-5 rounded-[25px] bg-slate-900 text-white font-black uppercase text-xs tracking-[0.3em] hover:bg-purple-600 shadow-2xl active:scale-95 transition-all flex items-center gap-3 group",children:["Volgende"," ",e.jsx(ne,{size:18,className:"group-hover:translate-x-1 transition-transform"})]}),e.jsxs("div",{className:"hidden sm:flex items-center gap-3 px-6 py-4 bg-slate-100 rounded-[22px] border border-slate-200 opacity-50",children:[e.jsx(W,{size:16,className:"text-emerald-500"}),e.jsx("span",{className:"text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none",children:"Training Mode: Active"})]})]})]})},Ne=({className:u,size:f})=>e.jsx("svg",{width:f,height:f,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"3",strokeLinecap:"round",strokeLinejoin:"round",className:u,children:e.jsx("path",{d:"m6 9 6 6 6-6"})}),Se=`
**Objective:** Generate flashcards to help a user memorize information and key concepts about the FPi Future Factory, GRE products, and safety procedures.

### Flashcard Content Types:
A. Vocabulary (e.g. "EST", "CST", "PN")
B. Process Knowledge (e.g. "Stappen van lamineren")
C. Safety & Quality (e.g. "Wat te doen bij afkeur?")

### Flashcard Format
Return ONLY a valid JSON object with the following structure:
{
  "flashcards": [
    {
       "front": {"text": "Vraag of Term", "language": "nl-NL"},
       "back": {"text": "Antwoord of Definitie", "language": "nl-NL"}
    }
  ]
}
`,Ae={flashcards:[{front:{text:"Wat betekent EST?",language:"nl-NL"},back:{text:"Epoxy Standard (Wavistrong Blauw)",language:"nl-NL"}},{front:{text:"Wat is de tolerantie voor ID bij DN350?",language:"nl-NL"},back:{text:"+/- 1.5 mm",language:"nl-NL"}},{front:{text:"Wat moet je doen bij een 'Pending' status?",language:"nl-NL"},back:{text:"Wachten op verificatie door een engineer (Vier-ogen principe).",language:"nl-NL"}},{front:{text:"Wat is de kleur van een CST leiding?",language:"nl-NL"},back:{text:"Zwart (Conductive / Geleidend)",language:"nl-NL"}},{front:{text:"Waar staat BM01 voor?",language:"nl-NL"},back:{text:"Bovenloop Machine 1 (Eindinspectie & Afwerking)",language:"nl-NL"}}]};ve.workerSrc=new URL("/assets/pdf.worker.min-yatZIOMy.mjs",import.meta.url).toString();const Ge=()=>{const{showError:u,showSuccess:f}=re(),x=de(),N=ue(),[k,v]=d.useState("chat"),[m,j]=d.useState(!1),[y,S]=d.useState(!1),p=H.useRef(null),h=H.useRef(null),[A,w]=d.useState([{role:"assistant",content:`Hallo! 👋 Ik ben de **FPi AI Assistent**.

Ik kan je helpen met:

- ❓ Vragen over producten, voorraad of technische specificaties
- 📖 Uitleg over hoe het systeem werkt
- 🧭 Navigatie naar de juiste modules
- 💡 Tips en best practices

**Tip:** Gebruik de zoekbalk in de header en klik op het Bot icoon voor snelle vragen!

Waar kan ik je mee helpen?`}]),[z,E]=d.useState("");d.useEffect(()=>{var s;(s=x.state)!=null&&s.initialQuery&&(E(x.state.initialQuery),setTimeout(()=>{B(null,x.state.initialQuery)},100),window.history.replaceState({},document.title))},[x]),d.useEffect(()=>{var s;(s=p.current)==null||s.scrollIntoView({behavior:"smooth"})},[A]);const[C,J]=d.useState(""),[D,L]=d.useState(null),[T,M]=d.useState(!1),$=s=>{const t=a=>{const n=/N\d{8,}/gi;if(!n.test(a))return a;n.lastIndex=0;const o=[];let r=0,l;for(;(l=n.exec(a))!==null;){l.index>r&&o.push(a.substring(r,l.index));const b=l[0];o.push(e.jsxs("button",{onClick:()=>{N("/planning",{state:{searchOrder:b,initialView:"FITTINGS"}})},className:"inline-flex items-center gap-1 px-2 py-0.5 mx-1 text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100",title:`Ga naar order ${b}`,children:[e.jsx("span",{children:"📦"}),e.jsx("span",{children:b})]},`order-${l.index}`)),r=l.index+l[0].length}return r<a.length&&o.push(a.substring(r)),o};return s.split(`
`).map((a,n)=>a.startsWith("### ")?e.jsx("h3",{className:"text-base font-bold mt-3 mb-2 first:mt-0",children:a.replace("### ","")},n):a.startsWith("## ")?e.jsx("h2",{className:"text-lg font-bold mt-4 mb-2 first:mt-0",children:a.replace("## ","")},n):a.startsWith("**")&&a.endsWith("**")?e.jsx("p",{className:"font-bold mb-2",children:a.replace(/\*\*/g,"")},n):a.match(/^\d+\./)?e.jsx("li",{className:"ml-6 mb-1 list-decimal",children:t(a.replace(/^\d+\.\s/,""))},n):a.startsWith("- ")||a.startsWith("* ")?e.jsx("li",{className:"ml-6 mb-1 list-disc",children:t(a.substring(2))},n):a==="---"?e.jsx("hr",{className:"my-4 border-slate-200"},n):a.trim()===""?e.jsx("br",{},n):e.jsx("p",{className:"mb-2",children:t(a)},n))},[Q,G]=d.useState("");d.useEffect(()=>{(async()=>{try{const t=pe(V,...K.AI_CONFIG),a=await ge(t);a.exists()&&a.data().systemPrompt?G(a.data().systemPrompt):G(R)}catch(t){console.error("Kon AI context niet laden, gebruik fallback:",t),G(R)}})()},[]);const R=`Je bent een AI assistent voor FPi Future Factory, een MES (Manufacturing Execution System) voor de productie van PVC-buizen en fittings.

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
- Gebruik code formatting voor knoppen en technische termen`,O=5e4,Z=s=>{if(!s)return null;let t=s.trim().replace(/```json/gi,"").replace(/```/g,"").trim();if(t.startsWith("{")&&t.endsWith("}"))return t;const a=t.match(/\{[\s\S]*\}/m);if(a){let n=a[0].trim();const o=n.lastIndexOf("}");return o!==-1&&(n=n.substring(0,o+1)),n}return null},Y=async(s,t)=>{const a=`Je bent een AI die bedrijfsdocumenten analyseert voor een MES omgeving.

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
- Lege array [] als niets gevonden, lege string "" als niet van toepassing`;try{const n=await P.chat([{role:"user",content:`Bestandsnaam: ${t}

Document inhoud:
${s}`}],a);console.log("🔍 Raw AI Response:",n.substring(0,200));const o=Z(n);if(!o)return console.warn("⚠️ Geen JSON gevonden in response"),{parsed:!1,analysis:{title:t,summary:n.substring(0,1e3),keyFacts:[],processes:[],partNumbers:[],tolerances:[],stations:[],dates:[],warnings:["Automatische analyse - JSON parsing niet gelukt"],tags:["niet-geparsed"],fullContext:n.substring(0,1e4)}};const r=JSON.parse(o);return console.log("✅ JSON parsing succesvol"),{parsed:!0,analysis:{title:r.title||t,summary:r.summary||"Geen samenvatting beschikbaar",keyFacts:Array.isArray(r.keyFacts)?r.keyFacts:[],processes:Array.isArray(r.processes)?r.processes:[],partNumbers:Array.isArray(r.partNumbers)?r.partNumbers:[],tolerances:Array.isArray(r.tolerances)?r.tolerances:[],stations:Array.isArray(r.stations)?r.stations:[],dates:Array.isArray(r.dates)?r.dates:[],warnings:Array.isArray(r.warnings)?r.warnings:[],tags:Array.isArray(r.tags)?r.tags:[],fullContext:r.fullContext||r.summary||""}}}catch(n){return console.error("Analyse fout:",n),{parsed:!1,analysis:{title:t,summary:`Fout bij analyseren: ${n.message}`,keyFacts:[],processes:[],partNumbers:[],tolerances:[],stations:[],dates:[],warnings:["Analyse fout opgetreden"],tags:["error"],fullContext:s.substring(0,5e3)}}}},q=async s=>{const t=await s.arrayBuffer(),a=await ke({data:t}).promise;let n="";for(let o=1;o<=a.numPages;o+=1){const b=(await(await a.getPage(o)).getTextContent()).items.map(i=>i.str).join(" ");if(n+=`
${b}`,n.length>O*3)break}return n},X=async s=>{var n,o,r;const t=(n=s.target.files)==null?void 0:n[0];if(!t)return;if(!["application/pdf","text/plain","text/markdown","text/csv","application/json"].includes(t.type)){u("Alleen .pdf, .txt, .md, .csv of .json bestanden zijn ondersteund."),s.target.value="";return}S(!0);try{let l="";t.type==="application/pdf"?l=await q(t):l=await new Promise((c,ae)=>{const I=new FileReader;I.onload=()=>c(I.result||""),I.onerror=ae,I.readAsText(t)});const b=String(l).slice(0,O),i=await Y(b,t.name);if(!i.parsed||!i.analysis){u("Analyse mislukt. Probeer een ander document of formaat.");return}const g=String(l).slice(0,O);await me(he(V,...K.AI_DOCUMENTS),{fileName:t.name,mimeType:t.type,size:t.size,uploadedAt:be(),uploadedBy:((o=ce.currentUser)==null?void 0:o.email)||"Admin",analysis:i.analysis,parsed:!0,tags:((r=i.analysis)==null?void 0:r.tags)||[],fullText:g,characterCount:g.length}),w(c=>[...c,{role:"assistant",content:"📄 Document verwerkt en context opgeslagen. Je kunt nu vragen stellen over deze info."}]),f("Document geanalyseerd en opgeslagen.")}catch(l){console.error("Document upload fout:",l),u("Fout bij analyseren of opslaan van document.")}finally{S(!1),s.target.value=""}},B=async(s,t=null)=>{var o,r,l,b;s&&s.preventDefault();const a=t||z;if(!a.trim()||m)return;h.current&&h.current.abort(),h.current=new AbortController;const n={role:"user",content:a};w(i=>[...i,n]),E(""),j(!0);try{if(!P.isConfigured())throw new Error("Google AI API key niet gevonden. Check .env bestand.");const i=A.filter(c=>c.role!=="assistant"||c.content!==A[0].content).map(c=>({role:c.role,content:c.content}));i.push(n),console.log("📤 Sending to AI:",{historyLength:i.length,lastMessage:a.substring(0,50)});const g=await P.chatWithContext(i,Q||R,!0,{signal:h.current.signal});console.log("📥 Received from AI:",g.substring(0,100)),w(c=>[...c,{role:"assistant",content:g}]),f("Antwoord ontvangen!")}catch(i){if((i==null?void 0:i.name)==="AbortError"){w(c=>[...c,{role:"assistant",content:"⏹️ Antwoord gestopt op verzoek."}]),f("AI gestopt.");return}console.error("AI Chat Error:",i);let g="⚠️ AI verbinding mislukt: "+(i.message||"Onbekende fout");(o=i.message)!=null&&o.includes("API key")?g="⚠️ Google AI API key ontbreekt of is ongeldig. Check het .env bestand en herstart de server.":(r=i.message)!=null&&r.includes("403")?g="⚠️ API key is niet geautoriseerd. Controleer of de Gemini API is ingeschakeld in Google Cloud Console.":(l=i.message)!=null&&l.includes("429")?g="⚠️ Rate limit bereikt. Wacht een minuut en probeer opnieuw.":(b=i.message)!=null&&b.includes("quota")&&(g="⚠️ API quota overschreden. Check je Google Cloud quota instellingen."),u(g),w(c=>[...c,{role:"assistant",content:g+"\n\n💡 Test de API met: Open browser console (F12) en typ:\n```\nimport('./src/services/testGemini.js').then(m => m.testGeminiAPI())\n```"}])}finally{j(!1),h.current=null}},ee=()=>{h.current&&h.current.abort()},te=async s=>{if(s.preventDefault(),!(!C.trim()||T)){M(!0);try{const t=await P.generateFlashcards(C,Se);if(t&&t.flashcards&&t.flashcards.length>0)L(t),f(`${t.flashcards.length} flashcards gegenereerd!`);else throw new Error("Geen flashcards ontvangen")}catch(t){console.error("Flashcard Generation Error:",t),u(t.message||"Kon geen flashcards genereren"),L(Ae),u("Fout bij genereren, demo data wordt getoond")}finally{M(!1)}}};return e.jsxs("div",{className:"flex flex-col h-full bg-slate-50 animate-in fade-in",children:[e.jsxs("div",{className:"px-6 py-4 bg-white border-b border-slate-200 flex justify-between items-center shrink-0",children:[e.jsxs("div",{children:[e.jsxs("h1",{className:"text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3",children:[e.jsx(ie,{className:"text-blue-600"}),"AI Assistent"]}),e.jsx("p",{className:"text-slate-500 font-medium text-sm mt-1",children:"Stel vragen, vraag om uitleg, of start een trainingssessie."})]}),e.jsxs("div",{className:"flex bg-slate-100 p-1 rounded-xl",children:[e.jsxs("button",{onClick:()=>v("chat"),className:`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${k==="chat"?"bg-white text-blue-600 shadow-sm":"text-slate-500 hover:text-slate-700"}`,children:[e.jsx(oe,{size:16})," Chat"]}),e.jsxs("button",{onClick:()=>v("training"),className:`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${k==="training"?"bg-white text-purple-600 shadow-sm":"text-slate-500 hover:text-slate-700"}`,children:[e.jsx(U,{size:16})," Training"]})]})]}),e.jsxs("div",{className:"flex-1 overflow-hidden relative",children:[k==="chat"&&e.jsxs("div",{className:"h-full flex flex-col max-w-4xl mx-auto",children:[e.jsxs("div",{className:"flex-1 overflow-y-auto p-6 space-y-4",children:[A.map((s,t)=>e.jsx("div",{className:`flex ${s.role==="user"?"justify-end":"justify-start"}`,children:e.jsx("div",{className:`max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed ${s.role==="user"?"bg-blue-600 text-white rounded-br-none":"bg-white border border-slate-200 text-slate-700 rounded-bl-none shadow-sm"}`,children:s.role==="user"?s.content:e.jsx("div",{className:"prose prose-sm max-w-none",children:$(s.content)})})},t)),e.jsx("div",{ref:p})]}),e.jsx("div",{className:"p-4 bg-white border-t border-slate-200",children:e.jsxs("form",{onSubmit:B,className:"flex gap-2",children:[e.jsx("input",{type:"text",className:"flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-blue-500 transition-colors",placeholder:"Typ je vraag...",value:z,onChange:s=>E(s.target.value),disabled:m||y}),e.jsxs("label",{className:`inline-flex items-center justify-center p-3 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer ${y?"opacity-50 cursor-not-allowed":""}`,title:"Upload document (PDF of tekst)",children:[e.jsx(je,{size:18}),e.jsx("input",{type:"file",accept:".pdf,.txt,.md,.csv,.json",onChange:X,disabled:y,className:"hidden"})]}),e.jsx("button",{type:"button",onClick:ee,disabled:!m,className:"bg-white text-slate-700 border border-slate-200 p-3 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",title:"Stop antwoord",children:"Stop"}),e.jsx("button",{type:"submit",disabled:m,className:"bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",children:m?e.jsx("div",{className:"w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"}):e.jsx(le,{size:20})})]})})]}),k==="training"&&e.jsx("div",{className:"h-full flex flex-col items-center justify-center p-6",children:D?e.jsx(we,{data:D,onClose:()=>L(null)}):e.jsxs("div",{className:"w-full max-w-lg text-center space-y-6",children:[e.jsx("div",{className:"w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mx-auto text-purple-600 mb-4",children:e.jsx(U,{size:40})}),e.jsx("h2",{className:"text-2xl font-black text-slate-900",children:"Start een Kennissessie"}),e.jsx("p",{className:"text-slate-500",children:"Wil je je kennis over GRE, veiligheid of specifieke productcodes testen? Voer een onderwerp in en de AI genereert een oefenset voor je."}),e.jsx("form",{onSubmit:te,className:"mt-8",children:e.jsxs("div",{className:"relative",children:[e.jsx("input",{type:"text",placeholder:"Bijv. 'Wavistrong Codes' of 'Veiligheid'",className:"w-full bg-white border-2 border-slate-200 rounded-2xl px-6 py-4 outline-none focus:border-purple-500 transition-colors shadow-sm text-lg",value:C,onChange:s=>J(s.target.value),disabled:T}),e.jsx("button",{type:"submit",disabled:T||!C,className:"absolute right-2 top-2 bottom-2 bg-purple-600 text-white px-6 rounded-xl font-bold uppercase tracking-wider hover:bg-purple-700 transition-all disabled:opacity-50 flex items-center gap-2",children:T?"Genereren...":e.jsxs(e.Fragment,{children:[e.jsx(_,{size:18})," Start"]})})]})})]})})]})]})};export{Ge as default};
