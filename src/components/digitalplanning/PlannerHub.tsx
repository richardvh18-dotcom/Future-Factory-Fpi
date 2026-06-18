import React from "react";
import TeamleaderHub from "./TeamleaderHub";
import { useTranslation } from "react-i18next";

interface PlannerHubProps {
  onBack?: () => void;
  onExit?: () => void;
}

const TypedTeamleaderHub = TeamleaderHub as React.ComponentType<{
  fixedScope?: string;
  onBack?: () => void;
  onExit?: () => void;
  title?: string;
  departmentName?: string;
}>;

const PlannerHub = ({ onBack, onExit }: PlannerHubProps) => {
  const { t } = useTranslation();
  return (
    <TypedTeamleaderHub
      fixedScope="all"
      onBack={onBack}
      onExit={onExit}
      title={t('planner.title', "Central Planner")}
      departmentName={t('planner.overview', "Productie Overzicht")}
    />
  );
};

export default PlannerHub;