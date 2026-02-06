import React from "react";
import { Gantt, ViewMode } from "gantt-task-react";
import "gantt-task-react/dist/index.css";

const tasks = [
  {
    start: new Date(),
    end: new Date(new Date().setDate(new Date().getDate() + 2)),
    name: "Voorbeeld taak",
    id: "Task 1",
    type: "task",
    progress: 45,
    isDisabled: false,
    styles: { progressColor: "#ff9900", progressSelectedColor: "#ff6600" },
  },
  {
    start: new Date(new Date().setDate(new Date().getDate() + 1)),
    end: new Date(new Date().setDate(new Date().getDate() + 4)),
    name: "Order 2",
    id: "Task 2",
    type: "task",
    progress: 20,
    isDisabled: false,
  },
];

const GanttPlanning = () => {
  return (
    <div style={{ background: "#fff", borderRadius: 24, padding: 16 }}>
      <Gantt tasks={tasks} viewMode={ViewMode.Day} />
    </div>
  );
};

export default GanttPlanning;
