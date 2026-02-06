import React from "react";


const PersonList = ({ personnel, searchTerm, setSearchTerm, onEdit }) => {
  const filtered = personnel.filter((p) => {
    const term = searchTerm.toLowerCase();
    return (
      p.name?.toLowerCase().includes(term) ||
      p.employeeNumber?.toLowerCase().includes(term) ||
      p.departmentId?.toLowerCase().includes(term)
    );
  });
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <input
          type="text"
          placeholder="Zoek op naam, nummer of afdeling..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="p-2 border rounded"
        />
        <span className="text-xs text-slate-400">{filtered.length} resultaten</span>
      </div>
      <ul className="divide-y">
        {filtered.map((p) => (
          <li key={p.id} className="py-2 flex justify-between items-center">
            <span>
              <b>{p.name}</b> <span className="text-xs text-slate-400">({p.employeeNumber})</span> - {p.departmentId}
            </span>
            <button onClick={() => onEdit(p)} className="text-blue-600 text-xs underline">Bewerken</button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default PersonList;
