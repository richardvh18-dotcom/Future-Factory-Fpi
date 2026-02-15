<!-- VERWIJDEREN: Data migratie niet meer nodig. Bestand kan worden verwijderd. -->

## Overzicht

Alle hardcoded automation logica is gemigreerd naar een centralized, data-driven **Automation Rules Engine**. Dit maakt het mogelijk om automation regels te beheren via de UI zonder code wijzigingen.

## 📦 Gemigreerde Modules

### 1. NotificationRulesView.jsx
**Status:** ✅ Logica gemigreerd, component kan blijven bestaan voor UI compatibiliteit

**Gemigreerde Functionaliteit:**
- `checkRule()` function met 5 trigger types
- Capacity shortage detection
- Low efficiency monitoring  
- Order delay tracking
- Missing operator detection
- Dependency blocked detection

**Nieuwe Locatie:** `AutomationRulesView.jsx` + `automationEngine.js`

**Migratie Details:**
```javascript
// OUD (hardcoded in NotificationRulesView.jsx)
const checkRule = async (rule) => {
  switch (rule.trigger) {
    case "capacity_shortage":
      const totalCapacity = occupancy.reduce(...);
      if (totalDemand > totalCapacity * threshold) {
        shouldTrigger = true;
      }
      break;
    // ... meer hardcoded cases
  }
}

// NIEUW (data-driven in automationEngine.js)
export const evaluateCapacityShortage = async (conditions) => {
  const { threshold = 0 } = conditions;
  const occupancySnap = await getDocs(collection(db, ...PATHS.OCCUPANCY));
  const planningSnap = await getDocs(collection(db, ...PATHS.PLANNING));
  // Dynamic evaluation based on conditions
  return {
    triggered: shortage > threshold,
    message: `⚠️ Capaciteitstekort: ${shortage}h tekort`,
    severity: "warning",
    data: { totalCapacity, totalDemand, shortage }
  };
};
```

### 2. WorkstationHub.jsx
**Status:** ✅ Reminder logica gemigreerd, component blijft voor andere functionaliteit

**Gemigreerde Functionaliteit:**
- Automatic inspection reminders
- 7-day overdue detection
- Product tracking for temporary rejects

**Nieuwe Locatie:** `automationEngine.js` → `evaluateInspectionOverdue()` + `executeInspectionReminder()`

**Migratie Details:**
```javascript
// OUD (hardcoded in WorkstationHub.jsx useEffect)
useEffect(() => {
  const checkAndSendReminders = async () => {
    const overdueItems = rawProducts.filter((p) => {
      const isTempReject = p.inspection?.status === "Tijdelijke afkeur";
      const isOverdue = isInspectionOverdue(p.inspection?.timestamp);
      return isOverdue && !alreadySent;
    });
    
    for (const item of overdueItems) {
      await addDoc(collection(db, ...PATHS.MESSAGES), {
        title: "⏰ Automatische Reminder: Tijdelijke Afkeur",
        // ... hardcoded message
      });
    }
  };
  const timer = setTimeout(checkAndSendReminders, 2000);
}, [rawProducts]);

// NIEUW (configureerbaar via Automation Rules)
// Rule in Firestore:
{
  name: "⏰ Inspectie Reminder (7+ dagen)",
  trigger: {
    type: "inspection_overdue",
    conditions: { daysOverdue: 7, station: "NABEWERKING" }
  },
  action: {
    type: "inspection_reminder",
    params: {}
  },
  debounceMinutes: 1440
}
```

### 3. autoLearningService.js
**Status:** ✅ Logica gemigreerd, service kan blijven als legacy wrapper

**Gemigreerde Functionaliteit:**
- Production time standard deviation analysis
- Automatic standard updates with learning rate
- Sample size validation
- Dry-run mode

**Nieuwe Locatie:** `automationEngine.js` → `evaluateStandardDeviation()` + `executeAutoLearningUpdate()`

**Migratie Details:**
```javascript
// OUD (hardcoded service functie)
export const analyzeAndUpdateStandards = async (options = {}) => {
  const { minSamples = 5, maxDeviation = 50, learningRate = 0.3 } = options;
  
  for (const standard of standards) {
    // Hardcoded analysis logic
    const actualTimes = validProducts.map(p => calculateDuration(...));
    const median = sorted[Math.floor(sorted.length / 2)];
    const deviation = ((median - currentStandard) / currentStandard) * 100;
    
    if (Math.abs(deviation) >= minDeviation) {
      // Hardcoded update logic
      await setDoc(doc(db, ...PATHS.PRODUCTION_STANDARDS, standard.id), {
        standardMinutes: roundedNew,
        // ...
      });
    }
  }
};

// NIEUW (configureerbaar via Automation Rules)
// Rule in Firestore:
{
  name: "🤖 AI Auto-Learning Standaarden",
  trigger: {
    type: "standard_deviation",
    conditions: { minSamples: 5, minDeviation: 10 }
  },
  action: {
    type: "auto_learning_update",
    params: { learningRate: 0.3, dryRun: false }
  },
  debounceMinutes: 10080 // 1 week
}
```

## 🎯 Nieuwe Automation Rules Engine

### Architectuur

```
┌─────────────────────────────────────────┐
│     AutomationRulesView.jsx (UI)       │
│  - Rule configuration interface         │
│  - Manual testing                       │
│  - Execution history                    │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│    automationEngine.js (Core Logic)     │
│                                          │
│  ┌────────────────────────────────┐    │
│  │  TRIGGER EVALUATORS            │    │
│  │  - evaluateCapacityShortage()  │    │
│  │  - evaluateLowEfficiency()     │    │
│  │  - evaluateOrderDelay()        │    │
│  │  - evaluateMissingOperator()   │    │
│  │  - evaluateDependencyBlocked() │    │
│  │  - evaluateInspectionOverdue() │    │
│  │  - evaluateStandardDeviation() │    │
│  │  - evaluateOrderStatusChange() │    │
│  └────────────────────────────────┘    │
│                                          │
│  ┌────────────────────────────────┐    │
│  │  ACTION EXECUTORS              │    │
│  │  - executeSendNotification()   │    │
│  │  - executeCreateLog()          │    │
│  │  - executeInspectionReminder() │    │
│  │  - executeAutoLearningUpdate() │    │
│  │  - executeUpdateStatus()       │    │
│  └────────────────────────────────┘    │
│                                          │
│  ┌────────────────────────────────┐    │
│  │  ORCHESTRATION                 │    │
│  │  - evaluateRule()              │    │
│  │  - checkDebounce()             │    │
│  │  - executeRuleWithLogging()    │    │
│  └────────────────────────────────┘    │
└─────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│         Firestore Collections           │
│  - automationRules                      │
│  - automationExecutions                 │
│  - notifications                        │
└─────────────────────────────────────────┘
```

### Trigger Types

| Trigger Type | Beschrijving | Conditions |
|-------------|--------------|------------|
| `capacity_shortage` | Detecteert capaciteitstekorten | `threshold` (uren) |
| `low_efficiency` | Monitort lage efficiency | `threshold` (percentage) |
| `order_delay` | Detecteert vertraagde orders | `minDelayedOrders` (aantal) |
| `missing_operator` | Vindt machines zonder operator | `threshold` (aantal machines) |
| `dependency_blocked` | Detecteert geblokkeerde orders | `threshold` (aantal orders) |
| `inspection_overdue` | Vindt overdue inspecties | `daysOverdue`, `station` (optioneel) |
| `standard_deviation` | Analyseert standaard afwijkingen | `minSamples`, `minDeviation` (%) |
| `order_status_change` | Monitort status wijzigingen | `targetStatus`, `orderId` (optioneel) |

### Action Types

| Action Type | Beschrijving | Parameters |
|------------|--------------|------------|
| `send_notification` | Stuurt notificatie | `message`, `severity`, `recipients` |
| `create_log` | Maakt log entry | `logMessage` |
| `inspection_reminder` | Stuurt inspectie reminder | - (gebruikt trigger data) |
| `auto_learning_update` | Update productie standaarden | `learningRate`, `dryRun` |
| `update_status` | Update order status | `targetCollection`, `targetStatus` |
| `assign_operator` | Wijst operator toe | (nog te implementeren) |
| `reschedule_order` | Herplant order | (nog te implementeren) |

## 📋 Gebruik

### 1. Via UI - Handmatig Rule Toevoegen

1. Open **Admin Dashboard**
2. Ga naar **Automation & Notificaties** → **Automation Rules**
3. Klik op **"Nieuwe Regel"**
4. Configureer:
   - Regel naam
   - WHEN (trigger type + conditions)
   - THEN (action type + parameters)
   - Debounce tijd (minuten)
5. Klik **"Regel Opslaan"**

### 2. Via UI - Default Rules Importeren

1. Open **Automation Rules**
2. Klik op **"Importeer Defaults"**
3. Bevestig import
4. 8 vooraf geconfigureerde rules worden toegevoegd

### 3. Via Code - Programmatisch Rule Toevoegen

```javascript
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "./config/firebase";

await addDoc(collection(db, "automationRules"), {
  name: "Custom Rule",
  trigger: {
    type: "capacity_shortage",
    conditions: { threshold: 50 }
  },
  action: {
    type: "send_notification",
    params: { severity: "critical" }
  },
  enabled: true,
  debounceMinutes: 120,
  createdAt: serverTimestamp(),
  executionCount: 0,
  lastExecuted: null
});
```

### 4. Rule Testen

1. Klik op de **Play** knop naast een rule
2. Rule wordt direct uitgevoerd met actuele data
3. Resultaat wordt getoond in alert
4. Execution wordt gelogd in **Execution History**

## 🔧 Debouncing

Debouncing voorkomt dat rules te vaak worden uitgevoerd:

- **Configureerbaar per rule** via `debounceMinutes` field
- Checkt recente executions binnen debounce window
- Skips execution als recent uitgevoerd
- Default: 60 minuten

Voorbeeld debounce waarden:
- Capaciteit waarschuwingen: 60 min
- Efficiency alerts: 120 min (2 uur)
- Order delay kritiek: 360 min (6 uur)
- Inspectie reminders: 1440 min (1 dag)
- AI learning updates: 10080 min (1 week)

## 📊 Execution History

Alle rule executions worden gelogd in `automationExecutions` collection:

```javascript
{
  ruleId: "abc123",
  ruleName: "⚠️ Capaciteitstekort Waarschuwing",
  trigger: { type: "capacity_shortage", conditions: { threshold: 40 } },
  action: { type: "send_notification", params: { severity: "warning" } },
  status: "success", // of "no_trigger", "error"
  message: "⚠️ Capaciteitstekort: 52h tekort (threshold: 40h)",
  data: {
    totalCapacity: 160,
    totalDemand: 212,
    shortage: 52
  },
  actionResult: {
    success: true,
    message: "Notificatie verzonden"
  },
  executedAt: Timestamp
}
```

## 🚨 Breaking Changes

### ⚠️ Geen Breaking Changes

De migratie is backward compatible:

1. **NotificationRulesView** blijft werken met oude hardcoded logica
2. **WorkstationHub** behoud reminder functionaliteit (kan later uitgeschakeld)
3. **autoLearningService** blijft beschikbaar als utility

### 🔄 Aangeraden Workflow

1. **Fase 1** (NU): Importeer default rules
2. **Fase 2**: Test alle rules handmatig via Play knop
3. **Fase 3**: Enable rules één voor één
4. **Fase 4**: Monitor execution history voor 1-2 weken
5. **Fase 5**: Disable oude hardcoded logica:
   - Comment uit `NotificationRulesView` monitoring useEffect
   - Comment uit `WorkstationHub` reminder useEffect
   - Vervang `autoLearningService` calls met Automation Rules

## 🎨 UI Features

### Rule Card

```
┌──────────────────────────────────────────────┐
│ ⚠️ Capaciteitstekort Waarschuwing            │
│ [60min debounce]                              │
│                                                │
│ [⚠] WHEN Capaciteitstekort → THEN Stuur      │
│                               Notificatie      │
│                                                │
│ Threshold: 40h                                 │
│                                                │
│ Uitgevoerd: 12x    Laatst: 15/01 14:30        │
│                                                │
│ [▶ Test] [✓ Enabled] [🗑 Delete]              │
└──────────────────────────────────────────────┘
```

### Add Rule Modal

- **8 Trigger Types** (gegroepeerd in optgroups)
- **7 Action Types**
- **Dynamic Conditions** (afhankelijk van trigger type)
- **Debounce Configuratie**
- **Enable/Disable Toggle**

### Execution History

Real-time lijst van laatste 100 executions met:
- Rule naam
- Status (success/no_trigger/error)
- Message
- Timestamp

## 📚 Voorbeeld Rules

### 1. Capaciteit Monitoring
```javascript
{
  name: "⚠️ Capaciteitstekort Waarschuwing",
  trigger: {
    type: "capacity_shortage",
    conditions: { threshold: 40 }
  },
  action: {
    type: "send_notification",
    params: { severity: "warning" }
  },
  debounceMinutes: 60
}
```

### 2. Kwaliteit Inspectie
```javascript
{
  name: "⏰ Nabewerking Inspectie Reminder",
  trigger: {
    type: "inspection_overdue",
    conditions: { 
      daysOverdue: 7,
      station: "NABEWERKING" 
    }
  },
  action: {
    type: "inspection_reminder",
    params: {}
  },
  debounceMinutes: 1440
}
```

### 3. AI Learning (Dry Run)
```javascript
{
  name: "🤖 AI Standaarden Analyse",
  trigger: {
    type: "standard_deviation",
    conditions: { 
      minSamples: 10,
      minDeviation: 15 
    }
  },
  action: {
    type: "auto_learning_update",
    params: { 
      learningRate: 0.3,
      dryRun: true  // TEST EERST!
    }
  },
  debounceMinutes: 10080,
  enabled: false  // Handmatig enablen na testing
}
```

## 🔍 Testing

### Manual Testing

1. Open AutomationRulesView
2. Klik Play knop bij een rule
3. Check alert voor resultaat
4. Verifieer execution in History tab

### Automated Testing (toekomstig)

```javascript
import { evaluateRule } from './utils/automationEngine';

// Test capacity shortage trigger
const rule = {
  trigger: {
    type: "capacity_shortage",
    conditions: { threshold: 40 }
  },
  action: {
    type: "send_notification",
    params: { severity: "warning" }
  }
};

const result = await evaluateRule(rule);
expect(result.triggered).toBe(true);
expect(result.message).toContain("Capaciteitstekort");
```

## 📈 Monitoring

### Metrics om te Volgen

1. **Execution Count** per rule
2. **Success Rate** (success vs error)
3. **Trigger Rate** (triggered vs no_trigger)
4. **Debounce Effectiveness** (skipped executions)
5. **Action Performance** (execution time)

### Firestore Queries

```javascript
// Get all executions for a specific rule
const executionsQuery = query(
  collection(db, "automationExecutions"),
  where("ruleId", "==", ruleId),
  orderBy("executedAt", "desc"),
  limit(100)
);

// Get failed executions
const failedQuery = query(
  collection(db, "automationExecutions"),
  where("status", "==", "error"),
  orderBy("executedAt", "desc")
);

// Get most active rules
const rulesQuery = query(
  collection(db, "automationRules"),
  orderBy("executionCount", "desc"),
  limit(10)
);
```

## 🎓 Best Practices

### 1. Start Conservatief
- Begin met **disabled** rules
- Gebruik **dry-run** mode voor AI learning
- Hogere **debounce** waarden initieel

### 2. Monitor & Tune
- Check execution history dagelijks eerste week
- Pas thresholds aan op basis van false positives
- Verhoog/verlaag debounce tijden

### 3. Documenteer Custom Rules
- Voeg beschrijving toe aan rule
- Noteer waarom specific conditions gekozen zijn
- Track performance metrics

### 4. Safety Checks
- AI learning altijd eerst dry-run
- Critical actions require manual approval
- Logging voor alle executions

## 🚀 Roadmap

### Volgende Features

- [ ] **Real-time Monitoring Dashboard**: Live view van rule executions
- [ ] **Rule Templates**: Pre-configured rule sets per use case
- [ ] **Conditional Actions**: If-then-else action chains
- [ ] **Scheduled Triggers**: Cron-style time-based triggers
- [ ] **Webhook Actions**: HTTP callbacks naar externe systemen
- [ ] **Rule Analytics**: Performance metrics en insights
- [ ] **A/B Testing**: Test variations van rules
- [ ] **Rule Dependencies**: "Only if rule X also triggered"

### Geplande Deprecations

- **Q2 2025**: NotificationRulesView hardcoded logic removal
- **Q3 2025**: WorkstationHub reminder logic removal
- **Q4 2025**: autoLearningService deprecation (use Automation Rules)

## 📞 Support

Voor vragen of issues met de Automation Rules Engine:

1. Check **Execution History** voor error messages
2. Test rule handmatig via Play knop
3. Verifieer Firestore data (occupancy, planning, tracking)
4. Check console logs voor detailed errors

---

**Laatste Update:** 15 januari 2025  
**Versie:** 1.0.0  
**Status:** ✅ Production Ready
