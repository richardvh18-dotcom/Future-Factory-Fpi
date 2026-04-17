import { useState, useEffect } from "react";
import { db } from "../config/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { PATHS } from "../config/dbPaths"; // Importeer de centrale paden

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

    // Gebruik het nieuwe pad: /future-factory/production/messages
    const messagesRef = collection(db, ...PATHS.MESSAGES);

    const q = query(messagesRef, where("to", "==", user.email.toLowerCase()));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const msgs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          timestamp: doc.data().timestamp?.toDate
            ? doc.data().timestamp.toDate()
            : new Date(),
        }));

        msgs.sort((a, b) => b.timestamp - a.timestamp);
        setMessages(msgs);
        setLoading(false);
      },
      (err) => {
        console.error("Berichten database error (Check Rules):", err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  return { messages, loading };
};
