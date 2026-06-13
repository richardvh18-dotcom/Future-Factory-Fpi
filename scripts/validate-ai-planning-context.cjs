#!/usr/bin/env node
/*
 * Korte validatie voor AI planning context upgrades.
 * - Controleert of kernfuncties aanwezig zijn in aiService.ts
 * - Draait scenario/trigger smoke-tests op voorbeeldvragen
 */

const fs = require('fs');
const path = require('path');

const servicePath = path.resolve(process.cwd(), 'src/services/aiService.ts');

function parseScenario(query) {
  const raw = String(query || '').trim();
  const lower = raw.toLowerCase();
  const isScenarioIntent = /(wat\s+als|what\s*if|scenario|stel\s+dat|als\s+we)/i.test(raw);
  const orderIds = [...new Set((raw.match(/\bN\d{5,}\b/gi) || []).map((v) => v.toUpperCase()))];

  let delayDays = 0;
  const delayA = lower.match(/(?:uitstel|uitstellen|later|opschuiven|vertragen)\s*(?:met|van)?\s*(\d{1,2})\s*(?:werkdagen|werkdag|dagen|dag|wd)/i);
  const delayB = lower.match(/(\d{1,2})\s*(?:werkdagen|werkdag|dagen|dag|wd)\s*(?:uitstellen|later|opschuiven|vertragen)/i);
  if (delayA && delayA[1]) delayDays = Number(delayA[1]) || 0;
  else if (delayB && delayB[1]) delayDays = Number(delayB[1]) || 0;

  let extraCapacityHours = 0;
  const capA = lower.match(/(?:extra|\+)\s*(\d{1,3})\s*(?:uur|uren)/i);
  const capB = lower.match(/(\d{1,3})\s*(?:uur|uren)\s*(?:extra|capaciteit)/i);
  if (capA && capA[1]) extraCapacityHours += Number(capA[1]) || 0;
  else if (capB && capB[1]) extraCapacityHours += Number(capB[1]) || 0;

  const extraShiftMatch = lower.match(/(\d{1,2})\s*(?:extra\s+)?ploeg(?:en)?/i);
  if (extraShiftMatch && extraShiftMatch[1]) {
    extraCapacityHours += (Number(extraShiftMatch[1]) || 0) * 8;
  } else if (/extra\s+ploeg/.test(lower)) {
    extraCapacityHours += 8;
  }

  const prioritizeOrderIds = [...new Set(
    ((raw.match(/(?:prioriteit|voorrang|eerst)\s*(?:voor|aan)?\s*(N\d{5,})/gi) || [])
      .map((v) => (v.match(/N\d{5,}/i) || [''])[0].toUpperCase())
      .filter(Boolean))
  )];

  const hasScenarioData = delayDays > 0 || extraCapacityHours > 0 || prioritizeOrderIds.length > 0;
  if (!isScenarioIntent && !hasScenarioData) return null;

  return {
    orderIds,
    delayDays,
    extraCapacityHours,
    prioritizeOrderIds,
  };
}

function isCapacityLike(query) {
  const q = String(query || '').toLowerCase();
  return (
    q.includes('werkuur') || q.includes('werkuren') ||
    q.includes('capaciteit') || q.includes('werkdruk') ||
    q.includes('inplannen') || q.includes('deadline') ||
    q.includes('beschikbaar') || /\d+\s*(uur|werkuur|manuur)/i.test(q)
  );
}

function run() {
  if (!fs.existsSync(servicePath)) {
    console.error('FAIL: src/services/aiService.ts niet gevonden');
    process.exit(1);
  }

  const source = fs.readFileSync(servicePath, 'utf8');
  const requiredMarkers = [
    'parsePlanningScenario(',
    'getPredictivePlanningContext(scenario',
    'scenarioExtraCapacity',
    'loadFactor',
    'Prioriteitenlijst:',
  ];

  const missing = requiredMarkers.filter((marker) => !source.includes(marker));
  if (missing.length > 0) {
    console.error('FAIL: markers ontbreken in aiService.ts');
    missing.forEach((m) => console.error(' -', m));
    process.exit(1);
  }

  const tests = [
    {
      name: 'Scenario uitstel + specifieke order',
      query: 'Wat als we order N20023990 2 dagen uitstellen?',
      expect: (s) => s && s.delayDays === 2 && s.orderIds.includes('N20023990'),
    },
    {
      name: 'Scenario extra capaciteit + prioriteit',
      query: 'Geef prioriteit aan N20024001 en 8 uur extra capaciteit',
      expect: (s) => s && s.extraCapacityHours >= 8 && s.prioritizeOrderIds.includes('N20024001'),
    },
    {
      name: 'Capaciteitsvraag zonder scenario',
      query: 'Hoeveel capaciteit hebben we volgende week?',
      expect: (s) => s === null && isCapacityLike('Hoeveel capaciteit hebben we volgende week?'),
    },
    {
      name: 'Geen planningvraag',
      query: 'Wat is de kleur van dit product?',
      expect: (s) => s === null && !isCapacityLike('Wat is de kleur van dit product?'),
    },
  ];

  let passed = 0;
  tests.forEach((t) => {
    const scenario = parseScenario(t.query);
    const ok = !!t.expect(scenario);
    if (ok) {
      passed += 1;
      console.log('PASS', t.name);
    } else {
      console.log('FAIL', t.name, '=>', scenario);
    }
  });

  console.log(`\nResultaat: ${passed}/${tests.length} tests geslaagd`);
  if (passed !== tests.length) process.exit(1);

  console.log('\nVoorbeeldvragen voor handmatige validatie in de app:');
  console.log('- Kan order N20023990 nog voor vrijdag klaar zijn met huidige capaciteit?');
  console.log('- Wat als we N20023990 2 dagen uitstellen en 8 uur extra capaciteit toevoegen?');
  console.log('- Welke orders lopen het hoogste risico op te late levering?');
  console.log('- Geef prioriteit aan N20024001, wat verandert er in de planning?');
}

run();
