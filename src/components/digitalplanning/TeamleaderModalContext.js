import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext } from "react";
const TeamleaderModalContext = createContext(null);
export const TeamleaderModalProvider = ({ value, children }) => {
    return (_jsx(TeamleaderModalContext.Provider, { value: value, children: children }));
};
export const useTeamleaderModal = () => {
    const context = useContext(TeamleaderModalContext);
    if (!context) {
        throw new Error("useTeamleaderModal must be used within TeamleaderModalProvider.");
    }
    return context;
};
