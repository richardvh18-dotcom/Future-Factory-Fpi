import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
const PersonnelScheduleView = React.memo(({ personnel, viewDate }) => {
    return (_jsxs("div", { children: [_jsx("h3", { className: "font-bold mb-2", children: "Rooster Overzicht" }), _jsx("ul", { className: "list-disc ml-4", children: personnel.map((person) => (_jsxs("li", { children: [person.name, " - Shift: ", person.shiftId || "-", " (", viewDate.toLocaleDateString(), ")"] }, person.id))) })] }));
});
export default PersonnelScheduleView;
