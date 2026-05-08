import React, { createContext, useContext, useRef, useState, useCallback } from 'react';

const ProgressOperationContext = createContext<any>(null!);

export const useProgressOperations = () => {
  const context = useContext(ProgressOperationContext);
  if (!context) {
    throw new Error('useProgressOperations must be used within ProgressOperationProvider');
  }
  return context;
};

export const ProgressOperationProvider = ({ children }) => {
  const operationsRef = useRef(new Map()); // Map<operationId, {lotNumber, status, timestamp}>
  const [operationCount, setOperationCount] = useState(0); // Trigger re-renders

  const addOperation = useCallback((operationId, lotNumber) => {
    operationsRef.current.set(operationId, {
      lotNumber,
      status: "Bezig...",
      timestamp: Date.now(),
    });
    setOperationCount(operationsRef.current.size);
  }, []);

  const updateOperation = useCallback((operationId, status) => {
    if (operationsRef.current.has(operationId)) {
      const op = operationsRef.current.get(operationId);
      operationsRef.current.set(operationId, {
        ...op,
        status,
        timestamp: Date.now(),
      });
      setOperationCount(operationsRef.current.size);
    }
  }, []);

  const removeOperation = useCallback((operationId) => {
    operationsRef.current.delete(operationId);
    setOperationCount(operationsRef.current.size);
  }, []);

  const clearOperations = useCallback(() => {
    operationsRef.current.clear();
    setOperationCount(0);
  }, []);

  const getOperations = useCallback(() => {
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
