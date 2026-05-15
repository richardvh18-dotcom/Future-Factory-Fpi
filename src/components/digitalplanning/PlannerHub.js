import { jsx as _jsx } from "react/jsx-runtime";
import TeamleaderHub from "./TeamleaderHub";
import { useTranslation } from "react-i18next";
const TypedTeamleaderHub = TeamleaderHub;
const PlannerHub = ({ onBack, onExit }) => {
    const { t } = useTranslation();
    return (_jsx(TypedTeamleaderHub, { fixedScope: "all", onBack: onBack, onExit: onExit, title: t('planner.title', "Central Planner"), departmentName: t('planner.overview', "Productie Overzicht") }));
};
export default PlannerHub;
