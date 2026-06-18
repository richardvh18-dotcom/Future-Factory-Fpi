declare module "react-beautiful-dnd" {
  export type DropResult = {
    draggableId: string;
    source: { droppableId: string; index: number };
    destination?: { droppableId: string; index: number } | null;
  };

  export const DragDropContext: any;
  export const Droppable: any;
  export const Draggable: any;
}
