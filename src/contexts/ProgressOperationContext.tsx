import { create } from "zustand";

const MAX_OPERATION_AGE_MS = 2 * 60 * 1000;

const pruneStaleOperations = (operations: Record<string, ProgressOperation>, now = Date.now()) =>
  Object.fromEntries(
    Object.entries(operations).filter(([, operation]) => now - Number(operation?.timestamp || 0) <= MAX_OPERATION_AGE_MS)
  );

export type ProgressOperation = {
  lotNumber: string;
  status: string;
  timestamp: number;
};

export type ProgressOperationEntry = { id: string } & ProgressOperation;

export interface ProgressOperationStore {
  operations: Record<string, ProgressOperation>;
  addOperation: (operationId: string, lotNumber: string) => void;
  updateOperation: (operationId: string, status: string) => void;
  removeOperation: (operationId: string) => void;
  clearOperations: () => void;
}

export const useProgressOperationsStore = create<ProgressOperationStore>((set) => ({
  operations: {},
  addOperation: (operationId, lotNumber) =>
    set((state) => {
      const now = Date.now();
      const nextOperations = pruneStaleOperations(state.operations, now);
      return {
        operations: {
          ...nextOperations,
        [operationId]: {
          lotNumber,
          status: "Bezig...",
          timestamp: now,
        },
      },
      };
    }),
  updateOperation: (operationId, status) =>
    set((state) => {
      const now = Date.now();
      const nextOperations = pruneStaleOperations(state.operations, now);
      const current = nextOperations[operationId];
      if (!current) return state;

      return {
        operations: {
          ...nextOperations,
          [operationId]: {
            ...current,
            status,
            timestamp: now,
          },
        },
      };
    }),
  removeOperation: (operationId) =>
    set((state) => {
      const next = { ...state.operations };
      delete next[operationId];
      return { operations: next };
    }),
  clearOperations: () => set({ operations: {} }),
}));
