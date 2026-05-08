// @ts-nocheck
import React, { createContext, useContext, useState, useEffect } from 'react';
import { db, auth } from '../config/firebase';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

const BackgroundTaskContext = createContext({
    tasks: [],
    downloadTaskResult: () => {}
});

export const BackgroundTaskProvider = ({ children }) => {
    const [tasks, setTasks] = useState([]);
    const [currentUser, setCurrentUser] = useState(auth ? auth.currentUser : null);
    const [tasksEnabled, setTasksEnabled] = useState(true);

    useEffect(() => {
        if (!auth) return;
        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
        });
        return () => unsubscribeAuth();
    }, []);

    useEffect(() => {
        if (!currentUser || !db || !tasksEnabled) {
            setTasks([]);
            return;
        }

        const q = query(
            collection(db, 'future-factory/exports/tasks'),
            where('userId', '==', currentUser.uid),
            orderBy('createdAt', 'desc'),
            limit(10)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const updatedTasks = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setTasks(updatedTasks);

            // Check voor voltooide taken die nog een 'melding' nodig hebben
            const newlyCompleted = updatedTasks.find(t => t.status === 'completed' && !t.notified);
            if (newlyCompleted) {
                // Hier kun een browser notification of een UI toast triggeren
                console.log(`Taak voltooid: ${newlyCompleted.taskName}`);
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
    }, [currentUser, tasksEnabled]);

    const downloadTaskResult = (task) => {
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
    };

    const b64toBlob = (b64Data, contentType = '', sliceSize = 512) => {
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

    return (
        <BackgroundTaskContext.Provider value={{ tasks, downloadTaskResult }}>
            {children}
        </BackgroundTaskContext.Provider>
    );
};

export const useBackgroundTasks = () => useContext(BackgroundTaskContext);
