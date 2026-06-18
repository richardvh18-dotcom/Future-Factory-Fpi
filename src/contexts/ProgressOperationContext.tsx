import { create } from "zustand";

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
    set((state) => ({
      operations: {
        ...state.operations,
        [operationId]: {
          lotNumber,
          status: "Bezig...",
          timestamp: Date.now(),
        },
      },
    })),
  updateOperation: (operationId, status) =>
    set((state) => {
      const current = state.operations[operationId];
      if (!current) return state;

      return {
        operations: {
          ...state.operations,
          [operationId]: {
            ...current,
            status,
            timestamp: Date.now(),
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
