import React from "react";
import TerminalGereedTab from "./terminal/TerminalGereedTab";

const GereedView = ({ stationId, products = [] }) => {
  return (
    <TerminalGereedTab
      allTracked={products}
      stationId={stationId}
      effectiveStationId={stationId}
    />
  );
};

export default GereedView;
