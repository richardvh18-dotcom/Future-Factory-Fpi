import { jsx as _jsx } from "react/jsx-runtime";
import PersonnelManager from "../admin/PersonnelManager";
const TeamleaderPersonnelView = ({ initialViewDate, initialTab }) => {
    return (_jsx("div", { className: "h-full overflow-y-auto custom-scrollbar pb-20", children: _jsx(PersonnelManager, { initialViewDate: initialViewDate, initialTab: initialTab ?? "personnel" }) }));
};
export default TeamleaderPersonnelView;
