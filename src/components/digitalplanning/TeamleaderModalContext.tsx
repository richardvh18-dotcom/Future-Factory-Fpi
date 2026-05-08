import React, { createContext, useContext, type ReactNode } from "react";

type TeamleaderModalContextValue = Record<string, unknown>;

const TeamleaderModalContext = createContext<TeamleaderModalContextValue | null>(null);

interface TeamleaderModalProviderProps {
  value: TeamleaderModalContextValue;
  children: ReactNode;
}

export const TeamleaderModalProvider = ({ value, children }: TeamleaderModalProviderProps) => {
  return (
    <TeamleaderModalContext.Provider value={value}>
      {children}
    </TeamleaderModalContext.Provider>
  );
};

export const useTeamleaderModal = () => {
  const context = useContext(TeamleaderModalContext);
  if (!context) {
    throw new Error("useTeamleaderModal must be used within TeamleaderModalProvider.");
  }
  return context;
};