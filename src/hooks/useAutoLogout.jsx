import { useEffect, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth, logActivity } from '../config/firebase';

/**
 * useAutoLogout Hook
 * Automatisch uitloggen na een periode van inactiviteit
 * 
 * @param {number} timeoutMinutes - Aantal minuten inactiviteit voor uitloggen (default: 30)
 * @param {number} warningMinutes - Aantal minuten voor waarschuwing voordat uitloggen (default: 5)
 * @param {boolean} enabled - Of auto-logout actief is (default: true)
 */
export const useAutoLogout = (timeoutMinutes = 30, warningMinutes = 5, enabled = true) => {
  const [showWarning, setShowWarning] = useState(false);
  const [remainingTime, setRemainingTime] = useState(null);
  const timeoutRef = useRef(null);
  const warningTimeoutRef = useRef(null);
  const countdownRef = useRef(null);

  const TIMEOUT_MS = timeoutMinutes * 60 * 1000;
  const WARNING_MS = warningMinutes * 60 * 1000;

  const clearAllTimers = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
      warningTimeoutRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  };

  const handleLogout = async () => {
    clearAllTimers();
    setShowWarning(false);
    
    try {
      const user = auth.currentUser;
      if (user) {
        await logActivity(user.uid, 'AUTO_LOGOUT', 'Automatisch uitgelogd na inactiviteit');
      }
      await signOut(auth);
    } catch (error) {
      console.error('Error during auto logout:', error);
    }
  };

  const startCountdown = () => {
    setRemainingTime(warningMinutes);
    
    countdownRef.current = setInterval(() => {
      setRemainingTime(prev => {
        if (prev <= 1) {
          clearInterval(countdownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 60000); // Elke minuut
  };

  const showWarningDialog = () => {
    setShowWarning(true);
    startCountdown();
    
    // Na de warning tijd, log uit
    timeoutRef.current = setTimeout(() => {
      handleLogout();
    }, WARNING_MS);
  };

  const resetTimer = () => {
    clearAllTimers();
    setShowWarning(false);
    setRemainingTime(null);

    if (!enabled || !auth.currentUser) {
      return;
    }

    // Start warning timer
    warningTimeoutRef.current = setTimeout(() => {
      showWarningDialog();
    }, TIMEOUT_MS - WARNING_MS);
  };

  const handleActivity = () => {
    if (showWarning) {
      // Als warning al getoond wordt, reset alles
      resetTimer();
    }
  };

  const dismissWarning = () => {
    resetTimer();
  };

  useEffect(() => {
    if (!enabled || !auth.currentUser) {
      clearAllTimers();
      return;
    }

    // Activiteit events
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

    // Event listener voor activiteit
    const activityHandler = () => {
      if (!showWarning) {
        resetTimer();
      }
    };

    // Voeg listeners toe
    events.forEach(event => {
      document.addEventListener(event, activityHandler, true);
    });

    // Start initiële timer
    resetTimer();

    // Cleanup
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, activityHandler, true);
      });
      clearAllTimers();
    };
  }, [enabled, showWarning]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    showWarning,
    remainingTime,
    dismissWarning,
    handleActivity,
  };
};
