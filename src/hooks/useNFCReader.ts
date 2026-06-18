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

type NDEFRecordLike = {
  recordType?: string;
  data?: ArrayBufferLike | null;
};

type NFCReadingEventLike = {
  serialNumber?: string;
  message?: {
    records?: NDEFRecordLike[];
  };
};

type NDEFReaderLike = {
  scan: (options?: { signal?: AbortSignal }) => Promise<void>;
  addEventListener: (
    type: "reading" | "readingerror",
    listener: ((event: NFCReadingEventLike) => void) | (() => void),
    options?: { signal?: AbortSignal },
  ) => void;
};

type NDEFReaderCtor = new () => NDEFReaderLike;

export const NFC_STATUS = {
  IDLE:       "idle",       // Niet actief
  SCANNING:   "scanning",   // Bezig met scannen
  SUCCESS:    "success",    // Tag gelezen
  ERROR:      "error",      // Fout
  UNSUPPORTED:"unsupported",// Browser/toestel ondersteunt geen NFC
};

const isNFCSupported = () => typeof window !== "undefined" && "NDEFReader" in window;

const toHex = (bufferLike: ArrayBufferLike | null | undefined): string => {
  if (!bufferLike) return "";
  const bytes = new Uint8Array(bufferLike);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
};

const getTextDecoder = (): typeof TextDecoder => window.TextDecoder;

const decodeNDEFTextRecord = (record: NDEFRecordLike): string => {
  // NDEF text record layout: [status byte][language code][text bytes]
  // status bit 7: 0 = UTF-8, 1 = UTF-16
  // status bits 5..0: language code length
  const bytes = new Uint8Array(record.data || new ArrayBuffer(0));
  if (bytes.length === 0) return "";

  const status = bytes[0];
  const languageLength = status & 0x3f;
  const isUtf16 = (status & 0x80) !== 0;
  const start = 1 + languageLength;
  if (start >= bytes.length) return "";

  const decoder = new (getTextDecoder())(isUtf16 ? "utf-16" : "utf-8");
  return decoder.decode(bytes.slice(start)).trim();
};

const extractTagValue = (event: NFCReadingEventLike): string => {
  const serial = String(event?.serialNumber || "").trim();

  // serialNumber fallback helps with tags that are detected but do not expose usable text payload.
  let fallbackValue = serial;
  const records = event?.message?.records || [];

  for (const record of records) {
    if (record.recordType === "text") {
      const textValue = decodeNDEFTextRecord(record);
      if (textValue) return textValue;
    }

    if (record.recordType === "url") {
      const decoder = new (getTextDecoder())();
      const raw = decoder.decode(record.data || new ArrayBuffer(0)).trim();
      if (raw) {
        const parts = raw.split("/");
        return (parts[parts.length - 1] || raw).trim();
      }
    }

    if (record.recordType === "mime") {
      const decoder = new (getTextDecoder())();
      const raw = decoder.decode(record.data || new ArrayBuffer(0)).trim();
      if (raw) return raw;
    }

    if (!fallbackValue && record.data) {
      fallbackValue = toHex(record.data);
    }
  }

  return fallbackValue;
};

/**
 * @param {function} onRead - Callback met de gelezen waarde (personeelsnummer string)
 */
export function useNFCReader(onRead?: (value: string) => void) {
  const [status, setStatus] = useState(NFC_STATUS.IDLE);
  const [errorMessage, setErrorMessage] = useState("");
  const readerRef = useRef<NDEFReaderLike | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const onReadRef = useRef(onRead);
  onReadRef.current = onRead;

  // Luister naar postMessage van native ATPS wrapper (toekomstige koppeling).
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Verwacht formaat: { type: "NFC_TAG", payload: "12345" }
      const messageData = event.data as { type?: unknown; payload?: unknown } | null;
      if (messageData?.type === "NFC_TAG" && messageData?.payload != null) {
        const value = String(messageData.payload).trim();
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
      const ReaderCtor = (window as unknown as { NDEFReader?: NDEFReaderCtor }).NDEFReader;
      if (!ReaderCtor) {
        setStatus(NFC_STATUS.UNSUPPORTED);
        setErrorMessage("NFC wordt niet ondersteund door deze browser. Gebruik Chrome op Android.");
        return;
      }

      const reader = new ReaderCtor();
      readerRef.current = reader;
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      await reader.scan({ signal: abortController.signal });

      reader.addEventListener("reading", (event: NFCReadingEventLike) => {
        const value = extractTagValue(event);
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

    } catch (err: unknown) {
      const errName = typeof err === "object" && err !== null && "name" in err
        ? String((err as { name?: unknown }).name)
        : "";
      const errMessage = typeof err === "object" && err !== null && "message" in err
        ? String((err as { message?: unknown }).message || "")
        : "";

      if (errName === "AbortError") {
        setStatus(NFC_STATUS.IDLE);
        return;
      }
      if (errName === "NotAllowedError") {
        setStatus(NFC_STATUS.ERROR);
        setErrorMessage("NFC-toegang geweigerd. Geef toestemming via de browserinstellingen.");
      } else {
        setStatus(NFC_STATUS.ERROR);
        setErrorMessage(errMessage || "NFC fout");
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
