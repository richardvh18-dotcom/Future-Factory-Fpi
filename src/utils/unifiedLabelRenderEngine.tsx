import React from 'react';
import { createRoot } from 'react-dom/client';
import LabelVisualPreview from '../components/printer/LabelVisualPreview';
import { captureElementAsCanvas, generateBitmapPrintData } from './zplHelper';

type AnyRecord = Record<string, unknown>;

type UnifiedLabelTemplate = {
  width?: number;
  height?: number;
  [key: string]: unknown;
};

type RenderLabelToBitmapZplArgs = {
  template: UnifiedLabelTemplate;
  data: AnyRecord;
  printerDpi: number;
  darkness?: number;
  printSpeed?: number;
  strictFontSizing?: boolean;
  textScaleFactor?: number;
  widthMm?: number;
  heightMm?: number;
};

export const renderLabelToBitmapZpl = async ({
  template,
  data,
  printerDpi,
  darkness = 15,
  printSpeed = 3,
  strictFontSizing = false,
  textScaleFactor = 1.6,
  widthMm,
  heightMm,
}: RenderLabelToBitmapZplArgs): Promise<string> => {
  let host: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  const finalWidthMm = Number(widthMm || template?.width || 90);
  const finalHeightMm = Number(heightMm || template?.height || 40);
  const dotsPerMm = Number(printerDpi || 203) / 25.4;
  const widthPx = Math.max(1, Math.round(finalWidthMm * dotsPerMm));
  const heightPx = Math.max(1, Math.round(finalHeightMm * dotsPerMm));
  // Render op 4× schaal zodat letterstrepen voldoende pixels dik zijn (4-6px).
  // captureElementAsCanvas schaalt terug naar printerresolutie → correct lettertypegewicht.
  const renderZoom = 4;

  try {
    host = document.createElement('div');
    host.style.position = 'fixed';
    host.style.left = '-100000px';
    host.style.top = '0';
    host.style.width = `${widthPx * renderZoom}px`;
    host.style.height = `${heightPx * renderZoom}px`;
    host.style.background = '#ffffff';
    host.style.zIndex = '-1';
    document.body.appendChild(host);

    root = createRoot(host);
    await new Promise<void>((resolve) => {
      root!.render(
        <LabelVisualPreview
          label={template as any}
          data={data}
          zoom={renderZoom}
          printerDpi={printerDpi}
          className=""
          strictFontSizing={strictFontSizing}
          textScaleFactor={textScaleFactor}
        />
      );
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });

    const canvas = await captureElementAsCanvas(host, finalWidthMm, finalHeightMm, printerDpi);
    const zplRaw = await generateBitmapPrintData(canvas, finalWidthMm, finalHeightMm, printerDpi, darkness, printSpeed);
    const zpl = String(zplRaw || '').replace(/^\^XA/, '^XA\n^FXBITMAP_V3_TS160^FS');

    if (!/\^GFA,/i.test(String(zpl || ''))) {
      throw new Error('Bitmap payload ongeldig: ^GFA ontbreekt.');
    }

    return zpl;
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
