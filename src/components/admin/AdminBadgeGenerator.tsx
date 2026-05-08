// @ts-nocheck
import React, { useState } from 'react';
import { generateAuthQR } from '../../utils/qrAuth';
import { Printer, QrCode } from 'lucide-react';
import InternalQrImage from '../../utils/InternalQrImage.tsx';

const AdminBadgeGenerator = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [redirectPath, setRedirectPath] = useState('/planning');
  const [qrValue, setQrValue] = useState(null);

  const handleGenerate = (e) => {
    e.preventDefault();
    if(!email || !password) return;
    
    const token = generateAuthQR(email, password, redirectPath);
    setQrValue(token);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    // Haal de QR afbeelding URL op
    const qrImg = document.getElementById('qr-code-img');
    const qrSrc = qrImg ? qrImg.src : '';
    
    printWindow.document.write(`
      <html>
        <head>
          <title>Login Badge - ${email}</title>
          <style>
            body { font-family: sans-serif; text-align: center; padding: 40px; }
            .badge { 
              border: 2px solid #000; 
              padding: 20px; 
              display: inline-block; 
              border-radius: 10px; 
              min-width: 250px; 
            }
            h2 { margin: 0 0 15px 0; font-size: 18px; color: #333; }
            p { margin: 10px 0 5px 0; color: #666; font-family: monospace; font-size: 16px; }
            .footer { margin-top: 15px; font-size: 12px; color: #999; }
            svg { max-width: 150px; height: auto; }
          </style>
        </head>
        <body>
          <div class="badge">
            <h2>FPi Future Factory</h2>
            <img src="${qrSrc}" width="150" height="150" />
            <p><strong>${email}</strong></p>
            <div class="footer">Operator Login Badge</div>
          </div>
          <script>
            window.onload = () => {
              window.print();
              // Optioneel: sluit tabblad na printen
              setTimeout(() => window.close(), 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md border border-slate-200 max-w-4xl mx-auto mt-8">
      <h2 className="text-2xl font-bold mb-6 flex items-center gap-2 text-slate-800">
        <QrCode className="text-indigo-600" />
        Login Badge Generator
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <form onSubmit={handleGenerate} className="space-y-4 bg-slate-50 p-6 rounded-lg border border-slate-100">
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-700">Gebruiker Email</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-2 border rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              placeholder="operator@fpi.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-700">Wachtwoord (voor badge)</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-2 border rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              placeholder="Wachtwoord van deze user"
              required
            />
            <p className="text-xs text-slate-500 mt-2">
              ⚠️ Het wachtwoord wordt veilig versleuteld in de QR code opgeslagen.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-slate-700">Startpagina na scan</label>
            <input 
              type="text" 
              value={redirectPath}
              onChange={(e) => setRedirectPath(e.target.value)}
              className="w-full p-2 border rounded focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              placeholder="bijv. /planning of specifieke route"
            />
            <p className="text-xs text-slate-500 mt-2">
              Hiermee stuur je de operator direct naar het juiste scherm na het scannen.
            </p>
          </div>
          <button 
            type="submit"
            className="w-full bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 transition-colors font-medium mt-2"
          >
            Genereer QR Badge
          </button>
        </form>

        <div className="flex flex-col items-center justify-center p-6 bg-white rounded-lg border border-slate-200 min-h-[300px]">
          {qrValue ? (
            <>
              <div id="qr-code-svg-container" className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                <InternalQrImage id="qr-code-img" value={qrValue} size={360} alt="Login QR" className="w-44 h-44" />
              </div>
              <p className="mt-4 font-mono text-sm text-slate-600">{email}</p>
              <button 
                onClick={handlePrint}
                className="mt-6 flex items-center gap-2 bg-slate-800 text-white px-6 py-2 rounded-full hover:bg-slate-700 transition-colors"
              >
                <Printer size={18} /> Print Badge
              </button>
            </>
          ) : (
            <div className="text-center text-slate-400">
              <QrCode size={48} className="mx-auto mb-2 opacity-20" />
              <p>Vul de gegevens in om een<br/>badge te genereren</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminBadgeGenerator;