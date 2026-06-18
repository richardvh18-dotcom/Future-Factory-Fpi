/**
 * Printer Driver Registry voor Future Factory
 *
 * Elk printermerk/-model krijgt hier zijn eigen configuratie.
 * Alle printeropdrachten in de app resolven via getDriver() zodat
 * DPI, darkness, cut-commando's en kalibratie altijd per printer correct zijn.
 *
 * Ondersteunde modellen:
 *  - zebra-zm400-203  : Zebra ZM400 203 DPI (8 dots/mm)
 *  - zebra-zm400-300  : Zebra ZM400 300 DPI (12 dots/mm)
 *  - zebra-epl2-203   : Zebra EPL2 Label Printer 203 DPI
 *  - lighthouse-cjpro2: Lighthouse CJ-PRO II 300 DPI, TSPL/Windows-driver
 */

type PrinterDriver = {
  id: string;
  label: string;
  nativeDpi: number;
  dotsPerMm: number;
  defaultDarkness: number;
  defaultSpeed: number;
  labelLanguage: string;
  cutCommand: string | null;
  suppressBackfeed: boolean;
  utf8Encoding: boolean;
  mediaMode: string | null;
};

type PrinterProfile = Record<string, unknown> & {
  driverModel?: string;
  name?: string;
  deviceName?: string;
  model?: string;
  productName?: string;
  dpi?: string | number;
  rollWidthMm?: string | number;
  width?: string | number;
  rollType?: string;
  calibrationOffsetXMm?: string | number;
  calibrationOffsetYMm?: string | number;
};

export const PRINTER_DRIVERS: Record<string, PrinterDriver> = {
  'zebra-zm400-203': {
    id: 'zebra-zm400-203',
    label: 'Zebra ZM400 (203 DPI)',
    nativeDpi: 203,
    dotsPerMm: 8,            // 203 / 25.4 ≈ 7.99 → 8
    defaultDarkness: 20,
    defaultSpeed: 3,
    labelLanguage: 'zpl',
    cutCommand: '^CN1',
    suppressBackfeed: true,  // ^XB
    utf8Encoding: true,       // ^CI28
    mediaMode: '^MMC',
  },
  'zebra-zm400-300': {
    id: 'zebra-zm400-300',
    label: 'Zebra ZM400 (300 DPI)',
    nativeDpi: 300,
    dotsPerMm: 12,           // 300 / 25.4 ≈ 11.81 → 12 (ZPL conventie)
    defaultDarkness: 20,
    defaultSpeed: 3,
    labelLanguage: 'zpl',
    cutCommand: '^CN1',
    suppressBackfeed: true,
    utf8Encoding: true,
    mediaMode: '^MMC',
  },
  'zebra-epl2-203': {
    id: 'zebra-epl2-203',
    label: 'Zebra EPL2 Label Printer (203 DPI)',
    nativeDpi: 203,
    dotsPerMm: 8,
    // PPD biedt darkness 1..30 en default printerwaarde. 20 is in lijn met huidige pilot-tuning.
    defaultDarkness: 20,
    // PPD noemt print rates 1..6 ips; 3 ips is een veilige middenwaarde voor leesbare output.
    defaultSpeed: 3,
    labelLanguage: 'epl',
    cutCommand: null,
    suppressBackfeed: false,
    utf8Encoding: false,
    mediaMode: null,
  },
  'lighthouse-cjpro2': {
    id: 'lighthouse-cjpro2',
    label: 'Lighthouse CJ-PRO II',
    nativeDpi: 300,
    dotsPerMm: 12,
    defaultDarkness: 15,
    defaultSpeed: 4,
    labelLanguage: 'tspl',   // Gebruikt Windows-driver / TSPL pad
    cutCommand: null,         // Geen ZPL ^CN1 — cutter via Windows-driver
    suppressBackfeed: false,
    utf8Encoding: true,
    mediaMode: null,
  },
};

/** Standaard driver als geen profiel beschikbaar is. */
export const DEFAULT_DRIVER_ID = 'zebra-zm400-203';

const isDriverId = (value: unknown): value is keyof typeof PRINTER_DRIVERS =>
  typeof value === 'string' && value in PRINTER_DRIVERS;

/**
 * Resolve een driver uit een Firestore printer-profiel.
 *
 * Prioriteit:
 *  1. Expliciet geselecteerde driver-ID in `printerProfile.driverModel`
 *  2. Naamhint in name/deviceName/model/productName (legacy support)
 *  3. Numerieke DPI-waarde → generiek ZPL-profiel
 *  4. Standaard (zebra-zm400-300)
 *
 * @param {Object|null} printerProfile  – Firestore printer document
 * @returns {Object}  Driver config object
 */
export const getDriver = (printerProfile: PrinterProfile | null): PrinterDriver => {
  if (!printerProfile) return PRINTER_DRIVERS[DEFAULT_DRIVER_ID];

  // 1. Expliciete driver-ID opgeslagen door beheerder
  const stored = printerProfile.driverModel;
  if (isDriverId(stored)) return PRINTER_DRIVERS[stored];

  // 2. Naamhint (legacy / nog niet gemigreerde profielen)
  const hint = [
    printerProfile.name,
    printerProfile.deviceName,
    printerProfile.model,
    printerProfile.productName,
  ]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();

  if (hint.includes('CJ-PRO') || hint.includes('LIGHTHOUSE')) {
    return PRINTER_DRIVERS['lighthouse-cjpro2'];
  }
  if (hint.includes('EPL2') || hint.includes('EPL')) {
    return PRINTER_DRIVERS['zebra-epl2-203'];
  }
  if (hint.includes('ZM400') || hint.includes('ZEBRA')) {
    const dpi = Number.parseInt(String(printerProfile.dpi ?? ''), 10);
    // ZM400 in productie is standaard 203 DPI tenzij expliciet 300 is opgeslagen.
    return dpi === 203
      ? PRINTER_DRIVERS['zebra-zm400-203']
      : dpi === 300
        ? PRINTER_DRIVERS['zebra-zm400-300']
        : PRINTER_DRIVERS['zebra-zm400-203'];
  }

  // 3. Numerieke DPI als fallback (onbekend merk)
  const dpi = Number.parseInt(String(printerProfile.dpi ?? ''), 10);
  if (Number.isFinite(dpi) && dpi > 0) {
    return {
      id: 'custom',
      label: `Aangepaste Printer (${dpi} DPI)`,
      nativeDpi: dpi,
      dotsPerMm: Math.round((dpi / 25.4) * 10) / 10,
      defaultDarkness: 15,
      defaultSpeed: 3,
      labelLanguage: 'zpl',
      cutCommand: null,
      suppressBackfeed: false,
      utf8Encoding: true,
      mediaMode: null,
    };
  }

  return PRINTER_DRIVERS[DEFAULT_DRIVER_ID];
};

/**
 * Converteer mm naar printer-dots met de resolutie van een specifieke driver.
 *
 * @param {number} mm
 * @param {Object} driver  – driver object van getDriver()
 * @returns {number} dots (integer)
 */
export const mmToDriverDots = (
  mm: number | string | null | undefined,
  driver?: Pick<PrinterDriver, 'dotsPerMm'> | null
): number => {
  const dotsPerMm = driver?.dotsPerMm ?? PRINTER_DRIVERS[DEFAULT_DRIVER_ID].dotsPerMm;
  return Math.round((Number(mm) || 0) * dotsPerMm);
};

/**
 * Bepaal de effectieve DPI voor rendering/bitmap-print.
 * Prioriteit: expliciete printer.dpi -> driver nativeDpi -> fallback.
 */
export const resolvePrinterDpi = (
  printerProfile: PrinterProfile | null,
  fallback = 203
): number => {
  const parsed = Number.parseInt(String(printerProfile?.dpi ?? ''), 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;

  const driverDpi = Number(getDriver(printerProfile)?.nativeDpi);
  if (Number.isFinite(driverDpi) && driverDpi > 0) return driverDpi;

  return fallback;
};

/** Normaliseer de rol-/media-instellingen uit een printerprofiel. */
export const getPrinterRollSettings = (printer: Record<string, any> = {}) => {
  const parsedWidth = Number.parseFloat(String(printer.rollWidthMm ?? printer.width ?? '').replace(',', '.'));
  const rollWidthMm = Number.isFinite(parsedWidth) && parsedWidth > 0 ? parsedWidth : 90;

  const rawType = String(printer.rollType || '').trim().toLowerCase();
  const rollType = rawType === 'continuous' || rawType === 'mark' ? rawType : 'gap';

  // ZPL media tracking:
  // - continuous: ^MNN
  // - gap/web labels: ^MNY
  // - black mark: ^MNM
  const mediaTrackingCommand = rollType === 'continuous'
    ? '^MNN'
    : rollType === 'mark'
      ? '^MNM'
      : '^MNY';

  return { rollWidthMm, rollType, mediaTrackingCommand };
};

// --- Interne helper (niet geëxporteerd) ---
const _parseMm = (value: unknown): number => {
  const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Past kalibratie-offsets toe op ruwe ZPL via ^LS / ^LH / ^LT.
 *
 * Gebruikt uitsluitend de Firestore-waarden (calibrationOffsetXMm /
 * calibrationOffsetYMm). Er zijn GEEN hardcoded fallback-waarden meer.
 * Stel de offsets in via Beheer → Printers → Kalibratie.
 *
 * @param {string} zplContent   – ZPL string met één of meer ^XA blokken
 * @param {Object} printer      – Firestore printer-profiel
 * @param {Object|null} driver  – optioneel driver object; wordt afgeleid als null
 * @returns {string} ZPL met kalibratie-offsets ingevoegd na elke ^XA
 */
export const applyCalibration = (
  zplContent: string,
  printer: PrinterProfile = {},
  driver: PrinterDriver | null = null
): string => {
  const resolvedDriver = driver ?? getDriver(printer);
  const dotsPerMm = resolvedDriver.dotsPerMm;
  const rollSettings = getPrinterRollSettings(printer);

  const offsetXmm = _parseMm(printer?.calibrationOffsetXMm);
  const offsetYmm = _parseMm(printer?.calibrationOffsetYMm);

  const xDots = Math.round(Math.abs(offsetXmm) * dotsPerMm);
  const yDots = Math.round(Math.abs(offsetYmm) * dotsPerMm);

  // ^LS n       = verschuif labels n dots naar links (negatief X)
  // ^LH x,y     = label origin: naar rechts (positief X) of naar beneden (positief Y)
  // ^LT -n      = top-of-form aanpassing naar boven (negatief Y)
  let xPart = '';
  let yPart = '';

  if (offsetXmm < 0) {
    xPart = `^LS${xDots}`;
  } else if (offsetXmm > 0) {
    xPart = `^LH${xDots},0`;
  }

  if (offsetYmm > 0) {
    // naar beneden: combineer ^LH x,y
    if (offsetXmm >= 0) {
      xPart = `^LH${Math.round(Math.max(0, offsetXmm) * dotsPerMm)},${yDots}`;
    } else {
      yPart = `^LH0,${yDots}`;
    }
  } else if (offsetYmm < 0) {
    // naar boven: ^LT negatief
    yPart = `^LT-${yDots}`;
  }

  const insertionParts = [];
  if (rollSettings.mediaTrackingCommand) insertionParts.push(rollSettings.mediaTrackingCommand);
  if (xPart) insertionParts.push(xPart);
  if (yPart) insertionParts.push(yPart);

  if (insertionParts.length === 0) return zplContent;
  return String(zplContent).replace(/\^XA/g, `^XA\n${insertionParts.join('\n')}`);
};
