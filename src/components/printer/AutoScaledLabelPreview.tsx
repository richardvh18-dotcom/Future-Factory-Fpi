import React, { useRef, useState, useEffect } from "react";
import LabelVisualPreview from "./LabelVisualPreview";

const getPixelsPerMm = (printerDpi = 203) => {
  return (printerDpi || 203) / 25.4;
};

interface LabelDefinition {
  width?: number;
  [key: string]: unknown;
}

interface AutoScaledLabelPreviewProps {
  label?: LabelDefinition | null;
  data?: Record<string, unknown>;
  className?: string;
  maxScale?: number;
  printerDpi?: number;
}

const AutoScaledLabelPreview = ({
  label,
  data,
  className = "",
  maxScale = 3,
  printerDpi = 203,
}: AutoScaledLabelPreviewProps) => {
  const containerRef = useRef(null);
  const [scale, setScale] = useState(1);
  const pixelsPerMm = getPixelsPerMm(printerDpi);

  useEffect(() => {
    if (!label || !containerRef.current) return;

    const calculateScale = () => {
      if (!containerRef.current) return;

      const currentContainer = containerRef.current as { getBoundingClientRect: () => { width: number } };
      const { width } = currentContainer.getBoundingClientRect();
      const labelWidthPx = (label.width || 0) * pixelsPerMm;

      if (labelWidthPx === 0) return;

      let newScale = width / labelWidthPx;
      if (newScale > maxScale) newScale = maxScale;

      setScale(newScale);
    };

    const observer = new ResizeObserver(calculateScale);
    observer.observe(containerRef.current as never);
    calculateScale();

    return () => observer.disconnect();
  }, [label, maxScale, pixelsPerMm]);

  if (!label) return null;

  return (
    <div ref={containerRef} className={`w-full flex justify-center items-center overflow-hidden ${className}`}>
      <LabelVisualPreview label={label} data={data} zoom={scale} printerDpi={printerDpi} />
    </div>
  );
};

export default AutoScaledLabelPreview;
