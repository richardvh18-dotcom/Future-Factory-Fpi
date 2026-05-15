import { jsx as _jsx } from "react/jsx-runtime";
import CapacityPlanningView from "../planning/CapacityPlanningView";
const TeamleaderEfficiencyView = ({ departmentName, lockDepartment = true, }) => {
    const handleNavigate = () => { };
    return (_jsx("div", { className: "h-full overflow-y-auto custom-scrollbar pb-20", children: _jsx(CapacityPlanningView, { initialDepartment: departmentName === "Algemeen" ? "Fitting Productions" : departmentName, lockDepartment: lockDepartment, onNavigate: handleNavigate }) }));
};
export default TeamleaderEfficiencyView;
