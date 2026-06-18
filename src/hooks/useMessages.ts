import { useState, useEffect } from "react";
import { subscribeMessages } from "../repositories/planningRepository";
import type { User } from "firebase/auth";

interface Message {
  id: string;
  timestamp: Date;
  [key: string]: unknown;
}

interface UseMessagesResult {
  messages: Message[];
  loading: boolean;
}

/**
 * useMessages - Haalt berichten op uit de nieuwe root-structuur.
 */
export const useMessages = (user: User | null | undefined): UseMessagesResult => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!user || !user.email) {
      setMessages([]);
      setLoading(false);
      return;
    }

    const unsubscribe = subscribeMessages(
      user.email,
      (docs: import("firebase/firestore").QueryDocumentSnapshot[]) => {
        const msgs: Message[] = docs.map((doc) => {
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
      },
      (err: Error) => {
        console.error("Berichten database error (Check Rules):", err);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [user]);

  return { messages, loading };
};
