import { jsx as _jsx } from "react/jsx-runtime";
import { auth } from "../../config/firebase";
/**
 * DatabaseSetup V3.0 - Future Factory Root Edition
 * Schrijft de initiële systeemdata naar de nieuwe beveiligde root: /future-factory/
 */
const DatabaseSetup = () => {
    const location = window.location;
    const isAuthenticated = auth.currentUser && !location.pathname.includes("/login");
    if (!isAuthenticated)
        return null;
    return (_jsx("div", { className: "min-h-screen bg-slate-950 flex items-center justify-center p-6 text-white font-sans", children: _jsx("div", { className: "max-w-2xl w-full bg-white/5 border border-white/10 rounded-[50px] p-10 backdrop-blur-xl relative shadow-2xl" }) }));
};
export default DatabaseSetup;
