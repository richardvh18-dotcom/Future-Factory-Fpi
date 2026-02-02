import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { db } from '../config/firebase';
import { PATHS } from '../config/dbPaths';
import { useAdminAuth } from '../hooks/useAdminAuth';

const NotificationContext = createContext();

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
};

export const NotificationProvider = ({ children }) => {
  const { user } = useAdminAuth();
  const [toasts, setToasts] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasPermission, setHasPermission] = useState(false);

  // Request browser notification permission
  useEffect(() => {
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        setHasPermission(true);
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
          setHasPermission(permission === 'granted');
        });
      }
    }
  }, []);

  // Listen to new messages
  useEffect(() => {
    if (!user?.email) return;

    const messagesRef = collection(db, ...PATHS.MESSAGES);
    const q = query(
      messagesRef,
      where('to', 'in', [user.email.toLowerCase(), 'admin']),
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
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
    });

    return () => unsubscribe();
  }, [user, hasPermission]);

  const showToast = useCallback((toast) => {
    const id = Date.now() + Math.random();
    const newToast = {
      id,
      ...toast,
      duration: toast.duration || 4000,
    };

    setToasts(prev => [...prev, newToast]);

    // Auto remove after duration
    setTimeout(() => {
      removeToast(id);
    }, newToast.duration);

    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

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

  const value = {
    toasts,
    unreadCount,
    showToast,
    removeToast,
    showSuccess,
    showError,
    showInfo,
    showWarning,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};
