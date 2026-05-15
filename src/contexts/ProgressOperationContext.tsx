import React, { createContext, useContext, useRef, useState, useCallback } from 'react';

type ProgressOperation = {
  lotNumber: string;
  status: string;
  timestamp: number;
};

type ProgressOperationEntry = { id: string } & ProgressOperation;

type ProgressOperationContextValue = {
  operationsRef: React.MutableRefObject<Map<string, ProgressOperation>>;
  operationCount: number;
  addOperation: (operationId: string, lotNumber: string) => void;
  updateOperation: (operationId: string, status: string) => void;
  removeOperation: (operationId: string) => void;
  clearOperations: () => void;
  getOperations: () => ProgressOperationEntry[];
};

const ProgressOperationContext = createContext<ProgressOperationContextValue | null>(null);

export const useProgressOperations = () => {
  const context = useContext(ProgressOperationContext);
  if (!context) {
    throw new Error('useProgressOperations must be used within ProgressOperationProvider');
  }
  return context;
};

type ProgressOperationProviderProps = {
  children: React.ReactNode;
};

export const ProgressOperationProvider = ({ children }: ProgressOperationProviderProps) => {
  const operationsRef = useRef<Map<string, ProgressOperation>>(new Map()); // Map<operationId, {lotNumber, status, timestamp}>
  const [operationCount, setOperationCount] = useState(0); // Trigger re-renders

  const addOperation = useCallback((operationId: string, lotNumber: string) => {
    operationsRef.current.set(operationId, {
      lotNumber,
      status: "Bezig...",
      timestamp: Date.now(),
    });
    setOperationCount(operationsRef.current.size);
  }, []);

  const updateOperation = useCallback((operationId: string, status: string) => {
    if (operationsRef.current.has(operationId)) {
      const op = operationsRef.current.get(operationId);
      if (!op) return;
      operationsRef.current.set(operationId, {
        ...op,
        status,
        timestamp: Date.now(),
      });
      setOperationCount(operationsRef.current.size);
    }
  }, []);

  const removeOperation = useCallback((operationId: string) => {
    operationsRef.current.delete(operationId);
    setOperationCount(operationsRef.current.size);
  }, []);

  const clearOperations = useCallback(() => {
    operationsRef.current.clear();
    setOperationCount(0);
  }, []);

  const getOperations = useCallback((): ProgressOperationEntry[] => {
    return Array.from(operationsRef.current.entries()).map(([id, op]) => ({
      id,
      ...op,
    }));
  }, [operationsRef]);

  const value = {
    operationsRef,
    operationCount,
    addOperation,
    updateOperation,
    removeOperation,
    clearOperations,
    getOperations,
  };

  return (
    <ProgressOperationContext.Provider value={value}>
      {children}
    </ProgressOperationContext.Provider>
  );
};
