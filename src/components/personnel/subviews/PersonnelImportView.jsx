import React from "react";

const PersonnelImportView = React.memo(({ onImport }) => {
  // Dummy import UI
  return (
    <div>
      <h3 className="font-bold mb-2">Personeel Importeren</h3>
      <button
        className="bg-blue-600 text-white px-4 py-2 rounded"
        onClick={onImport}
      >
        Importeer CSV
      </button>
    </div>
  );
};

export default PersonnelImportView;
