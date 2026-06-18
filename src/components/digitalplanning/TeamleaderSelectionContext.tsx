import React, { createContext, useContext, type ReactNode } from "react";

type TeamleaderSelectionContextValue = Record<string, unknown>;

const TeamleaderSelectionContext = createContext<TeamleaderSelectionContextValue | null>(null);

interface TeamleaderSelectionProviderProps {
  value: TeamleaderSelectionContextValue;
  children: ReactNode;
}

export const TeamleaderSelectionProvider = ({ value, children }: TeamleaderSelectionProviderProps) => {
  return (
    <TeamleaderSelectionContext.Provider value={value}>
      {children}
    </TeamleaderSelectionContext.Provider>
  );
};

export const useTeamleaderSelection = () => {
  const context = useContext(TeamleaderSelectionContext);
  if (!context) {
    throw new Error("useTeamleaderSelection must be used within TeamleaderSelectionProvider.");
  }
  return context;
};