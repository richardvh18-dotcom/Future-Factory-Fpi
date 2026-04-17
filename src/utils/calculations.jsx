/**
 * calculations.js
 * Bevat de wiskundige logica voor de applicatie.
 */

/**
 * Berekent de Z-maat, Totale Lengte (L) en Insteekdiepte (B1)
 * op basis van de geselecteerde parameters en dimensie-tabellen.
 */
export const calculateZDimension = (
  diameter,
  pressure,
  type,
  connection,
  standardFittingDims,
  bellDimensions
) => {
  // 1. Inputs parsen
  const pDia = parseInt(diameter);
  const pPress = parseFloat(pressure);
  const connType = connection.split("/")[0] || "TB";

  if (!standardFittingDims || !bellDimensions) {
    return null;
  }

  // 2. Data opzoeken in de tabellen
  // Probeer specifieke sleutel (bijv. "elbow_tb") of generieke sleutel ("elbow")
  const fitting =
    standardFittingDims?.[`${type.toLowerCase()}_${connType.toLowerCase()}`]?.[
      pPress
    ]?.[pDia] || standardFittingDims?.[type.toLowerCase()]?.[pPress]?.[pDia];

  // Probeer lookup met nummer of string key voor pressure
  const bell =
    bellDimensions?.[connType]?.[pPress]?.[pDia] ||
    bellDimensions?.[connType]?.[String(pPress)]?.[pDia];

  // 3. Berekening uitvoeren
  if (fitting && bell) {
    const L = parseFloat(fitting.L || 0);
    const B1 = parseFloat(bell.B1 || 0);
    const z = L - B1;

    // 4. Resultaat teruggeven
    return {
      zMaat: z.toFixed(1),
      L: L.toFixed(1),
      B1: B1.toFixed(1),
    };
  }

  return null;
};
