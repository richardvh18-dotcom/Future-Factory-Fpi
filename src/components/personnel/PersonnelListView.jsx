import React, { useState } from "react";
import { Search, UserCircle, Edit3, Trash2, Plus } from "lucide-react";

const PersonnelListView = ({ personnel = [], onEdit, onDelete, onAdd }) => {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredPersonnel = personnel.filter((p) => {
    const term = searchTerm.toLowerCase();
    const name = (p.name || "").toLowerCase();
    const number = (p.employeeNumber || "").toLowerCase();
    return !term || name.includes(term) || number.includes(term);
  });

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* HEADER & SEARCH */}
      <div className="bg-white p-4 rounded-[35px] border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="relative flex-1 w-full group">
          <Search
            className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-500 transition-colors"
            size={20}
          />
          <input
            type="text"
            placeholder="Zoek op naam of personeelsnummer..."
            className="w-full pl-14 pr-6 py-3.5 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-bold outline-none focus:border-blue-500 focus:bg-white transition-all shadow-inner"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        {onAdd && (
          <button
            onClick={onAdd}
            className="px-6 py-3.5 bg-blue-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-blue-700 transition-all shadow-lg flex items-center gap-2 active:scale-95 shrink-0 w-full md:w-auto justify-center"
          >
            <Plus size={16} />
            <span>Toevoegen</span>
          </button>
        )}
      </div>

      {/* GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredPersonnel.length === 0 ? (
          <div className="col-span-full py-20 text-center opacity-50">
            <UserCircle size={64} className="mx-auto mb-4 text-slate-300" />
            <p className="text-sm font-black uppercase tracking-widest text-slate-400">
              Geen medewerkers gevonden
            </p>
          </div>
        ) : (
          filteredPersonnel.map((p) => (
            <div
              key={p.id}
              className="bg-white p-6 rounded-[40px] border-2 border-slate-100 hover:border-blue-400 transition-all group shadow-sm flex flex-col relative overflow-hidden text-left h-full"
            >
              <div className="absolute top-0 right-0 p-6 opacity-5 rotate-12 pointer-events-none">
                <UserCircle size={100} />
              </div>
              
              <div className="flex items-center gap-4 mb-6 relative z-10">
                <div className="p-3 bg-slate-900 text-white rounded-2xl shadow-lg shrink-0">
                  <UserCircle size={24} />
                </div>
                <div className="text-left overflow-hidden min-w-0">
                  <h4 className="font-black text-slate-950 text-base uppercase italic truncate leading-none mb-1.5">
                    {p.name || "Naamloos"}
                  </h4>
                  <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest italic block truncate">
                    {p.employeeNumber || "Geen ID"}
                  </span>
                </div>
              </div>

              <div className="space-y-2 mb-4 flex-1">
                 {p.departmentId && p.departmentId !== "dept_1769963034569" && (
                   <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50 px-2 py-1 rounded-lg w-fit border border-slate-100">
                     {p.departmentId}
                   </div>
                 )}
                 {p.shiftId && (
                     <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50 px-2 py-1 rounded-lg w-fit border border-slate-100">
                         {p.shiftId}
                     </div>
                 )}
              </div>

              <div className="pt-4 border-t border-slate-50 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-all mt-auto relative z-10">
                <button
                  onClick={() => onEdit && onEdit(p)}
                  className="p-3 text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 rounded-xl transition-all"
                  title="Bewerken"
                >
                  <Edit3 size={18} />
                </button>
                <button
                  onClick={() => onDelete && onDelete(p.id)}
                  className="p-3 text-slate-300 hover:text-rose-500 bg-slate-50 hover:bg-rose-50 rounded-xl transition-all"
                  title="Verwijderen"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default PersonnelListView;
