import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext } from "react";
const TeamleaderSelectionContext = createContext(null);
export const TeamleaderSelectionProvider = ({ value, children }) => {
    return (_jsx(TeamleaderSelectionContext.Provider, { value: value, children: children }));
};
export const useTeamleaderSelection = () => {
    const context = useContext(TeamleaderSelectionContext);
    if (!context) {
        throw new Error("useTeamleaderSelection must be used within TeamleaderSelectionProvider.");
    }
    return context;
};
