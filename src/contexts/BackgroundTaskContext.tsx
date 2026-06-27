import React, { useState, useEffect } from 'react';
import { create } from 'zustand';
import { db, auth } from '../config/firebase';
import { collection, query, where, onSnapshot, limit } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { PATHS, getPathString } from '../config/dbPaths';

export type BackgroundTask = {
    id: string;
    userId?: string;
    status?: 'pending' | 'processing' | 'completed' | 'error' | string;
    notified?: boolean;
    taskName?: string;
    result?: string;
    fileName?: string;
    error?: string;
    createdAt?: { toDate?: () => Date } | any;
    [key: string]: any;
};

interface BackgroundTaskStore {
    tasks: BackgroundTask[];
    dismissedTaskIds: string[];
    setTasks: (tasks: BackgroundTask[]) => void;
    setDismissedTaskIds: (taskIds: string[]) => void;
    dismissTask: (taskId: string) => void;
    downloadTaskResult: (task: BackgroundTask) => void;
}

const b64toBlob = (b64Data: string, contentType = '', sliceSize = 512) => {
    const byteCharacters = atob(b64Data);
    const byteArrays = [];
    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
        const slice = byteCharacters.slice(offset, offset + sliceSize);
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        byteArrays.push(byteArray);
    }
    return new Blob(byteArrays, { type: contentType });
};

const getDismissedTaskStorageKey = (userId: string) => `background_task_dismissed_task_ids_${userId}`;

const loadDismissedTaskIds = (userId: string): string[] => {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(getDismissedTaskStorageKey(userId));
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((item) => typeof item === 'string');
    } catch {
        return [];
    }
};

const saveDismissedTaskIds = (userId: string, taskIds: string[]) => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(getDismissedTaskStorageKey(userId), JSON.stringify(taskIds));
    } catch {
        // ignore localStorage write failures
    }
};

export const useBackgroundTaskStore = create<BackgroundTaskStore>((set) => ({
    tasks: [],
    dismissedTaskIds: [],
    setTasks: (tasks) => set({ tasks }),
    setDismissedTaskIds: (taskIds) => set({ dismissedTaskIds: taskIds }),
    dismissTask: (taskId: string) => set((state) => {
        const nextIds = Array.from(new Set([...state.dismissedTaskIds, taskId]));
        const currentUser = auth.currentUser;
        if (currentUser?.uid) {
            saveDismissedTaskIds(currentUser.uid, nextIds);
        }
        return { dismissedTaskIds: nextIds };
    }),
    downloadTaskResult: (task: BackgroundTask) => {
        if (!task.result) return;
        
        const blob = b64toBlob(task.result, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = task.fileName || 'export.xlsx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}));

// Backwards-compatible hook, voor eventuele andere componenten die dit nog gebruiken
export const useBackgroundTasks = () => useBackgroundTaskStore();

export const BackgroundTaskProvider = ({ children }: { children: React.ReactNode }) => {
    const setTasks = useBackgroundTaskStore((state) => state.setTasks);
    const setDismissedTaskIds = useBackgroundTaskStore((state) => state.setDismissedTaskIds);
    const [currentUser, setCurrentUser] = useState(auth ? auth.currentUser : null);
    const [tasksEnabled, setTasksEnabled] = useState(true);

    useEffect(() => {
        if (!auth) return;
        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
            if (!user) {
                setTasks([]);
                setDismissedTaskIds([]);
            }
        });
        return () => unsubscribeAuth();
    }, [setTasks, setDismissedTaskIds]);

    useEffect(() => {
        if (currentUser?.uid) {
            const loaded = loadDismissedTaskIds(currentUser.uid);
            setDismissedTaskIds(loaded);
        }
    }, [currentUser, setDismissedTaskIds]);

    useEffect(() => {
        if (!currentUser || !db || !tasksEnabled) {
            setTasks([]);
            return;
        }

        const q = query(
            collection(db, getPathString(PATHS.EXPORT_TASKS)),
            where('userId', '==', currentUser.uid),
            limit(50)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const updatedTasks: BackgroundTask[] = snapshot.docs
                .map((doc): BackgroundTask => ({
                    id: doc.id,
                    ...(doc.data() as Record<string, unknown>)
                }))
                .sort((a, b) => {
                    const aMs = typeof a?.createdAt?.toDate === 'function'
                        ? a.createdAt.toDate().getTime()
                        : 0;
                    const bMs = typeof b?.createdAt?.toDate === 'function'
                        ? b.createdAt.toDate().getTime()
                        : 0;
                    return bMs - aMs;
                })
                .slice(0, 10);
            setTasks(updatedTasks);

            // Check voor voltooide taken die nog een 'melding' nodig hebben
            const newlyCompleted = updatedTasks.find(t => t.status === 'completed' && !t.notified);
            if (newlyCompleted) {
                // Hier kun een browser notification of een UI toast triggeren
            }
        }, (error) => {
            const code = String(error?.code || "").toLowerCase();
            if (code.includes("permission-denied") || code.includes("insufficient")) {
                setTasksEnabled(false);
                setTasks([]);
                return;
            }
            console.error("Firestore BackgroundTask Error:", error);
        });

        return () => unsubscribe();
    }, [currentUser, tasksEnabled, setTasks]);

    return <>{children}</>;
};
