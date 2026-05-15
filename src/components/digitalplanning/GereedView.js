import { jsx as _jsx } from "react/jsx-runtime";
import TerminalGereedTab from "./terminal/TerminalGereedTab";
const GereedView = ({ stationId, products = [] }) => {
    return (_jsx(TerminalGereedTab, { allTracked: products, stationId: stationId, effectiveStationId: stationId }));
};
export default GereedView;
