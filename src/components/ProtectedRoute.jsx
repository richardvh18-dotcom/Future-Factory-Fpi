import React from "react";
import { Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAdminAuth } from "../hooks/useAdminAuth";
import { Loader2, ShieldAlert } from "lucide-react";

const ProtectedRoute = ({ children }) => {
  const { t } = useTranslation();
  const { user, role, loading, isAdmin } = useAdminAuth();

  // 1. WACHTEN: Zolang we laden, toon een spinner.
  // Dit voorkomt dat je wordt weggestuurd voordat we weten wie je bent.
  if (loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-slate-50 text-blue-600">
        <Loader2 className="animate-spin mb-4" size={48} />
        <p className="font-bold text-sm uppercase tracking-widest">
          {t('auth.checking_rights')}
        </p>
      </div>
    );
  }

  // 2. CHECK LOGIN: Geen user? Naar login.
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // 3. CHECK ROL: Geen admin? Toon Access Denied scherm.
  // We gebruiken hier een expliciete check.
  if (!isAdmin && role !== "admin") {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-red-50 text-red-600 p-8 text-center">
        <ShieldAlert size={64} className="mb-6" />
        <h1 className="text-3xl font-black uppercase italic mb-2">
          {t('auth.access_denied')}
        </h1>
        <p className="font-medium mb-8 max-w-md">
          {t('auth.no_admin_rights', { email: user.email })}
        </p>
        <div className="bg-white p-4 rounded-xl border border-red-200 text-left text-xs font-mono text-slate-600 mb-8">
          {t('auth.detected_role', { role: role || t('common.none') })}
        </div>
        <a
          href="/portal"
          className="px-8 py-3 bg-red-600 text-white rounded-xl font-bold uppercase tracking-widest shadow-lg hover:bg-red-700 transition-all"
        >
          {t('auth.back_to_portal')}
        </a>
      </div>
    );
  }

  // 4. TOEGANG: Render de admin pagina's
  return children;
};

export default ProtectedRoute;
