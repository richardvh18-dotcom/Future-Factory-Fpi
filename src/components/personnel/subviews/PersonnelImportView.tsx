import React from "react";

interface PersonnelImportViewProps {
  onImport?: () => void;
}

const PersonnelImportView = React.memo(({ onImport }: PersonnelImportViewProps) => {
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
});

export default PersonnelImportView;