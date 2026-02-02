import React, { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import TeamleaderHub from "./TeamleaderHub";
import { Loader2 } from "lucide-react";

/**
 * TeamleaderSpoolsHub - V2 (Future Factory Path)
 */
const TeamleaderSpoolsHub = (props) => {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('[TeamleaderSpoolsHub] Initializing, path:', PATHS.FACTORY_CONFIG.join('/'));
    const docRef = doc(db, ...PATHS.FACTORY_CONFIG);

    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        console.log('[TeamleaderSpoolsHub] Factory config exists:', docSnap.exists());
        if (docSnap.exists()) {
          const data = docSnap.data();
          console.log('[TeamleaderSpoolsHub] Departments:', data.departments?.length || 0);
          const myDept = (data.departments || []).find(
            (d) => d.slug === "spools" || d.id === "spools"
          );
          if (myDept) {
            console.log('[TeamleaderSpoolsHub] Found spools dept with', myDept.stations?.length || 0, 'stations');
            setStations(myDept.stations || []);
          } else {
            console.warn('[TeamleaderSpoolsHub] No spools department found in factory config');
          }
        } else {
          console.warn('[TeamleaderSpoolsHub] Factory config document does not exist');
        }
        setLoading(false);
      },
      (err) => {
        console.error("[TeamleaderSpoolsHub] Factory config error:", err);
        setLoading(false);
      }
    );

    return () => {
      console.log('[TeamleaderSpoolsHub] Cleanup');
      unsubscribe();
    };
  }, []);

  if (loading)
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );

  const machineIds = stations.map((s) => s.name);

  return (
    <TeamleaderHub
      {...props}
      fixedScope="spools"
      departmentName="Spools Productions"
      allowedMachines={machineIds}
    />
  );
};

export default TeamleaderSpoolsHub;
