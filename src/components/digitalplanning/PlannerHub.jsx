import React from "react";
import TeamleaderHub from "./TeamleaderHub";
import { useTranslation } from "react-i18next";

/**
 * PlannerHub
 * * Dit is het hoofdscherm voor de rol 'Planner' of 'Productieleider'.
 * Functionaliteit:
 * - Toont KPI's van de HELE fabriek (Fittings + Pipes + Spools).
 * - Geeft toegang tot alle machines in het dashboard.
 * - Bevat functionaliteit voor uploaden en prioriteren.
 * * Deze component kan direct aan een route gekoppeld worden (bijv. /planner).
 */
const PlannerHub = ({ onBack, onExit, onEnterWorkstation }) => {
  const { t } = useTranslation();
  return (
    <TeamleaderHub
      // fixedScope={null} zorgt ervoor dat de TeamleaderHub in 'Global Mode' draait
      // en dus data van alle afdelingen (Fittings, Pipes, Spools) ophaalt en toont.
      fixedScope="all"
      onBack={onBack}
      onExit={onExit}
      // Als de planner op een machine-tegel klikt, geven we dit door naar boven
      // zodat er genavigeerd kan worden naar de specifieke machine-view.
      onEnterWorkstation={onEnterWorkstation}
      title={t('planner.title', "Central Planner")}
      departmentName={t('planner.overview', "Productie Overzicht")}
    />
  );
};

export default PlannerHub;
