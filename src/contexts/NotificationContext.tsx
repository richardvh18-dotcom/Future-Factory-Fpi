import React, { useEffect, useCallback, useRef } from 'react';
import { create } from 'zustand';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { getPathString, PATHS } from '../config/dbPaths';
import { useAdminAuth } from '../hooks/useAdminAuth';

type ToastType = 'success' | 'error' | 'warning' | 'info';

type ToastPayload = {
  id?: number;
  title?: string;
  message?: string;
  type?: ToastType;
  duration?: number;
  count?: number;
  createdAt?: number;
  meta?: 'summary';
};

type ToastItem = {
  id: number;
  title: string;
  message: string;
  type: ToastType;
  duration: number;
  count: number;
  createdAt: number;
  meta?: 'summary';
};

type ConfirmTone = 'warning' | 'danger' | 'default';

type ConfirmDialog = {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  tone: ConfirmTone;
};

type ConfirmOptions = {
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: ConfirmTone;
};

export type NotificationContextValue = {
  activeToast: ToastItem | null;
  queuedCount: number;
  toasts: ToastItem[];
  unreadCount: number;
  hasPermission: boolean;
  showToast: (toast: ToastPayload | string) => number;
  showPopup: (payload: ToastPayload | string) => number;
  notify: (payload: ToastPayload | string) => number;
  confirmDialog: ConfirmDialog | null;
  showConfirm: (options?: ConfirmOptions | string) => Promise<boolean>;
  confirm: (options?: ConfirmOptions | string) => Promise<boolean>;
  resolveConfirm: (accepted: boolean) => void;
  removeToast: (id: number) => void;
  showSuccess: (message: string, title?: string) => number;
  showError: (message: string, title?: string) => number;
  showInfo: (message: string, title?: string) => number;
  showWarning: (message: string, title?: string) => number;
  requestBrowserPermission: () => Promise<boolean>;
};

type AuthUser = {
  uid?: string;
  email?: string;
  role?: string;
};

declare global {
  interface Window {
    notify?: (message: string) => void;
    appAlert?: (message: string) => void;
    __APP_ALERT__?: (message: string) => void;
  }
}

const TYPE_LABELS = {
  success: 'Succes',
  error: 'Fout',
  warning: 'Waarschuwing',
  info: 'Melding',
};

const getDefaultDuration = (type?: ToastType) => {
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

const isSameToast = (left?: ToastPayload | null, right?: ToastPayload | null) => {
  if (!left || !right) return false;
  return left.type === right.type && left.title === right.title && left.message === right.message;
};

const mergeToast = (existingToast: ToastItem, incomingToast: ToastPayload): ToastItem => ({
  ...existingToast,
  count: (existingToast.count || 1) + (incomingToast.count || 1),
  duration: incomingToast.duration || existingToast.duration,
  createdAt: incomingToast.createdAt || Date.now(),
});

const inferAlertType = (message: string): ToastType => {
  const value = String(message || '').trim();
  if (/^(❌|error|fout|mislukt|kon .* niet|kan .* niet)/iu.test(value)) return 'error';
  if (/^(⚠️|waarschuwing|let op)/iu.test(value)) return 'warning';
  if (/^(✅|succes|gelukt)/iu.test(value)) return 'success';
  return 'info';
};

const normalizeAlertPayload = (message: unknown): ToastPayload => {
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

type NotificationStoreState = {
  activeToast: ToastItem | null;
  toastQueue: ToastItem[];
  confirmDialog: ConfirmDialog | null;
  unreadCount: number;
  hasPermission: boolean;
  confirmResolverRef: { current: ((accepted: boolean) => void) | null };

  showToast: (toast: ToastPayload | string) => number;
  removeToast: (id: number) => void;
  showConfirm: (options?: ConfirmOptions | string) => Promise<boolean>;
  resolveConfirm: (accepted: boolean) => void;
  setUnreadCount: (count: number) => void;
  setHasPermission: (has: boolean) => void;
};

export const useNotificationStore = create<NotificationStoreState>((set, get) => ({
  activeToast: null,
  toastQueue: [],
  confirmDialog: null,
  unreadCount: 0,
  hasPermission: typeof window !== 'undefined' && 'Notification' in window
    ? Notification.permission === 'granted'
    : false,
  confirmResolverRef: { current: null },

  showToast: (toast) => {
    const safeToast = typeof toast === 'string'
      ? normalizeAlertPayload(toast)
      : (toast || {} as ToastPayload);

    const nextToast: ToastItem = {
      id: Date.now() + Math.random(),
      title: safeToast.title || (safeToast.type ? TYPE_LABELS[safeToast.type] : TYPE_LABELS.info),
      message: safeToast.message || '',
      type: safeToast.type || 'info',
      duration: safeToast.duration || getDefaultDuration(safeToast.type),
      count: safeToast.count || 1,
      createdAt: Date.now(),
    };

    const state = get();
    const currentToast = state.activeToast;
    const queuedToasts = state.toastQueue;
    const isLowPriority = nextToast.type === 'info' || nextToast.type === 'success';

    if (currentToast && isLowPriority && queuedToasts.length >= 2) {
      set((state) => {
        const prev = state.toastQueue;
        const last = prev[prev.length - 1];
        if (last?.meta === 'summary') {
          const nextCount = (last.count || 1) + 1;
          return {
            toastQueue: [
              ...prev.slice(0, -1),
              {
                ...last,
                count: nextCount,
                message: `${nextCount} extra meldingen gebundeld`,
                createdAt: Date.now(),
              } as ToastItem,
            ].slice(-4)
          };
        }

        return {
          toastQueue: [
            ...prev.slice(0, 2),
            {
              id: Date.now() + Math.random(),
              title: 'Meldingen',
              message: '2 extra meldingen gebundeld',
              type: 'info' as ToastType,
              duration: 3600,
              count: 2,
              meta: 'summary',
              createdAt: Date.now(),
            } as ToastItem,
          ].slice(-4)
        };
      });
      return currentToast.id;
    }

    if (!currentToast) {
      set({ activeToast: nextToast });
      return nextToast.id;
    }

    if (isSameToast(currentToast, nextToast)) {
      set({ activeToast: mergeToast(currentToast, nextToast) });
      return currentToast.id;
    }

    set((state) => {
      const prev = state.toastQueue;
      const lastQueuedToast = prev[prev.length - 1];
      if (isSameToast(lastQueuedToast, nextToast)) {
        return { toastQueue: [...prev.slice(0, -1), mergeToast(lastQueuedToast, nextToast)].slice(-4) };
      }
      return { toastQueue: [...prev, nextToast].slice(-4) };
    });

    return nextToast.id;
  },

  removeToast: (id: number) => {
    const state = get();
    if (state.activeToast?.id === id) {
      set({ activeToast: null });
      return;
    }
    set({ toastQueue: state.toastQueue.filter((toast) => toast.id !== id) });
  },

  showConfirm: (options: ConfirmOptions | string = {}) => {
    const payload = typeof options === 'string' ? { message: options } : options;
    return new Promise<boolean>((resolve) => {
      get().confirmResolverRef.current = resolve;
      set({
        confirmDialog: {
          title: payload.title || 'Bevestigen',
          message: payload.message || '',
          confirmText: payload.confirmText || 'Bevestigen',
          cancelText: payload.cancelText || 'Annuleren',
          tone: payload.tone || 'warning',
        }
      });
    });
  },

  resolveConfirm: (accepted: boolean) => {
    const resolver = get().confirmResolverRef.current;
    get().confirmResolverRef.current = null;
    set({ confirmDialog: null });
    if (resolver) resolver(Boolean(accepted));
  },

  setUnreadCount: (count) => set({ unreadCount: count }),
  setHasPermission: (has) => set({ hasPermission: has }),
}));

export const useNotifications = (): NotificationContextValue => {
  const store = useNotificationStore();

  const showSuccess = useCallback((message: string, title = 'Succes') => {
    return store.showToast({ title, message, type: 'success' });
  }, [store.showToast]);

  const showError = useCallback((message: string, title = 'Fout') => {
    return store.showToast({ title, message, type: 'error', duration: 6000 });
  }, [store.showToast]);

  const showInfo = useCallback((message: string, title = 'Info') => {
    return store.showToast({ title, message, type: 'info' });
  }, [store.showToast]);

  const showWarning = useCallback((message: string, title = 'Waarschuwing') => {
    return store.showToast({ title, message, type: 'warning' });
  }, [store.showToast]);

  const requestBrowserPermission = useCallback(async () => {
    if (!('Notification' in window)) {
      store.showToast({
        title: 'Meldingen',
        message: 'Browsernotificaties zijn niet beschikbaar in deze browser.',
        type: 'warning',
      });
      return false;
    }

    if (Notification.permission === 'granted') {
      store.setHasPermission(true);
      store.showToast({
        title: 'Meldingen',
        message: 'Browsernotificaties staan al aan.',
        type: 'info',
      });
      return true;
    }

    if (Notification.permission === 'denied') {
      store.setHasPermission(false);
      store.showToast({
        title: 'Meldingen',
        message: 'Browsernotificaties zijn geblokkeerd. Pas dit aan in je browserinstellingen.',
        type: 'warning',
        duration: 6000,
      });
      return false;
    }

    const permission = await Notification.requestPermission();
    const granted = permission === 'granted';
    store.setHasPermission(granted);

    store.showToast({
      title: 'Meldingen',
      message: granted
        ? 'Browsernotificaties zijn ingeschakeld.'
        : 'Je blijft meldingen in de app zien. Browsernotificaties blijven uit.',
      type: granted ? 'success' : 'info',
    });

    return granted;
  }, [store.setHasPermission, store.showToast]);

  return {
    activeToast: store.activeToast,
    queuedCount: store.toastQueue.length,
    toasts: store.activeToast ? [store.activeToast, ...store.toastQueue] : store.toastQueue,
    unreadCount: store.unreadCount,
    hasPermission: store.hasPermission,
    showToast: store.showToast,
    showPopup: store.showToast,
    notify: store.showToast,
    confirmDialog: store.confirmDialog,
    showConfirm: store.showConfirm,
    confirm: store.showConfirm,
    resolveConfirm: store.resolveConfirm,
    removeToast: store.removeToast,
    showSuccess,
    showError,
    showInfo,
    showWarning,
    requestBrowserPermission,
  };
};

export const NotificationProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAdminAuth() as { user: AuthUser | null };
  const store = useNotificationStore();
  const originalAlertRef = useRef<((message?: unknown) => void) | null>(null);

  useEffect(() => {
    if ('Notification' in window) {
      store.setHasPermission(Notification.permission === 'granted');
    }
  }, [store.setHasPermission]);

  // Process queue
  useEffect(() => {
    if (store.activeToast || store.toastQueue.length === 0) return;

    const [nextToast, ...rest] = store.toastQueue;
    useNotificationStore.setState({ activeToast: nextToast, toastQueue: rest });
  }, [store.activeToast, store.toastQueue]);

  // Timeout for active toast
  useEffect(() => {
    if (!store.activeToast) return undefined;

    const timeoutId = window.setTimeout(() => {
      useNotificationStore.setState((state) => ({
        activeToast: state.activeToast?.id === store.activeToast!.id ? null : state.activeToast
      }));
    }, store.activeToast.duration);

    return () => window.clearTimeout(timeoutId);
  }, [store.activeToast?.id, store.activeToast?.duration, store.activeToast?.createdAt]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    if (!originalAlertRef.current) {
      originalAlertRef.current = window.alert;
    }

    const appAlertHandler = (message: string) => {
      const normalizedAlert = normalizeAlertPayload(message);
      if (!normalizedAlert.message) return;
      useNotificationStore.getState().showToast(normalizedAlert);
    };

    window.notify = appAlertHandler;
    window.appAlert = appAlertHandler;
    window.__APP_ALERT__ = appAlertHandler;
    window.alert = appAlertHandler;

    return () => {
      if (window.notify) delete window.notify;
      if (window.appAlert) delete window.appAlert;
      if (window.__APP_ALERT__) delete window.__APP_ALERT__;
      if (originalAlertRef.current) {
        window.alert = originalAlertRef.current;
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      const resolver = useNotificationStore.getState().confirmResolverRef.current;
      if (resolver) {
        resolver(false);
        useNotificationStore.getState().confirmResolverRef.current = null;
      }
    };
  }, []);

  // Listen to new messages
  useEffect(() => {
    if (!user?.email || user?.role === 'guest') {
      store.setUnreadCount(0);
      return;
    }

    const messagesRef = collection(db, getPathString(PATHS.MESSAGES));
    const q = query(
      messagesRef,
      where('to', 'in', [user.email.toLowerCase(), 'admin'])
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const unread = snapshot.docs.filter((docSnap) => !docSnap.data().read).length;
        store.setUnreadCount(unread);

        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = change.doc.data();
            const isNew = data.timestamp?.toDate 
              ? (Date.now() - data.timestamp.toDate().getTime()) < 5000 
              : true;
            
            if (isNew && data.senderId !== user.uid) {
              store.showToast({
                title: data.subject || 'Nieuw bericht',
                message: data.body || data.message || '',
                type: 'info',
                duration: 5000,
              });

              if (store.hasPermission && document.hidden) {
                new Notification(data.subject || 'Nieuw bericht', {
                  body: data.body || data.message || '',
                  icon: '/favicon.ico',
                  tag: change.doc.id,
                });
              }
            }
          }
        });
      },
      (err: unknown) => {
        const warningText = err instanceof Error ? err.message : String(err);
        console.warn('Notification messages listener blocked:', warningText);
        store.setUnreadCount(0);
      }
    );

    return () => unsubscribe();
  }, [user, store.hasPermission, store.showToast, store.setUnreadCount]);

  return (
    <>{children}</>
  );
};
