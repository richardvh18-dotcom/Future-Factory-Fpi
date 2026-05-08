// @ts-nocheck
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { PATHS } from '../config/dbPaths';
import { useAdminAuth } from '../hooks/useAdminAuth';

const NotificationContext = createContext<any>(undefined as any);

const TYPE_LABELS = {
  success: 'Succes',
  error: 'Fout',
  warning: 'Waarschuwing',
  info: 'Melding',
};

const getDefaultDuration = (type) => {
  switch (type) {
    case 'success':
      return 3600;
    case 'error':
      return 6500;
    case 'warning':
      return 5200;
    case 'info':
    default:
      return 4200;
  }
};

const isSameToast = (left, right) => {
  if (!left || !right) return false;
  return left.type === right.type && left.title === right.title && left.message === right.message;
};

const mergeToast = (existingToast, incomingToast) => ({
  ...existingToast,
  count: (existingToast.count || 1) + (incomingToast.count || 1),
  duration: incomingToast.duration,
  createdAt: incomingToast.createdAt,
});

const inferAlertType = (message) => {
  const value = String(message || '').trim();
  if (/^(❌|error|fout|mislukt|kon .* niet|kan .* niet)/iu.test(value)) return 'error';
  if (/^(⚠️|waarschuwing|let op)/iu.test(value)) return 'warning';
  if (/^(✅|succes|gelukt)/iu.test(value)) return 'success';
  return 'info';
};

const normalizeAlertPayload = (message) => {
  const raw = String(message ?? '').trim();
  const cleaned = raw.replace(/^(✅|❌|⚠️|ℹ️)\s*/u, '').trim();
  const type = inferAlertType(raw);
  const sections = cleaned.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);

  if (sections.length > 1 && sections[0].length <= 64) {
    return {
      title: sections[0],
      message: sections.slice(1).join('\n\n'),
      type,
      duration: type === 'error' ? 7000 : getDefaultDuration(type),
    };
  }

  return {
    title: TYPE_LABELS[type],
    message: cleaned,
    type,
    duration: type === 'error' ? 7000 : getDefaultDuration(type),
  };
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
};

export const NotificationProvider = ({ children }) => {
  const { user } = useAdminAuth();
  const [activeToast, setActiveToast] = useState(null);
  const [toastQueue, setToastQueue] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasPermission, setHasPermission] = useState(
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission === 'granted'
      : false
  );
  const activeToastRef = useRef(null);
  const toastQueueRef = useRef([]);
  const originalAlertRef = useRef(null);
  const confirmResolverRef = useRef(null);

  useEffect(() => {
    if ('Notification' in window) {
      setHasPermission(Notification.permission === 'granted');
    }
  }, []);

  useEffect(() => {
    activeToastRef.current = activeToast;
  }, [activeToast]);

  useEffect(() => {
    toastQueueRef.current = toastQueue;
  }, [toastQueue]);

  const showToast = useCallback((toast) => {
    const safeToast = typeof toast === 'string'
      ? normalizeAlertPayload(toast)
      : (toast || {});

    const nextToast = {
      id: Date.now() + Math.random(),
      title: safeToast.title || TYPE_LABELS[safeToast.type] || TYPE_LABELS.info,
      message: safeToast.message || '',
      type: safeToast.type || 'info',
      duration: safeToast.duration || getDefaultDuration(safeToast.type),
      count: safeToast.count || 1,
      createdAt: Date.now(),
    };

    const currentToast = activeToastRef.current;
    const queuedToasts = toastQueueRef.current;
    const isLowPriority = nextToast.type === 'info' || nextToast.type === 'success';

    if (currentToast && isLowPriority && queuedToasts.length >= 2) {
      setToastQueue((prev) => {
        const last = prev[prev.length - 1];
        if (last?.meta === 'summary') {
          const nextCount = (last.count || 1) + 1;
          return [
            ...prev.slice(0, -1),
            {
              ...last,
              count: nextCount,
              message: `${nextCount} extra meldingen gebundeld`,
              createdAt: Date.now(),
            },
          ].slice(-4);
        }

        return [
          ...prev.slice(0, 2),
          {
            id: Date.now() + Math.random(),
            title: 'Meldingen',
            message: '2 extra meldingen gebundeld',
            type: 'info',
            duration: 3600,
            count: 2,
            meta: 'summary',
            createdAt: Date.now(),
          },
        ].slice(-4);
      });
      return currentToast.id;
    }

    if (!currentToast) {
      setActiveToast(nextToast);
      return nextToast.id;
    }

    if (isSameToast(currentToast, nextToast)) {
      setActiveToast((prev) => (prev ? mergeToast(prev, nextToast) : nextToast));
      return currentToast.id;
    }

    setToastQueue((prev) => {
      const lastQueuedToast = prev[prev.length - 1];
      if (isSameToast(lastQueuedToast, nextToast)) {
        return [...prev.slice(0, -1), mergeToast(lastQueuedToast, nextToast)].slice(-4);
      }
      return [...prev, nextToast].slice(-4);
    });

    return nextToast.id;
  }, []);

  const removeToast = useCallback((id) => {
    if (activeToastRef.current?.id === id) {
      setActiveToast(null);
      return;
    }

    setToastQueue((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const requestBrowserPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      showToast({
        title: 'Meldingen',
        message: 'Browsernotificaties zijn niet beschikbaar in deze browser.',
        type: 'warning',
      });
      return false;
    }

    if (Notification.permission === 'granted') {
      setHasPermission(true);
      showToast({
        title: 'Meldingen',
        message: 'Browsernotificaties staan al aan.',
        type: 'info',
      });
      return true;
    }

    if (Notification.permission === 'denied') {
      setHasPermission(false);
      showToast({
        title: 'Meldingen',
        message: 'Browsernotificaties zijn geblokkeerd. Pas dit aan in je browserinstellingen.',
        type: 'warning',
        duration: 6000,
      });
      return false;
    }

    const permission = await Notification.requestPermission();
    const granted = permission === 'granted';
    setHasPermission(granted);

    showToast({
      title: 'Meldingen',
      message: granted
        ? 'Browsernotificaties zijn ingeschakeld.'
        : 'Je blijft meldingen in de app zien. Browsernotificaties blijven uit.',
      type: granted ? 'success' : 'info',
    });

    return granted;
  }, [showToast]);

  const showConfirm = useCallback((options = {}) => {
    const payload = typeof options === 'string' ? { message: options } : options;

    return new Promise((resolve) => {
      confirmResolverRef.current = resolve;
      setConfirmDialog({
        title: payload.title || 'Bevestigen',
        message: payload.message || '',
        confirmText: payload.confirmText || 'Bevestigen',
        cancelText: payload.cancelText || 'Annuleren',
        tone: payload.tone || 'warning',
      });
    });
  }, []);

  const resolveConfirm = useCallback((accepted) => {
    const resolver = confirmResolverRef.current;
    confirmResolverRef.current = null;
    setConfirmDialog(null);
    if (resolver) resolver(Boolean(accepted));
  }, []);

  useEffect(() => {
    if (activeToast || toastQueue.length === 0) return;

    const [nextToast] = toastQueue;
    setActiveToast(nextToast);
    setToastQueue((prev) => prev.slice(1));
  }, [activeToast, toastQueue]);

  useEffect(() => {
    if (!activeToast) return undefined;

    const timeoutId = window.setTimeout(() => {
      setActiveToast((current) => (current?.id === activeToast.id ? null : current));
    }, activeToast.duration);

    return () => window.clearTimeout(timeoutId);
  }, [activeToast?.id, activeToast?.duration, activeToast?.createdAt]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    if (!originalAlertRef.current) {
      originalAlertRef.current = window.alert;
    }

    const appAlertHandler = (message) => {
      const normalizedAlert = normalizeAlertPayload(message);
      if (!normalizedAlert.message) return;
      showToast(normalizedAlert);
    };

    // Preferred global API when hook context is not directly available.
    window.notify = appAlertHandler;
    // Alias retained for existing callsites.
    window.appAlert = appAlertHandler;
    // Backward compatibility alias.
    window.__APP_ALERT__ = appAlertHandler;
    // Keep native alert bridge active for third-party or old code paths.
    window.alert = appAlertHandler;

    return () => {
      if (window.notify) delete window.notify;
      if (window.appAlert) delete window.appAlert;
      if (window.__APP_ALERT__) delete window.__APP_ALERT__;
      if (originalAlertRef.current) {
        window.alert = originalAlertRef.current;
      }
    };
  }, [showToast]);

  useEffect(() => {
    return () => {
      if (confirmResolverRef.current) {
        confirmResolverRef.current(false);
        confirmResolverRef.current = null;
      }
    };
  }, []);

  // Listen to new messages
  useEffect(() => {
    if (!user?.email || user?.role === 'guest') {
      setUnreadCount(0);
      return;
    }

    const messagesRef = collection(db, ...PATHS.MESSAGES);
    const q = query(
      messagesRef,
      where('to', 'in', [user.email.toLowerCase(), 'admin'])
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        // Count unread messages
        const unread = snapshot.docs.filter(doc => !doc.data().read).length;
        setUnreadCount(unread);

        // Show toast for new messages
        snapshot.docChanges().forEach(change => {
          if (change.type === 'added') {
            const data = change.doc.data();
            const isNew = data.timestamp?.toDate 
              ? (Date.now() - data.timestamp.toDate().getTime()) < 5000 
              : true;
            
            // Don't show notification for messages sent by current user
            if (isNew && data.senderId !== user.uid) {
              showToast({
                title: data.subject || 'Nieuw bericht',
                message: data.body || data.message || '',
                type: 'info',
                duration: 5000,
              });

              // Browser notification
              if (hasPermission && document.hidden) {
                new Notification(data.subject || 'Nieuw bericht', {
                  body: data.body || data.message || '',
                  icon: '/manifest.json',
                  tag: change.doc.id,
                });
              }
            }
          }
        });
      },
      (err) => {
        console.warn('Notification messages listener blocked:', err?.code || err?.message || err);
        setUnreadCount(0);
      }
    );

    return () => unsubscribe();
  }, [user, hasPermission, showToast]);

  const showSuccess = useCallback((message, title = 'Succes') => {
    return showToast({ title, message, type: 'success' });
  }, [showToast]);

  const showError = useCallback((message, title = 'Fout') => {
    return showToast({ title, message, type: 'error', duration: 6000 });
  }, [showToast]);

  const showInfo = useCallback((message, title = 'Info') => {
    return showToast({ title, message, type: 'info' });
  }, [showToast]);

  const showWarning = useCallback((message, title = 'Waarschuwing') => {
    return showToast({ title, message, type: 'warning' });
  }, [showToast]);

  // Universele API alias voor in-app popups.
  const showPopup = useCallback((payload) => {
    return showToast(payload);
  }, [showToast]);

  const value = {
    activeToast,
    queuedCount: toastQueue.length,
    toasts: activeToast ? [activeToast, ...toastQueue] : toastQueue,
    unreadCount,
    hasPermission,
    showToast,
    showPopup,
    notify: showPopup,
    confirmDialog,
    showConfirm,
    confirm: showConfirm,
    resolveConfirm,
    removeToast,
    showSuccess,
    showError,
    showInfo,
    showWarning,
    requestBrowserPermission,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};
