export const generateAuthQR = (email, password, redirectPath = "/planning") => {
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
export const parseAuthQR = (qrString) => {
    try {
        const jsonString = atob(qrString);
        const data = JSON.parse(jsonString);
        if (data.type !== 'FPI_AUTH' || !data.e || !data.p) {
            throw new Error('Ongeldige FPi QR Code');
        }
        return {
            email: String(data.e),
            password: String(data.p),
            redirectPath: typeof data.r === "string" ? data.r : undefined,
        };
    }
    catch (error) {
        console.error("QR Parse Error:", error);
        return null;
    }
};
