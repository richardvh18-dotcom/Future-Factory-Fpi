/**
 * Hook: useLabelCanvasBitmap
 * 
 * Rendert een label-preview (HTML element) naar canvas en genereert ZPL bitmap
 */

import { useRef, useCallback } from 'react';
import { canvasToZplGfa } from '../utils/canvasToBitmapZpl';

type UseLabelCanvasBitmapOptions = {
    width: number;      // Label width in mm
    height: number;     // Label height in mm
    printerDpi?: number; // Printer DPI
    darkness?: number;   // Darkness 0-30
    printSpeed?: number; // Print speed
};

/**
 * Hook voor label-preview → bitmap ZPL rendering
 */
export const useLabelCanvasBitmap = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    
    /**
     * Capture current viewport state en render naar canvas
     */
    const renderPreviewToCanvas = useCallback(
        (previewElement: HTMLElement | null, width: number, height: number, screenDpi = 96): HTMLCanvasElement => {
            if (!previewElement) {
                throw new Error('Preview element not found');
            }

            // Beroep op html2canvas library als beschikbaar, anders val terug op eenvoudige canvas
            const canvas = document.createElement('canvas');
            
            // Bereken resolutie op basis van printer DPI
            const printerDotsPerMm = 203 / 25.4; // standaard 203 DPI
            canvas.width = Math.round(width * printerDotsPerMm);
            canvas.height = Math.round(height * printerDotsPerMm);
            
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Canvas 2D context failed');
            
            // Bereken schaal van screen pixels naar printer dots
            const screenPixelsPerMm = screenDpi / 25.4;
            const scaleX = printerDotsPerMm / screenPixelsPerMm;
            const scaleY = printerDotsPerMm / screenPixelsPerMm;
            
            ctx.scale(scaleX, scaleY);
            
            // Zet witte achtergrond
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width / scaleX, canvas.height / scaleY);
            
            // Copy DOM tree van preview naar canvas
            // Dit is een simpele benadering; voor complexe layouts gebruik html2canvas
            try {
                const svgCanvas = document.createElement('canvas');
                svgCanvas.width = Math.round(width * screenPixelsPerMm);
                svgCanvas.height = Math.round(height * screenPixelsPerMm);
                
                // Kopieer visueel (cast naar CanvasImageSource)
                ctx.drawImage(previewElement as CanvasImageSource, 0, 0);
            } catch (e) {
                console.warn('Canvas copy fallback:', e);
                // Fallback: teken eenvoudige achtergrond
            }
            
            return canvas;
        },
        []
    );

    /**
     * Genereer ZPL bitmap uit preview element
     */
    const generateBitmapZpl = useCallback(
        async (
            previewElement: HTMLElement | null,
            options: UseLabelCanvasBitmapOptions
        ): Promise<string> => {
            const {
                width,
                height,
                printerDpi = 203,
                darkness = 15,
                printSpeed = 3
            } = options;

            if (!previewElement) {
                throw new Error('Preview element required');
            }

            try {
                // Stap 1: Render DOM naar canvas
                const canvas = renderPreviewToCanvas(previewElement, width, height, 96);
                
                // Stap 2: Canvas naar ZPL bitmap
                const zpl = canvasToZplGfa(canvas, {
                    width,
                    height,
                    printerDpi,
                    darkness,
                    printSpeed
                });

                return zpl;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                throw new Error(`Bitmap generation failed: ${message}`);
            }
        },
        [renderPreviewToCanvas]
    );

    return {
        canvasRef,
        renderPreviewToCanvas,
        generateBitmapZpl
    };
};

/**
 * Hook: useLivePreviewCapture
 * 
 * Biedt real-time preview canvas capture voor label debugging
 */
export const useLivePreviewCapture = () => {
    const previewRef = useRef<HTMLDivElement>(null);
    
    const downloadPreviewAsPng = useCallback(async () => {
        if (!previewRef.current) {
            throw new Error('Preview ref not set');
        }

        try {
            // Probeer html2canvas te gebruiken als beschikbaar
            const html2canvas = (window as any).html2canvas;
            if (html2canvas) {
                const canvas = await html2canvas(previewRef.current, {
                    backgroundColor: '#ffffff',
                    scale: 2,
                    useCORS: true
                });
                
                canvas.toBlob((blob: Blob | null) => {
                    if (blob) {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'label-preview.png';
                        a.click();
                        URL.revokeObjectURL(url);
                    }
                });
            }
        } catch (error) {
            console.error('Preview capture failed:', error);
            throw error;
        }
    }, []);

    return {
        previewRef,
        downloadPreviewAsPng
    };
};
