/**
 * src/utils/lotLogic.js
 * Bevat business logic voor het genereren van lotnummers en datum-verwerking.
 * Dit is onderdeel van Fase 2: Business Logic uit UI componenten halen.
 */

/**
 * Berekent het ISO weeknummer en het bijbehorende jaar.
 * Dit is nodig omdat de eerste dagen van januari soms bij de laatste week van het vorige jaar horen.
 * @param {Date} date - De datum om te checken (standaard nu)
 * @returns {Object} { week: number, year: number }
 */
export const getISOWeekInfo = (date = new Date()) => {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { week: weekNo, year: d.getUTCFullYear() };
};

/**
 * Genereert een uniek lotnummer op basis van de Future Factory standaard.
 * Formaat: 40{YY}{WW}{MachineCode}40{Volgnummer}
 * @param {string} stationId - De ID van het werkstation (bijv. "Machine 1" of "400")
 * @param {Array} existingProducts - Lijst van alle huidige producten om het volgende nummer te bepalen
 * @returns {string} Het nieuwe unieke lotnummer
 */
export const generateLotNumber = (stationId, existingProducts = []) => {
  const now = new Date();
  const yy = now.getFullYear().toString().slice(-2);
  const { week } = getISOWeekInfo(now);
  const ww = String(week).padStart(2, "0");

  // Haal cijfers uit stationId. Als er geen cijfers zijn, gebruik default "400"
  // Bijv: "Machine 1" -> "1".
  let digits = stationId.replace(/\D/g, "");

  // Future Factory specifieke logica:
  // Als er geen digits zijn, of digits is 0, fallback naar 400.
  // We proberen hier de machinecode te bepalen (vaak 3 cijfers beginnend met 4, of 1 cijfer dat we prefixen)
  let machineCode = "400";

  if (digits) {
    if (digits.length === 3) {
      machineCode = digits;
    } else if (digits.length === 1) {
      // Bijv machine "1" wordt vaak "401" in interne logic
      machineCode = `40${digits}`;
    } else {
      machineCode = `4${digits.padStart(2, "0")}`;
    }
  }

  // Prefix opbouw: 40 + Jaar + Week + Machine + 40
  const prefix = `40${yy}${ww}${machineCode}40`;

  // Tel hoeveel producten deze prefix al hebben
  const count = existingProducts.filter(
    (p) => p.lotNumber && p.lotNumber.toString().startsWith(prefix)
  ).length;

  // Genereer volgnummer (4 cijfers, padded)
  // Bijv: 1 -> "0001"
  const seq = String(count + 1).padStart(4, "0");

  return `${prefix}${seq}`;
};

// Mapping voor specifieke stations naar codes (voor placeholders)
const stationToCode = {
  BH11: "411",
  BH12: "412",
  BH15: "415",
  BH16: "416",
  BH17: "417",
  BH18: "418",
  BH31: "431",
  BH05: "405",
  BH07: "407",
  BH08: "408",
  BH09: "409",
  BA05: "405",
  BA07: "407",
  BA08: "408",
  BA09: "409",
};

export const getLotPlaceholder = (stationId) => {
  if (!stationId) return "402608400000000";
  const code = stationToCode[stationId.toUpperCase()] || "400";
  return `402608${code}0000`;
};
