import React from "react";
import CapacityPlanningView from "../planning/CapacityPlanningView";

interface TeamleaderEfficiencyViewProps {
  departmentName?: string;
  lockDepartment?: boolean;
}

const TeamleaderEfficiencyView = ({
  departmentName,
  lockDepartment = true,
}: TeamleaderEfficiencyViewProps) => {
  const handleNavigate = () => {};

  return (
    <div className="h-full overflow-y-auto custom-scrollbar pb-20">
      <CapacityPlanningView
        initialDepartment={departmentName === "Algemeen" ? "Fitting Productions" : departmentName}
        lockDepartment={lockDepartment}
        onNavigate={handleNavigate}
      />
    </div>
  );
};

export default TeamleaderEfficiencyView;