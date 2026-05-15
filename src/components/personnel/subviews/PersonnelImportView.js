import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
const PersonnelImportView = React.memo(({ onImport }) => {
    return (_jsxs("div", { children: [_jsx("h3", { className: "font-bold mb-2", children: "Personeel Importeren" }), _jsx("button", { className: "bg-blue-600 text-white px-4 py-2 rounded", onClick: onImport, children: "Importeer CSV" })] }));
});
export default PersonnelImportView;
