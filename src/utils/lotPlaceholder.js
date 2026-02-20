// utils/lotPlaceholder.js
// Helper om een lotnummer voorbeeld te genereren op basis van stationId

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

export function getLotPlaceholder(stationId) {
  if (!stationId) return "402608400000000";
  const code = stationToCode[stationId.toUpperCase()] || "400";
  return `402608${code}0000`;
}
