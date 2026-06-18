import React, { useState, useEffect, useRef, FC, FormEvent, ChangeEvent } from "react";
import i18n from "i18next";
import { X } from "lucide-react";
import { useNotifications } from '../../contexts/NotificationContext';

interface MobileScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
}

interface ZXingGlobal {
  BrowserMultiFormatReader: new () => ZXingCodeReader;
}

interface ZXingCodeReader {
  decodeFromStream(stream: MediaStream, videoElement: HTMLVideoElement, callback: (result: any) => void): Promise<void>;
  reset(): void;
}

declare global {
  interface Window {
    ZXing?: ZXingGlobal;
  }
}

const MobileScanner: FC<MobileScannerProps> = ({ onScan, onClose }) => {
  const { notify } = useNotifications();
  const [scannerLoaded, setScannerLoaded] = useState<boolean>(false);
  const [manualCode, setManualCode] = useState<string>("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const codeReaderRef = useRef<ZXingCodeReader | null>(null);
  const isScanningRef = useRef<boolean>(false);

  useEffect(() => {
    // Load ZXing library via CDN (Multi-format support: QR + Barcodes)
    const scriptId = "zxing-scanner";
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://unpkg.com/@zxing/library@0.20.0";
      script.async = true;
      script.onload = () => setScannerLoaded(true);
      document.head.appendChild(script);
    } else {
      setScannerLoaded(true);
    }

    // Cleanup bij unmount
    return () => {
      stopCamera();
    };
  }, []);

  // Start camera zodra scanner geladen is
  useEffect(() => {
    if (scannerLoaded) {
      startCamera();
    }
  }, [scannerLoaded]);

  const startCamera = async (): Promise<void> => {
    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: "environment",
          width: { ideal: 1920 }, // Hogere resolutie voor betere detectie
          height: { ideal: 1080 },
          advanced: [{ focusMode: "continuous" } as any], // Probeer autofocus te forceren
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      // Apply focus constraint if supported (Cruciaal voor mobiel!)
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities ? track.getCapabilities() : ({} as any);
      if (capabilities.focusMode && capabilities.focusMode.includes('continuous')) {
        try {
          await track.applyConstraints({ advanced: [{ focusMode: "continuous" } as any] });
        } catch (e) {
          console.error(e);
        }
      }

      // Gebruik window.ZXing (geladen via CDN)
      if (videoRef.current && window.ZXing) {
        const codeReader = new window.ZXing.BrowserMultiFormatReader();
        codeReaderRef.current = codeReader;
        isScanningRef.current = true;

        // ZXing handles the video stream and decoding loop
        await codeReader.decodeFromStream(stream, videoRef.current, (result: any) => {
          if (result) {
            if (navigator.vibrate) navigator.vibrate(100);
            onScan(result.getText());
          }
        });
      }
    } catch (error) {
      console.error("Camera error:", error);
      notify("Kan camera niet starten. Controleer permissies.");
      onClose();
    }
  };

  const stopCamera = (): void => {
    isScanningRef.current = false;
    if (codeReaderRef.current) {
      codeReaderRef.current.reset();
      codeReaderRef.current = null;
    }
  };

  const handleManualSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (manualCode.trim()) {
      onScan(manualCode.trim());
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black">
      <div className="relative h-full">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-3 bg-white rounded-full shadow-lg"
        >
          <X size={24} className="text-slate-900" />
        </button>

        {/* Camera View */}
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          autoPlay
          muted
        />

        {/* Scan Overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative w-72 h-72">
            {/* Scanning animation */}
            <div className="absolute inset-0 border-4 border-white/30 rounded-3xl"></div>
            <div className="absolute inset-0 border-4 border-indigo-500 rounded-3xl animate-pulse"></div>

            {/* Corner markers */}
            <div className="absolute -top-2 -left-2 w-16 h-16 border-t-4 border-l-4 border-indigo-400 rounded-tl-3xl"></div>
            <div className="absolute -top-2 -right-2 w-16 h-16 border-t-4 border-r-4 border-indigo-400 rounded-tr-3xl"></div>
            <div className="absolute -bottom-2 -left-2 w-16 h-16 border-b-4 border-l-4 border-indigo-400 rounded-bl-3xl"></div>
            <div className="absolute -bottom-2 -right-2 w-16 h-16 border-b-4 border-r-4 border-indigo-400 rounded-br-3xl"></div>
          </div>
        </div>

        {/* Manual Input */}
        <div className="absolute bottom-24 left-0 right-0 px-6">
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              type="text"
              placeholder={i18n.t("placeholders.dpOrTypeCodeManually", "Of typ code handmatig...")}
              className="flex-1 bg-white/90 backdrop-blur border-0 rounded-xl px-4 py-3 text-slate-900 font-bold outline-none focus:ring-2 focus:ring-indigo-500"
              value={manualCode}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setManualCode(e.target.value)}
            />
            <button type="submit" className="bg-indigo-600 text-white px-4 rounded-xl font-bold">
              Go
            </button>
          </form>
        </div>

        {/* Instructions */}
        <div className="absolute bottom-8 left-0 right-0 text-center px-4">
          <div className="bg-black/70 backdrop-blur-sm px-6 py-4 rounded-2xl inline-block">
            <div className="text-white font-bold text-lg mb-1">{i18n.t('mobileScanner.scanQrCode', 'Scan QR Code')}</div>
            <div className="text-xs text-white/70">{i18n.t('mobileScanner.placeQrInCenter', 'Plaats de QR code in het midden van het vierkant')}</div>
            {!scannerLoaded && (
              <div className="text-xs text-amber-300 mt-2">{i18n.t('mobileScanner.loadingScanner', '⏳ Scanner wordt geladen...')}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MobileScanner;
