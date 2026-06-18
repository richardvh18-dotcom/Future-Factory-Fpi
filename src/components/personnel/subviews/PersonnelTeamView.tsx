import React from "react";
import i18n from "i18next";

interface PersonnelTeamPerson {
  id: string;
  name?: string;
  departmentId?: string;
}

interface PersonnelTeamDepartment {
  id: string;
  name?: string;
}

interface PersonnelTeamViewProps {
  personnel: PersonnelTeamPerson[];
  departments: PersonnelTeamDepartment[];
}

const PersonnelTeamView = React.memo(({ personnel, departments }: PersonnelTeamViewProps) => {
  return (
    <div>
      <h3 className="font-bold mb-2">{i18n.t('personnel.teamLayout', 'Teamindeling')}</h3>
      {departments.map((dept) => (
        <div key={dept.id} className="mb-4">
          <h4 className="font-semibold text-slate-700">{dept.name}</h4>
          <ul className="ml-4 list-disc">
            {personnel.filter((person) => person.departmentId === dept.id).map((person) => (
              <li key={person.id}>{person.name}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
});

export default PersonnelTeamView;