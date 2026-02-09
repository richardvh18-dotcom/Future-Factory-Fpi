import React from "react";
import PersonnelManager from "../admin/PersonnelManager";

const TeamleaderPersonnelView = ({ user, fixedScope }) => {
  return (
    <div className="h-full overflow-y-auto custom-scrollbar pb-20">
      <PersonnelManager user={user} initialTab="stations" fixedScope={fixedScope} />
    </div>
  );
};

export default TeamleaderPersonnelView;
