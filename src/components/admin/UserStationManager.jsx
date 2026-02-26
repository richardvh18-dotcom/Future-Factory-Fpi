import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { PATHS } from '../../config/dbPaths';
import { User, Check, Save, X, Shield, Loader2, MapPin, Briefcase } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const UserStationManager = () => {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [allStations, setAllStations] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [tempAllowed, setTempAllowed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCountry, setFilterCountry] = useState("All");
  const [filterDept, setFilterDept] = useState("All");

  useEffect(() => {
    // 1. Users ophalen
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      const userList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setUsers(userList);
    });

    // 2. Stations ophalen uit Factory Config
    const unsubConfig = onSnapshot(doc(db, ...PATHS.FACTORY_CONFIG), (snap) => {
      if (snap.exists()) {
        const config = snap.data();
        const stations = [];
        
        if (config.departments) {
          config.departments.forEach(dept => {
            if (dept.stations) {
              dept.stations.forEach(st => {
                stations.push({
                  id: st.name,
                  name: st.name,
                  department: dept.title || dept.name || t('common.other', "Overig"),
                  country: dept.country || t('common.other', "Overig")
                });
              });
            }
          });
        }
        
        // DEBUG: Controleer in de browser console (F12) welke landen er geladen worden
        console.log("🌍 Gevonden landen in config:", [...new Set(stations.map(s => s.country))]);

        // Voeg speciale rollen toe
        stations.push({ 
          id: 'TEAMLEADER', 
          name: t('adminUserStation.teamleaderHub', 'Teamleader Hub'), 
          department: t('adminUserStation.management', 'Management'), 
          country: t('adminUserStation.global', 'Global') 
        });
        
        setAllStations(stations);
      }
      setLoading(false);
    });

    return () => {
      unsubUsers();
      unsubConfig();
    };
  }, []);

  const handleUserSelect = (user) => {
    setSelectedUser(user);
    setFilterCountry("All");
    setFilterDept("All");
    // Als allowedStations niet bestaat of leeg is, gaan we ervan uit dat ze toegang hebben tot ALLES (standaard gedrag)
    // Om te editen zetten we dan alle vinkjes AAN, zodat je kunt zien dat ze alles hebben en kunt gaan beperken.
    if (!user.allowedStations) {
        setTempAllowed(allStations.map(s => s.id));
    } else {
        setTempAllowed(user.allowedStations);
    }
  };

  const toggleStation = (stationId) => {
    setTempAllowed(prev => {
      if (prev.includes(stationId)) {
        return prev.filter(id => id !== stationId);
      } else {
        return [...prev, stationId];
      }
    });
  };

  const handleSave = async () => {
    if (!selectedUser) return;
    
    try {
      const userRef = doc(db, 'users', selectedUser.id);
      await updateDoc(userRef, {
        allowedStations: tempAllowed
      });
      setSelectedUser(null);
      // Optioneel: Toon succes melding
    } catch (error) {
      console.error("Fout bij opslaan:", error);
      alert(t('adminUserStation.saveError', { message: error.message }));
    }
  };

  // Filter logica
  const filteredStations = allStations.filter(s => {
    if (filterCountry !== "All" && s.country !== filterCountry) return false;
    if (filterDept !== "All" && s.department !== filterDept) return false;
    return true;
  });

  const uniqueCountries = ["All", ...new Set(allStations.map(s => s.country))].sort();
  const uniqueDepts = ["All", ...new Set(allStations.filter(s => filterCountry === "All" || s.country === filterCountry).map(s => s.department))].sort();

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[600px]">
      {/* Gebruikers Lijst */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-100 bg-slate-50 font-bold text-slate-700">{t('adminUserStation.users', 'Gebruikers')}</div>
        <div className="overflow-y-auto flex-1 p-2 space-y-1">
          {users.map(user => (
            <button
              key={user.id}
              onClick={() => handleUserSelect(user)}
              className={`w-full text-left p-3 rounded-xl flex items-center gap-3 transition-colors ${selectedUser?.id === user.id ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'hover:bg-slate-50 text-slate-600'}`}
            >
              <div className="bg-slate-200 p-2 rounded-full"><User size={16} /></div>
              <div className="truncate">
                <div className="font-bold text-sm">{user.name || user.email || t('common.unknown')}</div>
                <div className="text-xs opacity-70">{user.role || t('adminUserStation.user', 'Gebruiker')}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Stations Editor */}
      <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col">
        {selectedUser ? (
          <>
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <span className="font-bold text-slate-700">{t('adminUserStation.accessFor', { name: selectedUser.name || selectedUser.email })}</span>
              <div className="flex gap-2">
                <button onClick={() => setSelectedUser(null)} className="p-2 text-slate-400 hover:text-slate-600"><X size={20} /></button>
              </div>
            </div>
            
            {/* Filters */}
            <div className="px-6 pt-4 pb-2 grid grid-cols-2 gap-4">
                <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{t('adminUserStation.location', 'Locatie')}</label>
                    <div className="relative">
                        <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <select 
                            value={filterCountry}
                            onChange={(e) => { setFilterCountry(e.target.value); setFilterDept("All"); }}
                            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-blue-500 cursor-pointer"
                        >
                            {uniqueCountries.map(c => <option key={c} value={c}>{c === "All" ? t('common.all', 'Alles') : c}</option>)}
                        </select>
                    </div>
                </div>
                <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">{t('adminUserStation.department', 'Afdeling')}</label>
                    <div className="relative">
                        <Briefcase size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <select 
                            value={filterDept}
                            onChange={(e) => setFilterDept(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-blue-500 cursor-pointer"
                        >
                            {uniqueDepts.map(d => <option key={d} value={d}>{d === "All" ? t('common.all', 'Alles') : d}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-2 gap-4">
                {filteredStations.map(station => (
                  <label key={station.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${tempAllowed.includes(station.id) ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'}`}>
                    <div className={`w-5 h-5 rounded border flex items-center justify-center ${tempAllowed.includes(station.id) ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-slate-300'}`}>
                      {tempAllowed.includes(station.id) && <Check size={14} />}
                    </div>
                    <div>
                      <div className="font-bold text-sm text-slate-700">{station.name}</div>
                      <div className="text-xs text-slate-400">{station.department}</div>
                    </div>
                  </label>
                ))}
                {filteredStations.length === 0 && (
                    <div className="col-span-2 text-center py-8 text-slate-400 text-xs italic">{t('adminUserStation.noStationsFound', 'Geen stations gevonden.')}</div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button onClick={handleSave} className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors">
                <Save size={18} /> {t('adminUserStation.save', 'Opslaan')}
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <Shield size={48} className="mb-4 opacity-20" />
            <p>{t('adminUserStation.selectUser', 'Selecteer een gebruiker om rechten te beheren')}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserStationManager;