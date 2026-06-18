import { useState, useEffect, useRef } from 'react';

// Wachttijd in milliseconden voordat we naar LocalStorage schrijven.
// Dit voorkomt dat we bij elke toetsaanslag schrijven.
const DEBOUNCE_DELAY = 500;

/**
 * Een custom hook die de state van een formulier automatisch persistent maakt in LocalStorage.
 * @param storageKey Een unieke sleutel voor dit specifieke formulier.
 * @param initialState De beginstaat van het formulier.
 * @returns Een array met [state, setState, clearPersistedData].
 */
export function useFormPersistence<T>(storageKey: string, initialState: T): [T, React.Dispatch<React.SetStateAction<T>>, () => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const storedValue = window.localStorage.getItem(storageKey);
      if (storedValue) {
        return JSON.parse(storedValue);
      }
    } catch (error) {
      console.error(`Fout bij lezen uit localStorage voor sleutel "${storageKey}":`, error);
      window.localStorage.removeItem(storageKey);
    }
    return initialState;
  });

  const debounceTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);

    debounceTimeoutRef.current = window.setTimeout(() => {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    }, DEBOUNCE_DELAY);

    return () => { if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current); };
  }, [storageKey, state]);

  const clearPersistedData = () => window.localStorage.removeItem(storageKey);

  return [state, setState, clearPersistedData];
}