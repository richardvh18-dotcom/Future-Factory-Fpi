import React from "react";

interface PersonnelSchedulePerson {
  id: string;
  name?: string;
  shiftId?: string;
}

interface PersonnelScheduleViewProps {
  personnel: PersonnelSchedulePerson[];
  viewDate: Date;
}

const PersonnelScheduleView = React.memo(({ personnel, viewDate }: PersonnelScheduleViewProps) => {
  return (
    <div>
      <h3 className="font-bold mb-2">Rooster Overzicht</h3>
      <ul className="list-disc ml-4">
        {personnel.map((person) => (
          <li key={person.id}>
            {person.name} - Shift: {person.shiftId || "-"} ({viewDate.toLocaleDateString()})
          </li>
        ))}
      </ul>
    </div>
  );
});

export default PersonnelScheduleView;