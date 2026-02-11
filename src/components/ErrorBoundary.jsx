import React from 'react';
import { AlertTriangle, RefreshCw, Send, CheckCircle2, Loader2 } from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { PATHS } from '../config/dbPaths';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null,
      reportStatus: 'idle' // 'idle' | 'sending' | 'success' | 'error'
    };
  }

  static getDerivedStateFromError(error) {
    // Update state zodat de volgende render de fallback UI toont
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Je kunt de fout hier ook loggen naar een externe service
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  handleReportToAdmins = async () => {
    if (this.state.reportStatus === 'sending' || this.state.reportStatus === 'success') return;

    this.setState({ reportStatus: 'sending' });

    try {
      // We gaan ervan uit dat PATHS.MESSAGES bestaat, vergelijkbaar met andere modules
      // Zo niet, pas dit aan naar de juiste collectie naam string, bijv: collection(db, "messages")
      const messagesRef = collection(db, ...PATHS.MESSAGES);

      // Verzamel gebruikers- en browserinformatie
      const currentUser = auth.currentUser;
      const userInfo = currentUser 
        ? `${currentUser.displayName || 'Naamloos'} (${currentUser.email}) [UID: ${currentUser.uid}]` 
        : 'Niet ingelogd / Anoniem';

      const browserInfo = [
        `User Agent: ${navigator.userAgent}`,
        `Scherm: ${window.screen.width}x${window.screen.height}`,
        `Window: ${window.innerWidth}x${window.innerHeight}`,
        `Taal: ${navigator.language}`
      ].join('\n');

      await addDoc(messagesRef, {
        type: 'SYSTEM_ERROR',
        title: '🔥 CRASH RAPPORT: ' + (this.state.error?.message || 'Onbekende fout'),
        content: `Er is een kritieke fout opgetreden in de applicatie.\n\n--- GEBRUIKERS INFO ---\nGebruiker: ${userInfo}\n\n--- BROWSER INFO ---\n${browserInfo}\n\n--- TECHNISCHE DETAILS ---\nFoutmelding:\n${this.state.error?.toString()}\n\nStack Trace:\n${this.state.errorInfo?.componentStack || 'Niet beschikbaar'}`,
        targetGroup: 'admins', // Specifiek voor jouw admin groep logica
        priority: 'high',
        read: false,
        archived: false,
        timestamp: serverTimestamp(),
        sender: 'System Error Boundary',
        url: window.location.href
      });

      this.setState({ reportStatus: 'success' });
    } catch (err) {
      console.error("Kon foutrapport niet verzenden:", err);
      this.setState({ reportStatus: 'error' });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6 text-center">
          <div className="bg-white p-8 rounded-3xl shadow-xl max-w-lg w-full border border-red-100 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-red-500"></div>
            
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle size={32} />
            </div>

            <h1 className="text-2xl font-black text-slate-900 mb-2 uppercase italic">Systeem Crash</h1>
            <p className="text-slate-500 mb-8 text-sm font-medium">
              De applicatie is tegen een onverwachte fout aangelopen en moest worden gestopt om gegevensverlies te voorkomen.
            </p>

            {/* Error Box */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6 text-left overflow-hidden">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Technische Foutmelding</p>
              <code className="text-red-600 font-mono text-xs block break-words">
                {this.state.error && this.state.error.toString()} 
              </code>
            </div>

            <div className="flex flex-col gap-3">
              <button
                onClick={() => window.location.reload()}
                className="w-full py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-bold uppercase text-xs tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20"
              >
                <RefreshCw size={16} /> Pagina Herladen
              </button>

              <button
                onClick={this.handleReportToAdmins}
                disabled={this.state.reportStatus !== 'idle' && this.state.reportStatus !== 'error'}
                className={`w-full py-3 rounded-xl font-bold uppercase text-xs tracking-widest flex items-center justify-center gap-2 border-2 transition-all ${
                  this.state.reportStatus === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-600 cursor-default'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                }`}
              >
                {this.state.reportStatus === 'idle' && (
                  <>
                    <Send size={16} /> Rapporteer aan Admins
                  </>
                )}
                {this.state.reportStatus === 'sending' && (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Verzenden...
                  </>
                )}
                {this.state.reportStatus === 'success' && (
                  <>
                    <CheckCircle2 size={16} /> Rapport Verzonden
                  </>
                )}
                {this.state.reportStatus === 'error' && (
                  <>
                    <AlertTriangle size={16} /> Mislukt - Probeer opnieuw
                  </>
                )}
              </button>
            </div>

            {this.state.error && process.env.NODE_ENV === 'development' && (
              <div className="mt-6 text-left">
                <details className="text-xs text-slate-400 cursor-pointer">
                  <summary>Toon Stack Trace (Dev Only)</summary>
                  <pre className="mt-2 p-4 bg-slate-900 text-red-400 rounded-xl overflow-auto max-h-48 font-mono text-[10px]">
                    {this.state.errorInfo?.componentStack}
                  </pre>
                </details>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
