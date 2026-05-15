import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import React from 'react';
import { withTranslation } from 'react-i18next';
import { AlertTriangle, RefreshCw, Send, CheckCircle2, Loader2, Copy, Check } from 'lucide-react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth, logActivity } from '../config/firebase';
import { PATHS } from '../config/dbPaths';
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
            reportStatus: 'idle',
            copied: false,
        };
    }
    handleCopyStack = () => {
        const fullError = `Message: ${this.state.error?.message}\n\nStack:\n${this.state.error?.stack}\n\nComponent Stack:\n${this.state.errorInfo?.componentStack}`;
        navigator.clipboard.writeText(fullError).then(() => {
            this.setState({ copied: true });
            setTimeout(() => this.setState({ copied: false }), 2000);
        }).catch((err) => {
            console.error('Copy failed', err);
        });
    };
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    componentDidCatch(error, errorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ error, errorInfo });
    }
    handleReportToAdmins = async () => {
        if (this.state.reportStatus === 'sending' || this.state.reportStatus === 'success')
            return;
        this.setState({ reportStatus: 'sending' });
        try {
            const messagesRef = collection(db, ...PATHS.MESSAGES);
            const currentUser = auth.currentUser;
            const errorData = {
                message: this.state.error?.message || 'Onbekende fout',
                stack: this.state.error?.stack || 'Geen stacktrace beschikbaar',
                componentStack: this.state.errorInfo?.componentStack || 'Geen component info',
            };
            await addDoc(messagesRef, {
                type: 'SYSTEM_ERROR',
                subject: `🔥 CRASH: ${errorData.message.substring(0, 40)}...`,
                content: `KRITIEKE SYSTEEMFOUT\n\nGebruiker: ${currentUser?.displayName || 'Anoniem'} (${currentUser?.email || 'Geen email'})\nLocatie: ${window.location.href}\n\nFoutmelding:\n${errorData.message}`,
                to: 'admin',
                priority: 'high',
                read: false,
                archived: false,
                timestamp: serverTimestamp(),
                senderId: 'system_crash_reporter',
                senderName: 'System Crash Reporter',
                data: errorData,
            });
            await logActivity(auth.currentUser?.uid || 'system', 'ERROR_REPORT_SEND', `Crashrapport verstuurd: ${errorData.message.substring(0, 80)}`);
            this.setState({ reportStatus: 'success' });
            setTimeout(() => {
                window.location.href = '/portal';
            }, 1500);
        }
        catch (err) {
            console.error("Kon foutrapport niet verzenden:", err);
            this.setState({ reportStatus: 'error' });
        }
    };
    render() {
        const { t } = this.props;
        if (this.state.hasError) {
            return (_jsx("div", { className: "flex flex-col items-center justify-center min-h-screen bg-gray-50 p-6 text-center", children: _jsxs("div", { className: "bg-white p-8 rounded-3xl shadow-xl max-w-lg w-full border border-red-100 relative overflow-hidden", children: [_jsx("div", { className: "absolute top-0 left-0 w-full h-2 bg-red-500" }), _jsx("div", { className: "w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6", children: _jsx(AlertTriangle, { size: 32 }) }), _jsx("h1", { className: "text-2xl font-black text-slate-900 mb-2 uppercase italic", children: t('errorBoundary.title', 'Systeem Crash') }), _jsx("p", { className: "text-slate-500 mb-8 text-sm font-medium", children: t('errorBoundary.subtitle', 'De applicatie is tegen een onverwachte fout aangelopen en moest worden gestopt om gegevensverlies te voorkomen.') }), _jsxs("div", { className: "bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6 text-left overflow-hidden", children: [_jsx("p", { className: "text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1", children: t('errorBoundary.technical', 'Technische Foutmelding') }), _jsx("code", { className: "text-red-600 font-mono text-xs block break-words", children: this.state.error && this.state.error.toString() })] }), _jsxs("div", { className: "flex flex-col gap-3", children: [_jsxs("button", { onClick: () => window.location.reload(), className: "w-full py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-bold uppercase text-xs tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20", children: [_jsx(RefreshCw, { size: 16 }), " ", t('errorBoundary.reload', 'Pagina Herladen')] }), _jsxs("button", { onClick: this.handleReportToAdmins, disabled: this.state.reportStatus !== 'idle' && this.state.reportStatus !== 'error', className: `w-full py-3 rounded-xl font-bold uppercase text-xs tracking-widest flex items-center justify-center gap-2 border-2 transition-all ${this.state.reportStatus === 'success'
                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-600 cursor-default'
                                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'}`, children: [this.state.reportStatus === 'idle' && (_jsxs(_Fragment, { children: [_jsx(Send, { size: 16 }), " ", t('errorBoundary.report', 'Rapporteer aan Admins')] })), this.state.reportStatus === 'sending' && (_jsxs(_Fragment, { children: [_jsx(Loader2, { size: 16, className: "animate-spin" }), " ", t('errorBoundary.sending', 'Verzenden...')] })), this.state.reportStatus === 'success' && (_jsxs(_Fragment, { children: [_jsx(CheckCircle2, { size: 16 }), " ", t('errorBoundary.sent', 'Rapport Verzonden')] })), this.state.reportStatus === 'error' && (_jsxs(_Fragment, { children: [_jsx(AlertTriangle, { size: 16 }), " ", t('errorBoundary.failed', 'Mislukt - Probeer opnieuw')] }))] })] }), this.state.error && import.meta.env.DEV && (_jsx("div", { className: "mt-6 text-left", children: _jsxs("details", { className: "text-xs text-slate-400 group", children: [_jsxs("summary", { className: "cursor-pointer flex items-center justify-between", children: [_jsx("span", { children: t('errorBoundary.stacktrace', 'Toon Stack Trace (Dev Only)') }), _jsx("button", { onClick: (e) => { e.preventDefault(); e.stopPropagation(); this.handleCopyStack(); }, className: "ml-2 p-1 hover:bg-slate-100 rounded-md transition-colors flex items-center gap-1 text-[10px] font-bold text-blue-600", children: this.state.copied ? (_jsxs(_Fragment, { children: [_jsx(Check, { size: 12 }), " ", t('common.copied', 'Gekopieerd')] })) : (_jsxs(_Fragment, { children: [_jsx(Copy, { size: 12 }), " ", t('common.copy', 'Kopieer Stack')] })) })] }), _jsx("pre", { className: "mt-2 p-4 bg-slate-900 text-red-400 rounded-xl overflow-auto max-h-48 font-mono text-[10px]", children: this.state.errorInfo?.componentStack })] }) }))] }) }));
        }
        return _jsx(_Fragment, { children: this.props.children });
    }
}
export default withTranslation()(ErrorBoundary);
