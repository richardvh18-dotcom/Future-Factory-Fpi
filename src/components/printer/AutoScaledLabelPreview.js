import { jsx as _jsx } from "react/jsx-runtime";
import { useRef, useState, useEffect } from "react";
import LabelVisualPreview from "./LabelVisualPreview";
const getPixelsPerMm = (printerDpi = 203) => {
    return (printerDpi || 203) / 25.4;
};
const AutoScaledLabelPreview = ({ label, data, className = "", maxScale = 3, printerDpi = 203, }) => {
    const containerRef = useRef(null);
    const [scale, setScale] = useState(1);
    const pixelsPerMm = getPixelsPerMm(printerDpi);
    useEffect(() => {
        if (!label || !containerRef.current)
            return;
        const calculateScale = () => {
            if (!containerRef.current)
                return;
            const currentContainer = containerRef.current;
            const { width } = currentContainer.getBoundingClientRect();
            const labelWidthPx = (label.width || 0) * pixelsPerMm;
            if (labelWidthPx === 0)
                return;
            let newScale = width / labelWidthPx;
            if (newScale > maxScale)
                newScale = maxScale;
            setScale(newScale);
        };
        const observer = new ResizeObserver(calculateScale);
        observer.observe(containerRef.current);
        calculateScale();
        return () => observer.disconnect();
    }, [label, maxScale, pixelsPerMm]);
    if (!label)
        return null;
    return (_jsx("div", { ref: containerRef, className: `w-full flex justify-center items-center overflow-hidden ${className}`, children: _jsx(LabelVisualPreview, { label: label, data: data, zoom: scale, printerDpi: printerDpi }) }));
};
export default AutoScaledLabelPreview;
