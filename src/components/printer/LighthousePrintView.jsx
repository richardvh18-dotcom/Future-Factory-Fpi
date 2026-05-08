import React, { useRef, useState } from "react";
import { X, Printer, Loader2 } from "lucide-react";
import {
  resolveLabelContent,
  getBarcodeUrl,
} from "../../utils/labelHelpers";
import InternalQrImage from "../../utils/InternalQrImage.tsx";
import { useNotifications } from '../../contexts/NotificationContext';

/**
 * LighthousePrintView
 * Speciale print-view voor de Lighthouse CJ-PRO II (via Windows Driver).
 * Genereert een pixel-perfect HTML/CSS label en print via de browser dialoog.
 */
const LighthousePrintView = ({ label, data, onClose }) => {
  const { notify } = useNotifications();
  const [printing, setPrinting] = useState(false);
  const previewRef = useRef(null);

  const handlePrint = () => {
    setPrinting(true);

    const printWindow = window.open("", "_blank", "width=800,height=600");

    if (!printWindow) {
      notify("Popup geblokkeerd. Sta popups toe om te kunnen printen.");
      setPrinting(false);
      return;
    }

    // Haal de innerHTML op van de preview om exact te printen wat we zien
    const content = previewRef.current.innerHTML;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Print Label - ${label.name}</title>
          <style>
            @page {
              size: ${label.width}mm ${label.height}mm;
              margin: 0;
            }
            body {
              margin: 0;
              padding: 0;
              width: ${label.width}mm;
              height: ${label.height}mm;
              overflow: hidden;
              background: white;
            }
            .label-canvas {
              position: relative;
              width: 100%;
              height: 100%;
            }
            /* Kopieer essentiële styles voor positionering */
            div {
              position: absolute;
              box-sizing: border-box;
              transform-origin: top left;
              overflow: hidden;
            }
            img {
              display: block;
              width: 100%;
              height: 100%;
              object-fit: contain;
            }
          </style>
        </head>
        <body>
          <div class="label-canvas">
            ${content}
          </div>
          <script>
            window.onload = function() {
              window.print();
              // Sluit venster automatisch na printen (of annuleren)
              // setTimeout zodat print dialoog tijd heeft om te openen
              setTimeout(function() { window.close(); }, 1000);
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    setPrinting(false);
  };

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h3 className="text-lg font-black text-slate-800 uppercase italic">
              Lighthouse Print
            </h3>
            <p className="text-xs text-slate-500 font-bold">
              Windows Driver Mode • {label.width}x{label.height}mm
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-200 rounded-full transition-colors"
          >
            <X size={20} className="text-slate-500" />
          </button>
        </div>

        <div className="p-8 flex justify-center bg-slate-100">
          <div
            style={{
              width: `${label.width}mm`,
              height: `${label.height}mm`,
              position: "relative",
              background: "white",
              boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
            }}
            ref={previewRef}
          >
            {label.elements?.map((el, idx) => {
              const { content } = resolveLabelContent(el, data);
              const style = {
                left: `${el.x}mm`,
                top: `${el.y}mm`,
                width: el.width ? `${el.width}mm` : "auto",
                height: el.height ? `${el.height}mm` : "auto",
                fontSize: `${el.fontSize}px`, // Scherm px benadering, print gebruikt styles
                fontFamily: el.fontFamily || "Arial, sans-serif",
                fontWeight: el.isBold ? "bold" : "normal",
                transform: `rotate(${el.rotation || 0}deg)`,
                textAlign: el.align || "left",
                border: el.type === "box" ? `${el.thickness || 1}px solid black` : "none",
                backgroundColor: el.type === "line" ? "black" : "transparent",
              };

              if (el.type === "line" || el.type === "box") return <div key={idx} style={style} />;
              if (el.type === "image" && el.content) return <div key={idx} style={style}><img src={el.content} alt="" /></div>;
              if (el.type === "barcode") return <div key={idx} style={style}><img src={getBarcodeUrl(content)} alt="BC" /></div>;
              if (el.type === "qr") return <div key={idx} style={style}><InternalQrImage value={content} size={220} alt="QR" className="w-full h-full object-contain" /></div>;

              return <div key={idx} style={style}>{content}</div>;
            })}
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-xl">Annuleren</button>
          <button onClick={handlePrint} disabled={printing} className="flex-[2] py-3 bg-blue-600 text-white rounded-xl font-black uppercase text-xs tracking-widest hover:bg-blue-700 transition-all shadow-lg flex items-center justify-center gap-2">
            {printing ? <Loader2 className="animate-spin" size={16} /> : <Printer size={16} />}
            Afdrukken
          </button>
        </div>
      </div>
    </div>
  );
};

export default LighthousePrintView;