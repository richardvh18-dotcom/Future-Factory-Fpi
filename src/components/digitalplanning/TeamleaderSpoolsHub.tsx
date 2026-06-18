import React, { useState, useEffect } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS } from "../../config/dbPaths";
import TeamleaderHub from "./TeamleaderHub";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

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
 * TeamleaderSpoolsHub - V2 (Future Factory Path)
 */
const TeamleaderSpoolsHub = React.memo((props: Record<string, unknown>) => {
  const { t } = useTranslation();
  const [stations, setStations] = useState<StationConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('[TeamleaderSpoolsHub] Initializing, path:', PATHS.FACTORY_CONFIG.join('/'));
    const docRef = (doc as any)(db, ...(PATHS.FACTORY_CONFIG as string[]));

    const unsubscribe = onSnapshot(
      docRef,
      (docSnap: any) => {
        console.log('[TeamleaderSpoolsHub] Factory config exists:', docSnap.exists());
        if (docSnap.exists()) {
          const data = docSnap.data() as FactoryConfigDoc;
          console.log('[TeamleaderSpoolsHub] Departments:', data.departments?.length || 0);
          const myDept = (data.departments || []).find(
            (d: DepartmentConfig) => d.slug === "spools" || d.id === "spools"
          );
          if (myDept) {
            console.log('[TeamleaderSpoolsHub] Found spools dept with', myDept.stations?.length || 0, 'stations');
            const activeStations = (myDept.stations || []).filter((s: StationConfig) => s.isAvailableForPlanning !== false);
            setStations(activeStations);
          } else {
            console.warn('[TeamleaderSpoolsHub] No spools department found in factory config');
          }
        } else {
          console.warn('[TeamleaderSpoolsHub] Factory config document does not exist');
        }
        setLoading(false);
      },
      (err: unknown) => {
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

  const machineIds = stations.map((s: StationConfig) => s.name).filter(Boolean);

  return (
    <TeamleaderHub
      {...props}
      fixedScope="spools"
      departmentName={t('teamleader.spools_productions', 'Spools Producties')}
      allowedMachines={machineIds}
    />
  );
});

export default TeamleaderSpoolsHub;
