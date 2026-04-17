import { useEffect } from 'react';
import { useAdminAuth } from '../../hooks/useAdminAuth';

const GodModeBootstrap = () => {
  const { user } = useAdminAuth();

  useEffect(() => {
    if (user?.uid === 'pzxPfiwQhnQdEQJcXU77ZgT2Jo32') {
      console.log("👑 God Mode Active: Full database access granted via Security Rules.");
    }
  }, [user]);

  return null;
};

export default GodModeBootstrap;