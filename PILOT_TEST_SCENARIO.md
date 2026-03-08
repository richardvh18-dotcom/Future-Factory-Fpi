# 🧪 Pilot Test Scenario: Full Digital Flow

**Doel:** Validatie van de volledige digitale productieflow van BH18 tot BM01 zonder papieren bonnen.  
**Datum:** Maart 2026  
**Status:** Ready for Execution

---

## 📋 Test Voorwaarden

### Omgeving
- **Stations:** BH18 (Wikkelen), Lossen, Nabewerking, BM01 (Eindcontrole)
- **Test Product:** GRE Fitting (bijv. AELB-025-200-EST-BD-12)
- **Operators:** Minimaal 2 operators (1 voor BH18, 1 voor BM01/Nabewerking)
- **Devices:** Tablets/Terminals bij elk station, Scanner beschikbaar

### Pre-requisites
✅ Firebase deployment actief (production)  
✅ Alle operators hebben geldig account met juiste rol  
✅ Test orders aangemaakt in planning (status: `planned`)  
✅ QR-codes geprint of digitaal beschikbaar  
✅ Printer configuratie getest (label printing)  

---

## 🎯 Fase 1: Order Starten op BH18

### Fase 1a: Normale Start (Positieve Test)

**Actor:** Operator op BH18  
**Doel:** Start productie van een order en valideer lotnummer generatie

#### Stappen:
1. **Login** op BH18 terminal met operator credentials
2. **Navigeer** naar Terminal view
3. **Selecteer** testorder uit de lijst (status: `planned`)
4. **Klik** "Start Productie"
5. **Controleer** in de modal:
   - Lotnummer is automatisch gegenereerd (formaat: `JJWW-SSS-####`)
   - Product informatie correct weergegeven
   - Operator nummer voorgevuld
6. **Bevestig** productiestart
7. **Print** label (indien gevraagd)

#### Verwacht Resultaat:
✅ Order status verandert naar `in_progress`  
✅ Item verschijnt in `active_production` collectie met uniek lotnummer  
✅ Historie bevat entry: "Productie gestart op BH18"  
✅ Label wordt geprint met correcte data  
✅ Terminal toont order met status "In Productie"

---

### Fase 1b: Validatie Uniekheid (Negatieve Test)

**Actor:** Operator op BH18  
**Doel:** Testen dat systeem duplicate lotnummers voorkomt

#### Stappen:
1. **Start** een tweede item van **dezelfde order** (terwijl eerste nog actief is)
2. **Controleer** dat systeem:
   - Een nieuw, uniek lotnummer genereert (####-deel moet verschillen)
   - GEEN foutmelding toont over duplicaten

#### Verwacht Resultaat:
✅ Tweede item krijgt ander lotnummer (bijv. 2610-418-0002 i.p.v. 0001)  
✅ Beide items blijven zichtbaar in active_production  
✅ Terminal toont beide items apart in de lijst

---

## 🎯 Fase 2: Afronden Wikkelen & Doorsturen

**Actor:** Operator op BH18  
**Doel:** Wikkelproces afronden en item klaarzetten voor Lossen

#### Stappen:
1. **Selecteer** het actieve item in Terminal
2. **Klik** "Stop" of "Afronden"
3. **Controleer** status wijziging

#### Verwacht Resultaat:
✅ Item status verandert naar `Wacht op Lossen`  
✅ Historie bevat entry: "Wikkelen afgerond op BH18"  
✅ Item verdwijnt NIET uit de lijst (blijft zichtbaar tot lossen begint)  
✅ Planning `produced` teller wordt NIET verhoogd (nog niet volledig klaar)

---

## 🎯 Fase 3: Lossen

**Actor:** Lossen Operator  
**Doel:** Item lossen en gereed maken voor nabewerking

#### Stappen:
1. **Login** op Lossen terminal of gebruik mobiele scanner
2. **Scan** QR-code op het item OF zoek op lotnummer
3. **Controleer** weergegeven data:
   - Product naam, Order nummer, Lotnummer
   - Status: "Wacht op Lossen"
4. **Klik** "Start Lossen"
5. **Voer** eventuele gewicht/maten in (optioneel)
6. **Klik** "Afronden"

#### Verwacht Resultaat:
✅ Status verandert naar `Te Nabewerken` of `Te Keuren`  
✅ Historie bevat entry: "Gelost"  
✅ Item verschijnt in Nabewerking lijst

---

## 🎯 Fase 4: Nabewerking (Optioneel)

**Actor:** Nabewerking Operator  
**Doel:** Bijwerken/afwerken na lossen

#### Stappen:
1. **Selecteer** item uit lijst "Te Nabewerken"
2. **Klik** "Start Nabewerking"
3. **Voer** werkzaamheden uit
4. **Klik** "Afronden"

#### Verwacht Resultaat:
✅ Status verandert naar `Te Keuren`  
✅ Historie bevat entry: "Nabewerking voltooid"  
✅ Item verschijnt in BM01 wachtrij

---

## 🎯 Fase 5: Eindcontrole op BM01

**Actor:** Operator op BM01  
**Doel:** Finale inspectie en archiveren

#### Stappen:
1. **Login** op BM01 terminal
2. **Scan** of selecteer item (status: `Te Keuren`)
3. **Klik** "Start Inspectie"
4. **Voer** meetwaarden in (optioneel):
   - Boordiameter, Wanddikte, etc.
5. **Kies** "Goedkeuren" of "Afkeuren"
6. **Bevestig** afronden

#### Verwacht Resultaat bij Goedkeuren:
✅ Status verandert naar `completed`  
✅ Item wordt verplaatst naar `archived_products` collectie  
✅ Planning `produced` teller wordt verhoogd (+1)  
✅ Historie bevat entry: "Eindcontrole akkoord - Gearchiveerd"  
✅ Order status wordt `completed` als alle items klaar zijn  
✅ PDF dossier kan gegenereerd worden (Teamleader/Admin)

#### Verwacht Resultaat bij Afkeuren:
⚠️ Status verandert naar `Tijdelijke afkeur` of `rejected`  
⚠️ Item blijft zichtbaar in BM01 lijst  
⚠️ Planning teller blijft ongewijzigd  
⚠️ Teamleader krijgt notificatie

---

## 🎯 Fase 6: Validatie Productie Dossier

**Actor:** Teamleider of Admin  
**Doel:** Controleer compleetheid van data en PDF export

#### Stappen:
1. **Login** als Teamleider
2. **Navigeer** naar "Teamleider Hub" > "Trace & Track"
3. **Zoek** lotnummer van het afgeronde item
4. **Open** detail modal
5. **Controleer** Historie compleet is:
   - Start BH18 (met operator & timestamp)
   - Gereed BH18
   - Lossen
   - (Eventueel Nabewerking)
   - Eindcontrole BM01
6. **Klik** "Download Dossier PDF"
7. **Open** PDF en valideer inhoud

#### Verwacht Resultaat:
✅ Historie toont alle stappen chronologisch  
✅ Alle operators en timestamps zijn correct  
✅ PDF bevat:
   - Productgegevens (naam, specs, tekening)
   - Ordergegevens (ordernummer, klant, hoeveelheid)
   - Volledige processflow met tijden
   - Eventuele meetwaarden
✅ PDF is branded (Future Factory logo)

---

## 🎯 Fase 7: Multi-Item Order Test

**Actor:** Operator BH18 + BM01  
**Doel:** Valideer correcte afhandeling van orders met meerdere items

#### Stappen:
1. **Start** 3 items van dezelfde order op BH18 (elk apart lotnummer)
2. **Rond** eerste item helemaal af (t/m BM01)
3. **Controleer** Terminal:
   - Order blijft zichtbaar (nog 2 items open)
   - `produced` teller toont "1 / 3"
4. **Rond** tweede item af
5. **Controleer** teller: "2 / 3"
6. **Rond** derde item af
7. **Controleer** order:
   - Status wordt `completed`
   - Order verdwijnt uit Terminal lijst
   - Teller toont "3 / 3"

#### Verwacht Resultaat:
✅ Order blijft zichtbaar tot laatste item klaar is  
✅ Teller update correct na elk item  
✅ Order verdwijnt pas na volledige afronding  
✅ Alle 3 items zijn traceerbaar in archief

---

## 🎯 Fase 8: Stress Test (Optioneel)

**Actor:** Meerdere operators  
**Doel:** Test stabiliteit onder realistische belasting

#### Scenario:
- **10 orders** tegelijk actief
- **3 operators** werken parallel op verschillende stations
- **2 operators** op BH18, **1 op BM01**
- Mix van producten (verschillende maten/types)

#### Te controleren:
✅ Geen performance degradatie in UI  
✅ Geen lotnummer duplicaten  
✅ Alle items correct getraceerd  
✅ Notificaties komen binnen zonder vertraging  
✅ Database writes slagen allemaal (check Firebase console)

---

## 📊 Success Criteria

De pilot is **geslaagd** als:

1. ✅ **100% Traceerbaarheid:** Elk item heeft complete historie van BH18 tot archief
2. ✅ **0 Data Loss:** Geen items verdwijnen of overschreven worden
3. ✅ **Unieke Lotnummers:** Geen enkele duplicate gedetecteerd
4. ✅ **Correcte Tellers:** Planning `produced` tellers exact gelijk aan gearchiveerde items
5. ✅ **PDF Export:** Alle afgeronde orders kunnen als PDF geëxporteerd worden
6. ✅ **Operator Feedback:** Operators geven aan dat flow intuïtief is (survey)
7. ✅ **Performance:** Laadtijden < 2 seconden, geen UI freezes

---

## 🐛 Known Issues & Workarounds

### Issue 1: Item verdwijnt na start tweede item
**Status:** 🟢 Opgelost (Fase 2 filter fix)  
**Fix:** Filter in LossenView updated om "Wacht op Lossen" status mee te nemen

### Issue 2: Historie mist laatste stap
**Status:** 🟢 Opgelost (Fase 3)  
**Fix:** BM01Hub voegt nu expliciet laatste entry toe vóór archivering

### Issue 3: Teller klopt niet na gedeeltelijke afronding
**Status:** 🟢 Opgelost (Fase 3)  
**Fix:** Terminal gebruikt hybride teller (live + database)

---

## 📝 Testrapport Template

```markdown
## Pilot Test Executie

**Datum:** [DD-MM-YYYY]  
**Uitgevoerd door:** [Naam]  
**Stations:** BH18, Lossen, Nabewerking, BM01  
**Test Orders:** [Ordernummers]

### Resultaten per Fase

#### Fase 1a: Order Starten
- [ ] PASS / FAIL  
- Opmerkingen: 

#### Fase 1b: Uniekheid
- [ ] PASS / FAIL  
- Opmerkingen:

#### Fase 2: Afronden Wikkelen
- [ ] PASS / FAIL  
- Opmerkingen:

#### Fase 3: Lossen
- [ ] PASS / FAIL  
- Opmerkingen:

#### Fase 4: Nabewerking
- [ ] PASS / FAIL  
- Opmerkingen:

#### Fase 5: BM01 Eindcontrole
- [ ] PASS / FAIL  
- Opmerkingen:

#### Fase 6: PDF Export
- [ ] PASS / FAIL  
- Opmerkingen:

#### Fase 7: Multi-Item Order
- [ ] PASS / FAIL  
- Opmerkingen:

### Geconstateerde Bugs
1. [Beschrijving bug + severity]
2. ...

### Operator Feedback
- **Gemak van gebruik (1-5):** 
- **Snelheid (1-5):**
- **Verbetervoorstellen:**

### Conclusie
[ ] Ready for Production  
[ ] Needs Fixes (minor)  
[ ] Needs Fixes (critical)
```

---

## 🚀 Next Steps After Pilot

Bij succesvolle pilot:
1. **Rollout Plan:** Uitbreiden naar andere afdelingen (Pipes, Spools)
2. **Training:** Formele training voor alle operators
3. **Monitoring:** Dashboard opzetten voor real-time KPI tracking
4. **Feedback Loop:** Maandelijkse review meetings inplannen

Bij issues:
1. **Bug Tracking:** Log alle issues in GitHub met prioriteit
2. **Hotfixes:** Critical bugs binnen 48u oplossen
3. **Re-Test:** Herhaal scenario na fixes
4. **Communicatie:** Update stakeholders over planning aanpassing

// Imports voorzien van de .js extensie voor correcte resolutie in de compiler
import { db, auth, logActivity } from "../../../config/firebase.js"; 
import { PATHS } from "../../../config/dbPaths.js";
import { generateLotNumber, getLotPlaceholder } from "../../../utils/lotLogic.js";
import {
  processLabelData,
  resolveLabelContent,
  applyLabelLogic,
} from "../../../utils/labelHelpers.js";
import { generateZPL, downloadZPL } from "../../../utils/zplHelper.js";

const PIXELS_PER_MM = 3.78;

const getQRCodeUrl = (data) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=0&data=${encodeURIComponent(
    data || "leeg"
  )}`;

const getBarcodeUrl = (data) =>
  `https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(
    data || "leeg"
  )}&scale=3&height=10&incltext&guardwhitespace`;

// Functie om weeknummer te berekenen (ISO 8601) voor de FPI standaard
const getWeekNumber = (d) => {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  var weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
  return String(weekNo).padStart(2, '0');
};

// Machine naar FPI code mapping
const getMachineCode = (station) => {
  const map = {
    'BH18': '418',
    'BA07': '417'
  };
  return map[station] || station.replace(/\D/g,'').padStart(3, '0') || '999';
};

const ProductionStartModal = ({
  order,
  isOpen,
  onClose,
  onStart,
  stationId = "",
  existingProducts = [],
}) => {
  const [mode, setMode] = useState("auto");
  const [lotNumber, setLotNumber] = useState("");
  const [stringCount, setStringCount] = useState(1);
  const [manualLotInput, setManualLotInput] = useState("");
  const [manualOrderInput, setManualOrderInput] = useState("");
  const [assignedOperators, setAssignedOperators] = useState([]);
  const [operatorInput, setOperatorInput] = useState("");

  const [availableLabels, setAvailableLabels] = useState([]);
  const [selectedLabelId, setSelectedLabelId] = useState("");
  const [, setLoadingLabels] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(1);
  const location = useLocation();
  
  const [savedPrinters, setSavedPrinters] = useState([]);
  const [printConfig, setPrintConfig] = useState({
    mode: "standard", 
    printerIp: ""
  });

  const [labelRules, setLabelRules] = useState([]);
  const containerRef = useRef(null);

  const [isCheckingLot, setIsCheckingLot] = useState(false);
  const [lotError, setLotError] = useState("");

  // 1. Label Templates & Rules Laden
  useEffect(() => {
    const fetchLabels = async () => {
      if (!isOpen) return;
      setLoadingLabels(true);
      try {
        const tplPaths = PATHS?.LABEL_TEMPLATES || ['future-factory', 'settings', 'label_templates'];
        const labelsRef = collection(db, ...tplPaths);
        const querySnapshot = await getDocs(labelsRef);
        const labels = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setAvailableLabels(labels);

        if (labels.length > 0) {
          let defaultLabel = labels.find(
            (l) => l.name?.toLowerCase().includes("smal") || l.height < 45
          );
          setSelectedLabelId(defaultLabel?.id || labels[0].id);
        }
      } catch (e) {
        console.error("Fout bij laden labels:", e);
      } finally {
        setLoadingLabels(false);
      }
    };
    fetchLabels();

    try {
       const lblPaths = PATHS?.LABEL_LOGIC || ['future-factory', 'settings', 'label_logic'];
       const rulesRef = collection(db, ...lblPaths);
       getDocs(rulesRef).then(snap => {
         setLabelRules(snap.docs.map(d => d.data()));
       }).catch(err => console.error("Error loading label rules", err));
    } catch(e) {}
  }, [isOpen]);

  // 1b. Operators ophalen voor dit station
  useEffect(() => {
    const fetchOccupancy = async () => {
      if (!isOpen || !stationId) return;
      const today = new Date().toISOString().split('T')[0];
      try {
        const occPaths = PATHS?.OCCUPANCY || ['future-factory', 'personnel', 'occupancy'];
        const q = query(
          collection(db, ...occPaths),
          where("machineId", "==", stationId),
          where("date", "==", today)
        );
        const snapshot = await getDocs(q);
        const operators = snapshot.docs.map(doc => ({
          number: doc.data().operatorNumber,
          name: doc.data().operatorName
        }));
        setAssignedOperators(operators);
        if (operators.length === 1) {
          setOperatorInput(operators[0].number);
        } else {
          setOperatorInput("");
        }
      } catch (err) {
        console.error("Kon operators niet ophalen", err);
      }
    };
    fetchOccupancy();
  }, [isOpen, stationId]);

  // 1c. Printers ophalen
  useEffect(() => {
    if(!isOpen) return;
    try {
        const prnPaths = PATHS?.PRINTERS || ['future-factory', 'settings', 'printers'];
        const printersRef = collection(db, ...prnPaths);
        const unsub = onSnapshot(printersRef, (snap) => {
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          setSavedPrinters(list);
          const stationPrinter = list.find(p => p.linkedStations && p.linkedStations.includes(stationId));
          const globalDefault = list.find(p => p.isDefault);
          const targetPrinter = stationPrinter || globalDefault;

          if (targetPrinter) {
            if (targetPrinter.type === 'network') {
                setPrintConfig(prev => ({ ...prev, mode: 'network', printerIp: targetPrinter.ip }));
            } else {
                setPrintConfig(prev => ({ ...prev, mode: 'standard' }));
            }
          }
        });
        return () => unsub();
    } catch(e) {
        console.error("Kon printers niet laden", e);
    }
  }, [stationId, isOpen]);

  // --- SLIMME LOTNUMMER GENERATOR (FPI STANDAARD) ---

  const checkLotNumberExists = async (lotToCheck) => {
    if (!lotToCheck) return false;
    try {
      const actPaths = PATHS?.ACTIVE_PRODUCTION || ['future-factory', 'production', 'active'];
      const activeRef = collection(db, ...actPaths);
      
      // Check 1: lotNumber veld
      const qActive = query(activeRef, where("lotNumber", "==", lotToCheck));
      const snapshotActive = await getDocs(qActive);
      if (!snapshotActive.empty) return true;

      // Check 2: activeLot veld (fallback)
      const qActive2 = query(activeRef, where("activeLot", "==", lotToCheck));
      const snapshotActive2 = await getDocs(qActive2);
      if (!snapshotActive2.empty) return true;

      const archPaths = PATHS?.PRODUCTION_ARCHIVE || ['future-factory', 'production', 'archive'];
      const archiveRef = collection(db, ...archPaths);
      const qArchive = query(archiveRef, where("lotNumber", "==", lotToCheck));
      const snapshotArchive = await getDocs(qArchive);
      return !snapshotArchive.empty;
    } catch (error) {
      console.error("Fout bij lot validatie:", error);
      return false;
    }
  };

  // Stap A: Zoek de allerhoogste teller voor deze week/machine, onafhankelijk van het product
  const getHighestSequenceForBaseLot = async (baseLotStr) => {
    let maxSeq = 0;
    
    const extractSeq = (lot) => {
        if (!lot || !lot.startsWith(baseLotStr)) return 0;
        const seqStr = lot.substring(baseLotStr.length).replace(/[^0-9]/g, '');
        const seq = parseInt(seqStr, 10);
        return isNaN(seq) ? 0 : seq;
    };

    // 1. Check actieve producten in de lijst
    existingProducts?.forEach(p => {
        const seq = extractSeq(p.lotNumber || p.activeLot);
        if (seq > maxSeq) maxSeq = seq;
    });

    // 2. Check Database (inclusief archief)
    try {
        // 2a. Active Production - Haal ALLES op (kleine collectie, voorkomt index/query issues)
        const activePath = PATHS?.ACTIVE_PRODUCTION || ['future-factory', 'production', 'active'];
        const activeRef = collection(db, ...activePath);
        const activeSnap = await getDocs(activeRef);
        activeSnap.forEach(doc => {
            const data = doc.data();
            const seq = extractSeq(data.lotNumber || data.activeLot);
            if (seq > maxSeq) maxSeq = seq;
        });

        // 2b. Archive - Gebruik query (grote collectie)
        const archivePath = PATHS?.PRODUCTION_ARCHIVE || ['future-factory', 'production', 'archive'];
        const archiveRef = collection(db, ...archivePath);
        const q = query(
            archiveRef, 
            where("lotNumber", ">=", baseLotStr),
            where("lotNumber", "<=", baseLotStr + '\uf8ff')
        );
        const archiveSnap = await getDocs(q);
        archiveSnap.forEach(doc => {
            const seq = extractSeq(doc.data().lotNumber);
            if (seq > maxSeq) maxSeq = seq;
        });

    } catch (error) {
        console.error("Fout bij ophalen max sequence:", error);
    }

    return maxSeq;
  };

  // Stap B: Genereer de robuuste FPI code
  useEffect(() => {
    let isMounted = true;

    const generateRobustLotNumber = async () => {
      if (!isOpen || !order || mode !== "auto") return;
      setIsCheckingLot(true);

      try {
        // Behoud het lotnummer als deze order al gedeeltelijk geproduceerd was en een geldig nummer heeft
        if (order.lotNumber && order.lotNumber.length > 5) {
            if (isMounted) setLotNumber(order.lotNumber);
            return;
        }
        
        const d = new Date();
        
        // FPI Standaard Opbouw:
        const bedrijf = "40"; // FPI
        const jaar = String(d.getFullYear()).slice(-2); // 26
        const week = getWeekNumber(d); // 09
        const machine = getMachineCode(stationId); // 418 (voor BH18)
        const land = "40"; // NL

        // Basis = "40260941840"
        const baseLot = `${bedrijf}${jaar}${week}${machine}${land}`;

        // Haal het hoogste getal op dat al gebruikt is voor deze basis (bijv. 1)
        const highestSeq = await getHighestSequenceForBaseLot(baseLot);
        
        // De nieuwe teller wordt het hoogste getal + 1 (dus als er niets is = 1)
        let counter = highestSeq + 1;
        
        // Voeg 5 nullen toe als padding (00001, 00002, etc.)
        let newLotNumber = `${baseLot}${String(counter).padStart(5, '0')}`;

        // Noodzekerheid check om echt te garanderen dat deze teller niet in de database zit
        while (await checkLotNumberExists(newLotNumber)) {
            counter++;
            newLotNumber = `${baseLot}${String(counter).padStart(5, '0')}`;
            if (counter > 99999) break; 
        }

        if (isMounted) {
            setLotNumber(newLotNumber);
            setLotError("");
        }
      } catch (error) {
        console.error("Error setting lot number", error);
        if (isMounted) setLotError("Waarschuwing: Kan uniciteit niet garanderen.");
      } finally {
        if (isMounted) setIsCheckingLot(false);
      }
    };

    generateRobustLotNumber();

    if (isOpen && mode === "manual") {
      setManualLotInput("");
      setManualOrderInput("");
      setLotError("");
    }

    return () => { isMounted = false; };
  }, [isOpen, order, mode, stationId]);

  // 3. Data voor preview
  const previewData = useMemo(() => {
    if (!order) return {};
    const baseData = processLabelData({
      ...order,
      orderNumber: mode === "manual" ? manualOrderInput || order.orderId : order.orderId,
      productId: order.itemCode,
      description: order.item,
      lotNumber: mode === "manual" ? manualLotInput : (lotNumber || "LADEN..."),
    });
    
    return applyLabelLogic(baseData, labelRules);
  }, [order, lotNumber, labelRules, mode, manualOrderInput, manualLotInput]);

  const selectedLabel = useMemo(
    () => availableLabels.find((l) => l.id === selectedLabelId),
    [availableLabels, selectedLabelId]
  );

  // 4. Zoom berekening voor preview venster
  useEffect(() => {
    if (containerRef.current && selectedLabel) {
      const containerW = containerRef.current.clientWidth - 60;
      const containerH = containerRef.current.clientHeight - 180;
      const labelW = selectedLabel.width * PIXELS_PER_MM;
      const labelH = selectedLabel.height * PIXELS_PER_MM;
      setPreviewZoom(Math.min(1.4, containerW / labelW, containerH / labelH));
    }
  }, [selectedLabel, isOpen]);

  // 5. Browser Print Functie
  const handlePrint = async () => {
    if (!selectedLabel) return;
    
    const quantityStr = prompt("Hoeveel labels wilt u printen?", "1");
    const quantity = parseInt(quantityStr);
    if (!quantity || isNaN(quantity) || quantity < 1) return;
    
    if (printConfig.mode === "network") {
      if (!printConfig.printerIp) {
        alert("Selecteer eerst een netwerkprinter.");
        return;
      }
      
      const selectedPrinter = savedPrinters.find(p => p.ip === printConfig.printerIp);
      const darkness = selectedPrinter?.darkness ? parseInt(selectedPrinter.darkness) : 15;
      const dpi = selectedPrinter?.dpi ? parseInt(selectedPrinter.dpi) : 203;
      
      let zpl = await generateZPL(selectedLabel, previewData, dpi);
      if (!zpl.includes("~SD")) zpl = `~SD${darkness}\n${zpl}`;

      try {
        for (let i = 0; i < quantity; i++) {
           await fetch(`http://${printConfig.printerIp}/pstprnt`, { method: "POST", body: zpl, mode: "no-cors" });
        }
        alert(`Opdracht verzonden naar ${selectedPrinter?.name || printConfig.printerIp}`);
      } catch (e) {
        alert("Fout bij printen naar netwerkprinter: " + e.message);
      }
      return;
    }

    const printWindow = window.open("", "_blank", "width=800,height=600");
    const labelW = selectedLabel.width;
    const labelH = selectedLabel.height;

    const htmlContent = `
      <html>
        <head>
          <style>
            @page { size: ${labelW}mm ${labelH}mm; margin: 0; }
            body { margin: 0; padding: 0; width: ${labelW}mm; height: ${labelH}mm; overflow: hidden; font-family: sans-serif; background: white; }
            .canvas { position: relative; width: 100%; height: 100%; }
            .el { position: absolute; color: black; line-height: 1; transform-origin: top left; }
            img { display: block; width: 100%; height: 100%; object-fit: contain; }
          </style>
          <script>
            window.onload = function() {
              for (let i = 0; i < ${quantity}; i++) {
                window.print();
              }
              window.close();
            };
          </script>
        </head>
        <body>
          <div class="canvas">
            ${selectedLabel.elements
              ?.map((el) => {
                const res = resolveLabelContent(el, previewData);
                const style = `left:${el.x}mm; top:${el.y}mm; width:${
                  el.width || "auto"
                }mm; height:${el.height || "auto"}mm; font-size:${
                  el.fontSize
                }px; font-weight:${
                  el.isBold ? "900" : "normal"
                }; transform: rotate(${el.rotation || 0}deg); font-family: sans-serif; white-space: nowrap;`;
                if (el.type === "text")
                  return `<div class="el" style="${style}">${res.content}</div>`;
                if (el.type === "qr")
                  return `<div class="el" style="${style}"><img src="${getQRCodeUrl(
                    res.content
                  )}"></div>`;
                if (el.type === "barcode")
                  return `<div class="el" style="${style}"><img src="${getBarcodeUrl(
                    res.content
                  )}"></div>`;
                return "";
              })
              .join("")}
          </div>
        </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const handleZPLDownload = async () => {
    if (!selectedLabel) return;
    const zpl = await generateZPL(selectedLabel, previewData);
    downloadZPL(zpl, `label_${order.orderId}_${lotNumber}.zpl`);
  };

  const handleManualLotChange = async (e) => {
    const value = e.target.value.toUpperCase();
    setManualLotInput(value);
    setLotNumber(value);
    setLotError("");

    if (value.trim().length >= 4) {
      setIsCheckingLot(true);
      let exists = existingProducts?.some(p => p.lotNumber === value.trim() || p.activeLot === value.trim());
      if (exists) {
        setLotError("Dit lotnummer is op dit moment al in productie!");
      }
      setIsCheckingLot(false);
    }
  };

  const selectedOperatorName = assignedOperators.find(op => op.number === operatorInput)?.name;

  if (!isOpen || !order || location.pathname.includes("/login")) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/90 z-[100] flex items-center justify-center p-2 md:p-4 backdrop-blur-md animate-in fade-in">
      <div className="bg-white w-full max-w-6xl h-full md:h-[85vh] rounded-[40px] shadow-2xl flex flex-col md:flex-row overflow-hidden border border-white/10">
        {/* LINKS: CONFIGURATIE */}
        <div className="w-full md:w-1/3 p-4 border-r border-slate-100 flex flex-col bg-slate-50/50 overflow-y-auto custom-scrollbar">
          <div className="flex justify-between items-start mb-4">
            <div className="text-left">
              <h2 className="text-xl font-black text-slate-900 uppercase italic tracking-tighter">
                Order Start
              </h2>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5 text-left italic">
                {stationId}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-200 rounded-full text-slate-400 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="space-y-4 flex-1 text-left">
            {/* Dossier info kaart */}
            <div className="bg-white p-4 rounded-2xl border-2 border-slate-100 shadow-sm text-left">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="p-1.5 bg-slate-900 text-white rounded-lg">
                  <FileText size={14} />
                </div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  Werkorder
                </span>
              </div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight leading-none italic">
                {order.orderId}
              </h3>
              <p className="text-[10px] font-bold text-slate-500 mt-1.5 truncate uppercase">
                {order.item}
              </p>
              {order.drawing && (
                <div className="mt-2">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tekening</span>
                  <p className="text-xs font-bold text-slate-700">{order.drawing}</p>
                </div>
              )}
              {order.notes && (
                <div className="mt-2 pt-2 border-t border-slate-100">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">PO Text / Opmerkingen</span>
                  <p className="text-xs font-medium text-slate-600 italic">{order.notes}</p>
                </div>
              )}
            </div>

            {/* Operator Selection */}
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                Operator (Nr)
              </label>
              {assignedOperators.length > 1 ? (
                <div className="relative">
                  <select
                    value={operatorInput}
                    onChange={(e) => setOperatorInput(e.target.value)}
                    className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-600 shadow-sm appearance-none cursor-pointer"
                  >
                    <option value="">Kies operator...</option>
                    {assignedOperators.map((op) => (
                      <option key={op.number} value={op.number}>
                        {op.number} - {op.name}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                    ▼
                  </div>
                </div>
              ) : (
                <input
                  type="text"
                  value={operatorInput}
                  onChange={(e) => setOperatorInput(e.target.value)}
                  className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-blue-600 shadow-sm"
                  placeholder="Personeelsnummer"
                />
              )}
            </div>

            {/* Mode switcher */}
            <div className="flex bg-slate-200 p-1 rounded-xl">
              <button
                onClick={() => setMode("auto")}
                className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all ${
                  mode === "auto"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                <RefreshCw size={12} /> Auto
              </button>
              <button
                onClick={() => setMode("manual")}
                className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all ${
                  mode === "manual"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                <Keyboard size={12} /> Manueel
              </button>
            </div>

            {/* Lot invoer sectie */}
            {mode === "auto" ? (
              <div className="space-y-3 animate-in slide-in-from-top-2 text-left">
                <div className="bg-slate-900 p-4 rounded-2xl text-center shadow-xl border border-white/5 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-3 opacity-5">
                    <QrCode size={48} />
                  </div>
                  <span className="text-[8px] font-black text-blue-400 uppercase tracking-[0.3em] block mb-1.5">
                    Huidig Lotnummer
                  </span>
                  <div className="flex justify-center items-center gap-2">
                    <div className={`text-2xl font-mono font-black ${lotError ? 'text-red-400' : 'text-white'} italic tracking-tighter`}>
                      {lotNumber || "LADEN..."}
                    </div>
                    {isCheckingLot && <Loader2 className="animate-spin text-white/50" size={16} />}
                  </div>
                  {lotError && <p className="text-red-400 text-xs mt-2 font-bold">{lotError}</p>}
                </div>
                <div className="space-y-1 text-left">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2 block">
                    Totaal Aantal
                  </label>
                  <div className="flex items-center gap-3 bg-white p-3 rounded-xl border-2 border-slate-100 focus-within:border-blue-500 transition-all shadow-sm">
                    <Layers size={18} className="text-blue-500" />
                    <input
                      type="number"
                      min="1"
                      value={stringCount}
                      onChange={(e) =>
                        setStringCount(parseInt(e.target.value) || 1)
                      }
                      className="w-full font-black text-slate-800 outline-none text-lg"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3 animate-in slide-in-from-top-2 text-left">
                <div className="space-y-1 text-left">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2 block">
                    Ordernummer (scannen of invullen)
                  </label>
                  <input
                    type="text"
                    value={manualOrderInput}
                    onChange={(e) => setManualOrderInput(e.target.value.toUpperCase())}
                    placeholder={"N2000000"}
                    className="w-full p-3 bg-white border-2 border-slate-100 rounded-2xl font-mono text-lg font-black uppercase outline-none focus:border-blue-600 shadow-sm text-center"
                    required
                  />
                </div>
                <div className="space-y-1 text-left">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-2 block">
                    Lotnummer (scannen of invullen)
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={manualLotInput}
                      onChange={handleManualLotChange}
                      placeholder="Handmatig Lot"
                      className={`w-full p-3 bg-white border-2 rounded-2xl font-mono text-xl font-black uppercase outline-none shadow-sm text-center placeholder:text-slate-300 ${
                        lotError 
                          ? "border-red-500 focus:border-red-600 text-red-600" 
                          : "border-slate-100 focus:border-blue-600 text-slate-800"
                      }`}
                      required
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {isCheckingLot ? (
                        <Loader2 className="animate-spin text-blue-500" size={20} />
                      ) : lotError ? (
                        <AlertTriangle className="text-red-500" size={20} />
                      ) : manualLotInput.length >= 4 ? (
                        <CheckCircle2 className="text-emerald-500" size={20} />
                      ) : null}
                    </div>
                  </div>
                  {lotError && (
                    <p className="text-xs font-bold text-red-500 mt-1 pl-2">{lotError}</p>
                  )}
                </div>
              </div>
            )}

            {/* Label selectie */}
            <div className="pt-3 border-t border-slate-200 text-left">
              <label className="text-[9px] font-black text-slate-400 uppercase block mb-1.5 ml-2">
                Label Formaat
              </label>
              <div className="relative group">
                <select
                  value={selectedLabelId}
                  onChange={(e) => setSelectedLabelId(e.target.value)}
                  className="w-full p-3 bg-white border-2 border-slate-100 rounded-xl text-xs font-black text-slate-700 outline-none focus:border-blue-600 shadow-sm appearance-none cursor-pointer group-hover:border-slate-300"
                >
                  {availableLabels.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.width}x{l.height}mm)
                    </option>
                  ))}
                </select>
                <Printer
                  size={14}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                />
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-200 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-5 bg-white border-2 border-slate-100 text-slate-400 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-100 transition-all"
            >
              Annuleer
            </button>
            <button
              onClick={async () => {
                try {
                  await logActivity(auth.currentUser?.uid, "ORDER_RELEASE", `Order started: ${order.orderId}, Lot: ${mode === "auto" ? lotNumber : manualLotInput}`);
                  onStart(
                    order,
                    mode === "auto" ? lotNumber : manualLotInput,
                    stringCount,
                    manualOrderInput,
                    operatorInput,
                    selectedOperatorName 
                  );
                } catch(e) {
                   console.error(e)
                }
              }}
              disabled={
                (mode === "manual" && (!manualOrderInput || !manualLotInput || !!lotError)) ||
                (mode === "auto" && (!lotNumber || isCheckingLot || !!lotError))
              }
              className="flex-[2] py-5 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-[0.15em] shadow-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
            >
              {isCheckingLot ? <Loader2 className="animate-spin" size={20} /> : <PlayCircle size={20} />} 
              {selectedOperatorName ? `Start (${operatorInput})` : "Order Starten"}
            </button>
          </div>
        </div>

        {/* RECHTS: DESIGN PREVIEW & PRINT ACTIE */}
        <div
          ref={containerRef}
          className="flex-1 bg-slate-900 p-6 flex flex-col items-center justify-between relative overflow-hidden text-left"
        >
          <div className="absolute top-4 left-4 text-[9px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2 text-left">
            <Activity size={12} className="text-emerald-500" /> Etiket Preview
          </div>

          <div className="flex-1 flex items-center justify-center w-full min-h-0 py-8">
            {mode === "manual" && (!manualLotInput || !manualOrderInput) ? (
              <div className="text-slate-700 p-20 border-2 border-dashed border-slate-800 rounded-[50px] text-xs uppercase font-black tracking-widest italic">
                Vul order en lot in...
              </div>
            ) : (
              selectedLabel ? (
                <div
                  className="bg-white shadow-[0_0_100px_rgba(0,0,0,0.8)] relative transition-all duration-500 origin-center overflow-hidden border-2 border-white/10"
                  style={{
                    width: `${
                      selectedLabel.width * PIXELS_PER_MM * previewZoom
                    }px`,
                    height: `${
                      selectedLabel.height * PIXELS_PER_MM * previewZoom
                    }px`,
                  }}
                >
                  {selectedLabel.elements?.map((el, index) => {
                    const resolved = resolveLabelContent(el, previewData);
                    const displayContent = resolved.content;
                    const baseStyle = {
                      position: "absolute",
                      left: `${el.x * PIXELS_PER_MM * previewZoom}px`,
                      top: `${el.y * PIXELS_PER_MM * previewZoom}px`,
                      width: el.width
                        ? `${el.width * PIXELS_PER_MM * previewZoom}px`
                        : "auto",
                      height: el.height
                        ? `${el.height * PIXELS_PER_MM * previewZoom}px`
                        : "auto",
                      color: "black",
                      transform: `rotate(${el.rotation || 0}deg)`,
                      transformOrigin: "top left",
                      overflow: "hidden",
                      textAlign: "left",
                    };

                    if (el.type === "text")
                      return (
                        <div
                          key={index}
                          style={{
                            ...baseStyle,
                            fontSize: `${el.fontSize * previewZoom}px`,
                            fontWeight: el.isBold ? "900" : "normal",
                            fontFamily: el.fontFamily || "Arial, sans-serif",
                            width: `${el.width * PIXELS_PER_MM * previewZoom}px`,
                            height: el.height
                              ? `${el.height * PIXELS_PER_MM * previewZoom}px`
                              : "auto",
                            textAlign: el.align || "left",
                            overflow: "hidden",
                            whiteSpace: "nowrap",
                            lineHeight: "1",
                          }}
                        >
                          {displayContent}
                        </div>
                      );

                    if (el.type === "line")
                      return (
                        <div
                          key={index}
                          style={{
                            ...baseStyle,
                            width: `${el.width * PIXELS_PER_MM * previewZoom}px`,
                            height: `${el.height * PIXELS_PER_MM * previewZoom}px`,
                            backgroundColor: "black",
                          }}
                        />
                      );

                    if (el.type === "box")
                      return (
                        <div
                          key={index}
                          style={{
                            ...baseStyle,
                            width: `${el.width * PIXELS_PER_MM * previewZoom}px`,
                            height: `${el.height * PIXELS_PER_MM * previewZoom}px`,
                            border: `${(el.thickness || 1) * PIXELS_PER_MM * previewZoom}px solid black`,
                            boxSizing: "border-box",
                          }}
                        />
                      );

                    if (el.type === "barcode" || el.type === "qr")
                      return (
                        <div
                          key={index}
                          style={{
                            ...baseStyle,
                            width: `${(el.width || 30) * PIXELS_PER_MM * previewZoom}px`,
                            height: `${(el.height || 30) * PIXELS_PER_MM * previewZoom}px`,
                            background: "#f8fafc",
                            border: "1px solid #cbd5e1",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {el.type === "barcode" ? (
                            <img
                              src={getBarcodeUrl(displayContent)}
                              alt="BC"
                              style={{ width: "80%", height: "80%", objectFit: "fill" }}
                            />
                          ) : (
                            <img
                              src={getQRCodeUrl(displayContent)}
                              alt="QR"
                              style={{ width: "80%", height: "80%", objectFit: "contain" }}
                            />
                          )}
                        </div>
                      );

                    return null;
                  })}
                </div>
              ) : (
                <div className="text-slate-700 p-20 border-2 border-dashed border-slate-800 rounded-[50px] animate-pulse text-xs uppercase font-black tracking-widest italic">
                  Ontwerp laden...
                </div>
              )
            )}
          </div>

          {/* --- PRINT AREA (ALLEEN PRINT KNOP) --- */}
          <div className="w-full max-w-sm bg-white/5 border border-white/10 p-4 rounded-2xl backdrop-blur-md mb-2 flex flex-col gap-3 animate-in slide-in-from-bottom-6 duration-700 text-left">
            <div className="flex justify-between items-center px-1">
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Printer</span>
              <div className="flex bg-slate-800/50 p-0.5 rounded-lg border border-white/10">
                <button 
                  onClick={() => setPrintConfig({...printConfig, mode: 'standard'})}
                  className={`px-2 py-1 rounded-md text-[8px] font-black uppercase transition-all ${printConfig.mode === 'standard' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  PDF
                </button>
                <button 
                  onClick={() => setPrintConfig({...printConfig, mode: 'network'})}
                  className={`px-2 py-1 rounded-md text-[8px] font-black uppercase transition-all flex items-center gap-1 ${printConfig.mode === 'network' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  <Wifi size={8} /> IP
                </button>
              </div>
            </div>

            {printConfig.mode === 'network' && (
              <select 
                value={printConfig.printerIp}
                onChange={(e) => setPrintConfig({...printConfig, printerIp: e.target.value})}
                className="w-full p-2 bg-slate-900 border border-white/10 rounded-lg text-[10px] font-bold text-slate-300 outline-none focus:border-blue-500"
              >
                <option value="">-- Kies Printer --</option>
                {savedPrinters.map(p => (
                  <option key={p.id} value={p.ip}>{p.name} ({p.ip})</option>
                ))}
              </select>
            )}

            <div className="flex gap-2">
                <button
                onClick={handlePrint}
                disabled={!selectedLabel}
                className="flex-1 py-4 bg-blue-600 text-white rounded-xl font-black uppercase text-sm tracking-[0.2em] shadow-2xl shadow-blue-900/40 hover:bg-blue-500 active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-30"
                >
                <Printer size={22} />
                Print
                </button>

                <button
                onClick={handleZPLDownload}
                disabled={!selectedLabel}
                className="px-4 py-4 bg-slate-800 text-white rounded-xl font-black uppercase text-xs tracking-widest hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-30"
                title="Download ZPL (Zebra)"
                >
                <Code size={18} />
                ZPL
                </button>
            </div>
            <p className="text-[8px] text-slate-500 text-center font-bold uppercase tracking-tighter opacity-50">
              Selecteer aantal bij print prompt
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductionStartModal;