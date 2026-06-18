import React, { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import TeamleaderHub from "./TeamleaderHub";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";

type StationConfig = {
  name: string;
  isAvailableForPlanning?: boolean;
};

type DepartmentConfig = {
  slug?: string;
  id?: string;
  stations?: StationConfig[];
};

type FactoryConfigDoc = {
  departments?: DepartmentConfig[];
};

/**
 * TeamleaderPipesHub - V2 (Future Factory Path)
 */
const TeamleaderPipesHub = React.memo((props: Record<string, unknown>) => {
  const [stations, setStations] = useState<StationConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('[TeamleaderPipesHub] Initializing, path:', PATHS.FACTORY_CONFIG.join('/'));
    const docRef = (doc as any)(db, ...(PATHS.FACTORY_CONFIG as string[]));

    const unsubscribe = onSnapshot(
      docRef,
      (docSnap: any) => {
        console.log('[TeamleaderPipesHub] Factory config exists:', docSnap.exists());
        if (docSnap.exists()) {
          const data = docSnap.data() as FactoryConfigDoc;
          console.log('[TeamleaderPipesHub] Departments:', data.departments?.length || 0);
          const myDept = (data.departments || []).find(
            (d: DepartmentConfig) => d.slug === "pipes" || d.id === "pipes"
          );
          if (myDept) {
            console.log('[TeamleaderPipesHub] Found pipes dept with', myDept.stations?.length || 0, 'stations');
            const activeStations = (myDept.stations || []).filter((s: StationConfig) => s.isAvailableForPlanning !== false);
            setStations(activeStations);
          } else {
            console.warn('[TeamleaderPipesHub] No pipes department found in factory config');
          }
        } else {
          console.warn('[TeamleaderPipesHub] Factory config document does not exist');
        }
        setLoading(false);
      },
      (err: unknown) => {
        console.error("[TeamleaderPipesHub] Factory config error:", err);
        setLoading(false);
      }
    );

    return () => {
      console.log('[TeamleaderPipesHub] Cleanup');
      unsubscribe();
    };
  }, []);

  const { t } = useTranslation();

  if (loading)
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );

  const machineIds = stations.map((s: StationConfig) => s.name).filter(Boolean);

  return (
    <TeamleaderHub
      {...props}
      fixedScope="pipe"
      departmentName={t('teamleader.pipe_productions', 'Pijp Productie')}
      allowedMachines={machineIds}
    />
  );
});

export default TeamleaderPipesHub;
