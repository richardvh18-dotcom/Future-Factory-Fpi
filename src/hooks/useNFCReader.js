/**
 * useNFCReader - Web NFC API hook
 *
 * Ondersteund op: Android Chrome 89+ en Samsung Internet 15+
 * Niet ondersteund op: iOS, desktop browsers
 *
 * ATPS-voorbereiding: wanneer de tag UID-data bevat (low-level), zou een
 * native wrapper (bijv. Capacitor NFC plugin) de UID kunnen doorgeven via
 * postMessage. Deze hook luistert ook naar dat kanaal zodat de ATPS-koppeling
 * later zonder code-aanpassingen in de rest van de app werkt.
 *
 * Tag-formaat (NDEF Text record): personeelsnummer als plain tekst.
 * Voorbeeld tag inhoud: "12345"
 */

import { useState, useCallback, useRef, useEffect } from "react";

export const NFC_STATUS = {
  IDLE:       "idle",       // Niet actief
  SCANNING:   "scanning",   // Bezig met scannen
  SUCCESS:    "success",    // Tag gelezen
  ERROR:      "error",      // Fout
  UNSUPPORTED:"unsupported",// Browser/toestel ondersteunt geen NFC
};

const isNFCSupported = () => typeof window !== "undefined" && "NDEFReader" in window;

/**
 * @param {function} onRead - Callback met de gelezen waarde (personeelsnummer string)
 */
export function useNFCReader(onRead) {
  const [status, setStatus] = useState(NFC_STATUS.IDLE);
  const [errorMessage, setErrorMessage] = useState("");
  const readerRef = useRef(null);
  const abortControllerRef = useRef(null);
  const onReadRef = useRef(onRead);
  onReadRef.current = onRead;

  // Luister naar postMessage van native ATPS wrapper (toekomstige koppeling).
  useEffect(() => {
    const handleMessage = (event) => {
      // Verwacht formaat: { type: "NFC_TAG", payload: "12345" }
      if (event?.data?.type === "NFC_TAG" && event?.data?.payload) {
        const value = String(event.data.payload).trim();
        if (value) {
          setStatus(NFC_STATUS.SUCCESS);
          onReadRef.current?.(value);
          // Auto reset na 2s
          setTimeout(() => setStatus(NFC_STATUS.IDLE), 2000);
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const startScan = useCallback(async () => {
    if (!isNFCSupported()) {
      setStatus(NFC_STATUS.UNSUPPORTED);
      setErrorMessage("NFC wordt niet ondersteund door deze browser. Gebruik Chrome op Android.");
      return;
    }

    // Stop eventueel lopende scan
    abortControllerRef.current?.abort();

    setStatus(NFC_STATUS.SCANNING);
    setErrorMessage("");

    try {
      const reader = new window.NDEFReader();
      readerRef.current = reader;
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      await reader.scan({ signal: abortController.signal });

      reader.addEventListener("reading", ({ message }) => {
        let value = "";
        for (const record of message.records) {
          if (record.recordType === "text") {
            const decoder = new TextDecoder(record.encoding || "utf-8");
            value = decoder.decode(record.data).trim();
            break;
          }
          // Probeer ook url-records (sommige encoders schrijven als URL)
          if (record.recordType === "url") {
            const decoder = new TextDecoder();
            const raw = decoder.decode(record.data).trim();
            // Haal laatste pad-segment op als personeelsnummer
            const parts = raw.split("/");
            value = parts[parts.length - 1] || raw;
            break;
          }
        }
        if (!value) return;
        setStatus(NFC_STATUS.SUCCESS);
        abortController.abort();
        onReadRef.current?.(value);
        setTimeout(() => setStatus(NFC_STATUS.IDLE), 2000);
      }, { signal: abortController.signal });

      reader.addEventListener("readingerror", () => {
        setStatus(NFC_STATUS.ERROR);
        setErrorMessage("Tag kon niet worden gelezen. Probeer opnieuw.");
        setTimeout(() => setStatus(NFC_STATUS.IDLE), 3000);
      }, { signal: abortController.signal });

    } catch (err) {
      if (err?.name === "AbortError") {
        setStatus(NFC_STATUS.IDLE);
        return;
      }
      if (err?.name === "NotAllowedError") {
        setStatus(NFC_STATUS.ERROR);
        setErrorMessage("NFC-toegang geweigerd. Geef toestemming via de browserinstellingen.");
      } else {
        setStatus(NFC_STATUS.ERROR);
        setErrorMessage(err?.message || "NFC fout");
      }
      setTimeout(() => setStatus(NFC_STATUS.IDLE), 3000);
    }
  }, []);

  const stopScan = useCallback(() => {
    abortControllerRef.current?.abort();
    setStatus(NFC_STATUS.IDLE);
    setErrorMessage("");
  }, []);

  return { status, errorMessage, startScan, stopScan, isSupported: isNFCSupported() };
}
