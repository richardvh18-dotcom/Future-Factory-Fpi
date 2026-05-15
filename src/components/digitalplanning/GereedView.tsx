import React from "react";
import TerminalGereedTab from "./terminal/TerminalGereedTab";

interface GereedViewProps {
  stationId?: string;
  products?: unknown[];
}

const GereedView = ({ stationId, products = [] }: GereedViewProps) => {
  return (
    <TerminalGereedTab
      allTracked={products as never[]}
      stationId={stationId}
      effectiveStationId={stationId}
    />
  );
};

export default GereedView;