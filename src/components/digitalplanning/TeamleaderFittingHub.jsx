import React, { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import TeamleaderHub from "./TeamleaderHub";
import { Loader2 } from "lucide-react";

/**
 * TeamleaderFittingHub - V2 (Future Factory Path)
 */
const TeamleaderFittingHub = (props) => {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('[TeamleaderFittingHub] Initializing, path:', PATHS.FACTORY_CONFIG.join('/'));
    const docRef = doc(db, ...PATHS.FACTORY_CONFIG);

    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        console.log('[TeamleaderFittingHub] Factory config exists:', docSnap.exists());
        if (docSnap.exists()) {
          const data = docSnap.data();
          console.log('[TeamleaderFittingHub] Departments:', data.departments?.length || 0);
          const myDept = (data.departments || []).find(
            (d) => d.slug === "fittings" || d.id === "fittings"
          );
          if (myDept) {
            console.log('[TeamleaderFittingHub] Found fittings dept with', myDept.stations?.length || 0, 'stations');
            setStations(myDept.stations || []);
          } else {
            console.warn('[TeamleaderFittingHub] No fittings department found in factory config');
          }
        } else {
          console.warn('[TeamleaderFittingHub] Factory config document does not exist');
        }
        setLoading(false);
      },
      (err) => {
        console.error("[TeamleaderFittingHub] Factory config error:", err);
        setLoading(false);
      }
    );

    return () => {
      console.log('[TeamleaderFittingHub] Cleanup');
      unsubscribe();
    };
  }, []);

  if (loading)
    return (
      <div className="h-full flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-blue-600" size={32} />
      </div>
    );

  const machineIds = stations.map((s) => s.name);

  return (
    <TeamleaderHub
      {...props}
      fixedScope="fittings"
      departmentName="Fitting Productions"
      allowedMachines={machineIds}
    />
  );
};

export default TeamleaderFittingHub;
