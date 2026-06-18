import React from "react";
import PersonnelManager from "../admin/PersonnelManager";

interface TeamleaderPersonnelViewProps {
  initialViewDate?: string;
  initialTab?: string;
}

const TeamleaderPersonnelView = ({ initialViewDate, initialTab }: TeamleaderPersonnelViewProps) => {
  return (
    <div className="h-full overflow-y-auto custom-scrollbar pb-20">
      <PersonnelManager initialViewDate={initialViewDate} initialTab={initialTab ?? "personnel"} />
    </div>
  );
};

export default TeamleaderPersonnelView;