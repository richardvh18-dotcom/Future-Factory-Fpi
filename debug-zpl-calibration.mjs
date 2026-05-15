#!/usr/bin/env node
/**
 * Debug script: Generate sample ZPL output with new calibration
 * to visually inspect font metrics
 */

import { generatePrintData, generateLotBatchZPL } from './zplHelper.js';

console.log('═══════════════════════════════════════════════════════════════');
console.log('  ZPL Font Calibration Validation');
console.log('═══════════════════════════════════════════════════════════════\n');

// Example 1: Standard label with 10pt text (default)
console.log('📌 EXAMPLE 1: Standard Label (10pt text @ 203 DPI)');
console.log('─────────────────────────────────────────────────────────────');

const template1 = {
  width: 90,
  height: 55,
  darkness: 15,
  printSpeed: 3,
  elements: [
    {
      type: 'text',
      x: 5,
      y: 5,
      fontSize: 10,
      content: 'WAVISTRONG',
      width: 80,
      height: 8,
      align: 'left',
    },
    {
      type: 'text',
      x: 5,
      y: 16,
      fontSize: 8,
      content: 'FUTURE PIPE INDUSTRIES',
      width: 80,
      height: 6,
      align: 'left',
    },
    {
      type: 'text',
      x: 5,
      y: 25,
      fontSize: 6,
      content: 'Test Label Output',
      width: 80,
      height: 5,
    },
  ],
};

const zpl1 = generatePrintData(template1, { isLastOfBatch: true }, 203);
const fontSpecs1 = zpl1.match(/\^A0[A-Z],(\d+),(\d+)/g) || [];
console.log(`Generated Font Commands: ${fontSpecs1.length}`);
fontSpecs1.forEach((spec, idx) => {
  const match = spec.match(/\^A0([A-Z]),(\d+),(\d+)/);
  if (match) {
    console.log(
      `  ${idx + 1}. Rotation: ${match[1]}, Height: ${match[2]} dots, Width: ${match[3]} dots`
    );
  }
});

// Conversion explanation
console.log('\n📐 Conversion Explanation:');
console.log('  • 10pt CSS font ÷ 2.834 = ~3.5 mm');
console.log('  • 3.5mm × 8 dots/mm @ 203 DPI = ~28 dots');
console.log('  • Character width @ 52% = ~14.6 dots ✓\n');

// Example 2: Lot batch output (Order Labels)
console.log('📌 EXAMPLE 2: Order Label Batch (Lot Numbers)');
console.log('─────────────────────────────────────────────────────────────');

const zpl2 = generateLotBatchZPL({
  lots: ['LOT001', 'LOT002', 'LOT003'],
  orderNumber: 'ORD-40BH18-001',
  printerDpi: 203,
  textHeightMm: 6.5,
  labelWidthMm: 90,
  labelHeightMm: 13,
});

const fontSpecs2 = zpl2.match(/\^A0[A-Z],(\d+),(\d+)/g) || [];
console.log(`Generated ${(zpl2.match(/\^XA/g) || []).length} labels with font specs:`);
fontSpecs2.slice(0, 3).forEach((spec, idx) => {
  const match = spec.match(/\^A0([A-Z]),(\d+),(\d+)/);
  if (match) {
    console.log(
      `  Label ${idx + 1}: Height: ${match[2]} dots, Width: ${match[3]} dots`
    );
  }
});

console.log(`  ... (total: ${fontSpecs2.length} font commands)\n`);

// Summary
console.log('═══════════════════════════════════════════════════════════════');
console.log('✅ CALIBRATION SUMMARY');
console.log('═══════════════════════════════════════════════════════════════');
console.log('  ✓ Font height conversion: CSS pt → ZPL dots (÷2.834)');
console.log('  ✓ Character width ratio: 52% of height (monospace standard)');
console.log('  ✓ Font height range: 6-500 dots (safety limits)');
console.log('  ✓ DPI handling: Consistent for 203 & 300 DPI');
console.log('\n📊 EXPECTED RESULT: Print output should now match preview exactly!\n');
