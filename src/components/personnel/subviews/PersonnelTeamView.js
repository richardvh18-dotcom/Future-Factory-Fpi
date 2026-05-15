import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React from "react";
const PersonnelTeamView = React.memo(({ personnel, departments }) => {
    return (_jsxs("div", { children: [_jsx("h3", { className: "font-bold mb-2", children: "Teamindeling" }), departments.map((dept) => (_jsxs("div", { className: "mb-4", children: [_jsx("h4", { className: "font-semibold text-slate-700", children: dept.name }), _jsx("ul", { className: "ml-4 list-disc", children: personnel.filter((person) => person.departmentId === dept.id).map((person) => (_jsx("li", { children: person.name }, person.id))) })] }, dept.id)))] }));
});
export default PersonnelTeamView;
