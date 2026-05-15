import { useState, useEffect } from "react";
import { subscribeMessages } from "../repositories/planningRepository";
/**
 * useMessages - Haalt berichten op uit de nieuwe root-structuur.
 */
export const useMessages = (user) => {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        if (!user || !user.email) {
            setMessages([]);
            setLoading(false);
            return;
        }
        const unsubscribe = subscribeMessages(user.email, (docs) => {
            const msgs = docs.map((doc) => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    timestamp: data.timestamp?.toDate
                        ? data.timestamp.toDate()
                        : new Date(),
                };
            });
            msgs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
            setMessages(msgs);
            setLoading(false);
        }, (err) => {
            console.error("Berichten database error (Check Rules):", err);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [user]);
    return { messages, loading };
};
