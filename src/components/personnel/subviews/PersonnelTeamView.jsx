import React from "react";

const PersonnelTeamView = React.memo(({ personnel, departments }) => {
  // Toon teamindeling per afdeling
  return (
    <div>
      <h3 className="font-bold mb-2">Teamindeling</h3>
      {departments.map((dept) => (
        <div key={dept.id} className="mb-4">
          <h4 className="font-semibold text-slate-700">{dept.name}</h4>
          <ul className="ml-4 list-disc">
            {personnel.filter((p) => p.departmentId === dept.id).map((person) => (
              <li key={person.id}>{person.name}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};

export default PersonnelTeamView;
