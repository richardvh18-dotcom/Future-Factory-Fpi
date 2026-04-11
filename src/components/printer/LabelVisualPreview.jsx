import React from 'react';
import { resolveLabelContent, getBarcodeUrl } from '../../utils/labelHelpers';
import InternalQrImage from '../../utils/InternalQrImage';
import { getPixelsPerMm, getPreviewTextStyle, resolvePreviewFontFamily } from '../../utils/labelPreviewMetrics';

const LabelVisualPreview = ({ label, data, zoom = 1, className = '', printerDpi = 300 }) => {
  const pixelsPerMm = getPixelsPerMm(printerDpi);

  if (!label) {
    return (
      <div className={`w-48 h-32 bg-slate-200 flex items-center justify-center text-xs text-slate-400 italic ${className}`}>
        Geen template
      </div>
    );
  }

  return (
    <div
      className={`bg-white relative overflow-hidden ${className}`}
      style={{
        width: `${label.width * pixelsPerMm * zoom}px`,
        height: `${label.height * pixelsPerMm * zoom}px`,
      }}
    >
      {label.elements?.map((el, index) => {
        const resolved = resolveLabelContent(el, data);
        const displayContent = resolved.content;
        const rotation = ((Number(el.rotation) || 0) % 360 + 360) % 360;
        const isVerticalRotation = rotation === 90 || rotation === 270;

        const baseStyle = {
          position: 'absolute',
          left: `${el.x * pixelsPerMm * zoom}px`,
          top: `${el.y * pixelsPerMm * zoom}px`,
          width: el.width ? `${el.width * pixelsPerMm * zoom}px` : 'auto',
          height: el.height ? `${el.height * pixelsPerMm * zoom}px` : 'auto',
          color: 'black',
          transform: `rotate(${rotation}deg)`,
          transformOrigin: 'top left',
          overflow: 'hidden',
          textAlign: 'left',
        };

        if (el.type === 'text') {
          const textStyle = getPreviewTextStyle(el, displayContent, zoom, rotation, pixelsPerMm);

          return (
            <div
              key={index}
              style={{
                ...baseStyle,
                width: isVerticalRotation
                  ? `${(el.height || el.width || 1) * pixelsPerMm * zoom}px`
                  : `${el.width * pixelsPerMm * zoom}px`,
                height: isVerticalRotation
                  ? `${(el.width || el.height || 1) * pixelsPerMm * zoom}px`
                  : el.height
                    ? `${el.height * pixelsPerMm * zoom}px`
                    : 'auto',
                fontSize: `${textStyle.fontSize}px`,
                lineHeight: textStyle.lineHeight,
                fontWeight: el.isBold ? '900' : 'normal',
                fontFamily: resolvePreviewFontFamily(el.fontFamily),
                textAlign: el.align || 'left',
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
                wordBreak: 'normal',
                boxSizing: 'border-box',
                backgroundColor: el.isInverse ? 'black' : 'transparent',
                color: el.isInverse ? 'white' : 'black',
              }}
            >
              {displayContent}
            </div>
          );
        }

        if (el.type === 'line') {
          return (
            <div
              key={index}
              style={{
                ...baseStyle,
                width: `${el.width * pixelsPerMm * zoom}px`,
                height: `${el.height * pixelsPerMm * zoom}px`,
                backgroundColor: 'black',
              }}
            />
          );
        }

        if (el.type === 'box') {
          return (
            <div
              key={index}
              style={{
                ...baseStyle,
                width: `${el.width * pixelsPerMm * zoom}px`,
                height: `${el.height * pixelsPerMm * zoom}px`,
                border: `${(el.thickness || 1) * pixelsPerMm * zoom}px solid black`,
                boxSizing: 'border-box',
              }}
            />
          );
        }

        if (el.type === 'image') {
          return (
            <div
              key={index}
              style={{
                ...baseStyle,
                width: `${(el.width || 20) * pixelsPerMm * zoom}px`,
                height: `${(el.height || 20) * pixelsPerMm * zoom}px`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}
            >
              {el.content ? <img src={el.content} alt="img" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : null}
            </div>
          );
        }

        if (el.type === 'qr' || el.type === 'barcode') {
          return (
            <div
              key={index}
              style={{
                ...baseStyle,
                width: `${(el.width || 30) * pixelsPerMm * zoom}px`,
                height: `${(el.height || 30) * pixelsPerMm * zoom}px`,
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {el.type === 'barcode' ? (
                <img src={getBarcodeUrl(displayContent)} alt="code" style={{ width: '80%', height: '80%', objectFit: 'contain' }} />
              ) : (
                <InternalQrImage value={displayContent} size={160} alt="code" className="w-[80%] h-[80%] object-contain" />
              )}
            </div>
          );
        }

        return null;
      })}
    </div>
  );
};

export default LabelVisualPreview;
