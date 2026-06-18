import React, { useRef, useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import LabelVisualPreview from "./LabelVisualPreview";
import { captureElementAsCanvas } from "../../utils/zplHelper";
import { canvasToPrinterMonochromeCanvas } from "../../utils/canvasToBitmapZpl";

const getPixelsPerMm = (printerDpi = 203) => {
  return (printerDpi || 203) / 25.4;
};

interface LabelDefinition {
  width?: number;
  height?: number;
  elements?: unknown[];
  [key: string]: unknown;
}

interface AutoScaledLabelPreviewProps {
  label?: LabelDefinition | null;
  data?: Record<string, unknown>;
  className?: string;
  maxScale?: number;
  printerDpi?: number;
  strictFontSizing?: boolean;
  exactBitmapPreview?: boolean;
}

const AutoScaledLabelPreview = ({
  label,
  data,
  className = "",
  maxScale = 1,
  printerDpi = 203,
  strictFontSizing = false,
  exactBitmapPreview = false,
}: AutoScaledLabelPreviewProps) => {
  const containerRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [bitmapPreviewUrl, setBitmapPreviewUrl] = useState<string>("");
  const pixelsPerMm = getPixelsPerMm(printerDpi);

  useEffect(() => {
    if (!label || !containerRef.current) return;

    const calculateScale = () => {
      if (!containerRef.current) return;

      const currentContainer = containerRef.current as { getBoundingClientRect: () => { width: number } };
      const { width } = currentContainer.getBoundingClientRect();
      const labelWidthPx = (label.width || 0) * pixelsPerMm;
      const labelHeightPx = (label.height || 0) * pixelsPerMm;

      if (labelWidthPx === 0) return;

      let newScale = width / labelWidthPx;

      // Voorkom dat hoge/portret labels buiten de schermhoogte vallen
      if (labelHeightPx > 0) {
        const maxSafeHeight = window.innerHeight * 0.50;
        const heightScale = maxSafeHeight / labelHeightPx;
        if (newScale > heightScale) newScale = heightScale;
      }

      // Voorkom dat brede labels gigantisch worden op grote/brede schermen
      if (labelWidthPx > 0) {
        const maxSafeWidth = window.innerWidth * 0.50;
        const widthScale = maxSafeWidth / labelWidthPx;
        if (newScale > widthScale) newScale = widthScale;
      }

      if (newScale > maxScale) newScale = maxScale;

      setScale(newScale);
    };

    const observer = new ResizeObserver(calculateScale);
    observer.observe(containerRef.current as never);
    calculateScale();

    return () => observer.disconnect();
  }, [label, maxScale, pixelsPerMm]);

  useEffect(() => {
    if (!exactBitmapPreview || !label) {
      setBitmapPreviewUrl("");
      return;
    }

    let cancelled = false;
    let host: HTMLDivElement | null = null;
    let root: ReturnType<typeof createRoot> | null = null;

    const run = async () => {
      const widthMm = Number(label.width) || 1;
      const heightMm = Number(label.height) || 1;
      const dotsPerMm = getPixelsPerMm(printerDpi);
      const renderZoom = 4;
      const widthPx = Math.max(1, Math.round(widthMm * dotsPerMm));
      const heightPx = Math.max(1, Math.round(heightMm * dotsPerMm));

      try {
        host = document.createElement("div");
        host.style.position = "fixed";
        host.style.left = "-100000px";
        host.style.top = "0";
        host.style.width = `${widthPx * renderZoom}px`;
        host.style.height = `${heightPx * renderZoom}px`;
        host.style.background = "#ffffff";
        host.style.zIndex = "-1";
        document.body.appendChild(host);

        root = createRoot(host);
        await new Promise<void>((resolve) => {
          root!.render(
            <LabelVisualPreview
              label={{ ...label, width: widthMm, height: heightMm } as any}
              data={data}
              zoom={renderZoom}
              printerDpi={printerDpi}
              strictFontSizing={strictFontSizing}
            />
          );
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });

        const captured = await captureElementAsCanvas(host, widthMm, heightMm, printerDpi);
        const mono = canvasToPrinterMonochromeCanvas(captured, {
          width: widthMm,
          height: heightMm,
          printerDpi,
          threshold: 188,
        });

        if (!cancelled) {
          setBitmapPreviewUrl(mono.toDataURL("image/png"));
        }
      } catch {
        if (!cancelled) {
          setBitmapPreviewUrl("");
        }
      } finally {
        try {
          root?.unmount();
        } catch {
          // no-op
        }
        if (host && host.parentNode) {
          host.parentNode.removeChild(host);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
      try {
        root?.unmount();
      } catch {
        // no-op
      }
      if (host && host.parentNode) {
        host.parentNode.removeChild(host);
      }
    };
  }, [exactBitmapPreview, label, data, printerDpi, strictFontSizing]);

  if (!label) return null;

  const normalizedLabel = {
    ...label,
    width: Number(label.width) || 1,
    height: Number(label.height) || 1,
  };

  return (
    <div ref={containerRef} className={`w-full flex justify-center items-center overflow-hidden ${className}`}>
      {exactBitmapPreview && bitmapPreviewUrl ? (
        <img
          src={bitmapPreviewUrl}
          alt="Label bitmap preview"
          style={{
            width: `${(normalizedLabel.width || 1) * pixelsPerMm * scale}px`,
            height: `${(normalizedLabel.height || 1) * pixelsPerMm * scale}px`,
            imageRendering: "auto",
            background: "#fff",
          }}
        />
      ) : (
        <LabelVisualPreview
          label={normalizedLabel as any}
          data={data}
          zoom={scale}
          printerDpi={printerDpi}
          strictFontSizing={strictFontSizing}
        />
      )}
    </div>
  );
};

export default AutoScaledLabelPreview;
