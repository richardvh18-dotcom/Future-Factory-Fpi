import React, { useRef, useState, useEffect } from 'react';
import LabelVisualPreview from './LabelVisualPreview';

/**
 * CRITICAL: moet passen bij zplHelper DPI-conversie
 * getPixelsPerMm(203) ≈ 8.0 pixels/mm voor 203 DPI printer parity
 */
const getPixelsPerMm = (printerDpi = 203) => {
  return (printerDpi || 203) / 25.4;
};

/**
 * AutoScaledLabelPreview
 * Een wrapper die de LabelVisualPreview automatisch schaalt zodat deze in de container past.
 * Gebruikt printer-DPI schaal zodat preview parity heeft met actuele print output.
 */
const AutoScaledLabelPreview = ({ label, data, className = "", maxScale = 3, printerDpi = 203 }) => {
  const containerRef = useRef(null);
  const [scale, setScale] = useState(1);
  const pixelsPerMm = getPixelsPerMm(printerDpi);

  useEffect(() => {
    if (!label || !containerRef.current) return;

    const calculateScale = () => {
      if (!containerRef.current) return;
      
      const { width } = containerRef.current.getBoundingClientRect();
      const labelWidthPx = label.width * pixelsPerMm;
      
      if (labelWidthPx === 0) return;

      // Bereken schaal om te passen
      let newScale = width / labelWidthPx;
      
      // Beperk maximale vergroting
      if (newScale > maxScale) newScale = maxScale;
      
      setScale(newScale);
    };

    // Observer voor formaatwijzigingen
    const observer = new ResizeObserver(calculateScale);
    observer.observe(containerRef.current);
    
    // Initiële berekening
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