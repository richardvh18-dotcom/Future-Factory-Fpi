/**
 * Genereert een beveiligde string voor de QR code
 */
type ParsedAuthQR = {
  email: string;
  password: string;
  redirectPath?: string;
};

export const generateAuthQR = (email: string, password: string, redirectPath = "/planning"): string => {
  const payload = JSON.stringify({
    e: email,
    p: password,
    r: redirectPath,
    ts: Date.now(), // Timestamp voor eventuele rotatie/validatie
    type: 'FPI_AUTH'
  });
  // Encode naar Base64 om het 'onzichtbaar' te maken voor blote oog
  return btoa(payload);
};

/**
 * Parseert de QR code string terug naar credentials
 */
export const parseAuthQR = (qrString: string): ParsedAuthQR | null => {
  try {
    const jsonString = atob(qrString);
    const data = JSON.parse(jsonString) as { type?: unknown; e?: unknown; p?: unknown; r?: unknown };
    
    if (data.type !== 'FPI_AUTH' || !data.e || !data.p) {
      throw new Error('Ongeldige FPi QR Code');
    }
    
    return {
      email: String(data.e),
      password: String(data.p),
      redirectPath: typeof data.r === "string" ? data.r : undefined,
    };
  } catch (error) {
    console.error("QR Parse Error:", error);
    return null;
  }
};