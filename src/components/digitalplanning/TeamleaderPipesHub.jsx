import React, { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import TeamleaderHub from "./TeamleaderHub";
import { Loader2 } from "lucide-react";

/**
 * TeamleaderPipesHub - V2 (Future Factory Path)
 */
const TeamleaderPipesHub = (props) => {
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('[TeamleaderPipesHub] Initializing, path:', PATHS.FACTORY_CONFIG.join('/'));
    const docRef = doc(db, ...PATHS.FACTORY_CONFIG);

    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        console.log('[TeamleaderPipesHub] Factory config exists:', docSnap.exists());
        if (docSnap.exists()) {
          const data = docSnap.data();
          console.log('[TeamleaderPipesHub] Departments:', data.departments?.length || 0);
          const myDept = (data.departments || []).find(
            (d) => d.slug === "pipes" || d.id === "pipes"
          );
          if (myDept) {
            console.log('[TeamleaderPipesHub] Found pipes dept with', myDept.stations?.length || 0, 'stations');
            setStations(myDept.stations || []);
          } else {
            console.warn('[TeamleaderPipesHub] No pipes department found in factory config');
          }
        } else {
          console.warn('[TeamleaderPipesHub] Factory config document does not exist');
        }
        setLoading(false);
      },
      (err) => {
        console.error("[TeamleaderPipesHub] Factory config error:", err);
        setLoading(false);
      }
    );

    return () => {
      console.log('[TeamleaderPipesHub] Cleanup');
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
      fixedScope="pipe"
      departmentName="Pipe Productions"
      allowedMachines={machineIds}
    />
  );
};

export default TeamleaderPipesHub;
