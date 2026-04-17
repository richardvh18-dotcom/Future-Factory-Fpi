import React from "react";
import CapacityPlanningView from "../planning/CapacityPlanningView";

const TeamleaderEfficiencyView = ({ departmentName, lockDepartment = true }) => {
  return (
    <div className="h-full overflow-y-auto custom-scrollbar pb-20">
      <CapacityPlanningView 
        initialDepartment={departmentName === "Algemeen" ? "Fitting Productions" : departmentName} 
        lockDepartment={lockDepartment}
      />
    </div>
  );
};

export default TeamleaderEfficiencyView;
