import React from "react";

const PersonnelScheduleView = React.memo(({ personnel, viewDate }) => {
  // Toon rooster per persoon
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
};

export default PersonnelScheduleView;
