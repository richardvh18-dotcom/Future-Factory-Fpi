/**
 * calculations.js
 * Bevat de wiskundige logica voor de applicatie.
 */

/**
 * Berekent de Z-maat, Totale Lengte (L) en Insteekdiepte (B1)
 * op basis van de geselecteerde parameters en dimensie-tabellen.
 */
type FittingRow = {
  L?: number | string;
};

type BellRow = {
  B1?: number | string;
};

type MatrixTable<T> = Record<string, Record<string, Record<string, T | undefined> | undefined> | undefined>;

export const calculateZDimension = (
  diameter: string | number,
  pressure: string | number,
  type: string,
  connection: string,
  standardFittingDims: MatrixTable<FittingRow> | null | undefined,
  bellDimensions: Record<string, Record<string, Record<string, BellRow | undefined> | undefined> | undefined> | null | undefined,
): { zMaat: string; L: string; B1: string } | null => {
  // 1. Inputs parsen
  const pDia = parseInt(String(diameter), 10);
  const pPress = parseFloat(String(pressure));
  const connType = connection.split("/")[0] || "TB";

  if (!standardFittingDims || !bellDimensions) {
    return null;
  }

  // 2. Data opzoeken in de tabellen
  // Probeer specifieke sleutel (bijv. "elbow_tb") of generieke sleutel ("elbow")
  const fitting =
    standardFittingDims?.[`${type.toLowerCase()}_${connType.toLowerCase()}`]?.[
      String(pPress)
    ]?.[String(pDia)] || standardFittingDims?.[type.toLowerCase()]?.[String(pPress)]?.[String(pDia)];

  // Probeer lookup met nummer of string key voor pressure
  const bell =
    bellDimensions?.[connType]?.[String(pPress)]?.[String(pDia)];

  // 3. Berekening uitvoeren
  if (fitting && bell) {
    const L = parseFloat(String(fitting.L || 0));
    const B1 = parseFloat(String(bell.B1 || 0));
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
