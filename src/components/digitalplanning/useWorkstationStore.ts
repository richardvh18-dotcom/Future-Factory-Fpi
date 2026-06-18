import { create } from 'zustand';

type PlanningOrder = Record<string, any>;

export interface WorkstationState {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (isOpen: boolean) => void;

  // Product Detail Modal
  linkedProductData: any | null;
  setLinkedProductData: (data: any | null) => void;

  // Post-processing Modals
  finishModalOpen: boolean;
  setFinishModalOpen: (show: boolean) => void;
  itemToFinish: any | null;
  setItemToFinish: (item: any | null) => void;
  showRepairModal: boolean;
  setShowRepairModal: (show: boolean) => void;
  itemToRepair: any | null;
  setItemToRepair: (item: any | null) => void;

  // Operator Check-in Modal
  showOperatorCheckinModal: boolean;
  setShowOperatorCheckinModal: (show: boolean) => void;
  operatorBadgeInput: string;
  setOperatorBadgeInput: (input: string) => void;
  isCheckingInOperator: boolean;
  setIsCheckingInOperator: (val: boolean) => void;

  // Hour Correction Modal
  showHourCorrectionModal: boolean;
  setShowHourCorrectionModal: (show: boolean) => void;
  hourCorrectionEntry: any | null;
  setHourCorrectionEntry: (entry: any | null) => void;
  correctedHours: string;
  setCorrectedHours: (val: string) => void;
  correctionReason: string;
  setCorrectionReason: (val: string) => void;
  isSavingCorrection: boolean;
  setIsSavingCorrection: (val: boolean) => void;

  // Production Start & Link Modals
  selectedOrder: PlanningOrder | null;
  setSelectedOrder: (order: PlanningOrder | null) => void;
  showStartModal: boolean;
  setShowStartModal: (show: boolean) => void;
  orderToLink: PlanningOrder | null;
  setOrderToLink: (order: PlanningOrder | null) => void;
  showLinkModal: boolean;
  setShowLinkModal: (show: boolean) => void;
}

export const useWorkstationStore = create<WorkstationState>((set) => ({
  activeTab: 'terminal',
  setActiveTab: (tab) => set({ activeTab: tab }),
  isMobileMenuOpen: false,
  setIsMobileMenuOpen: (isOpen) => set({ isMobileMenuOpen: isOpen }),

  linkedProductData: null,
  setLinkedProductData: (data) => set({ linkedProductData: data }),

  finishModalOpen: false,
  setFinishModalOpen: (show) => set({ finishModalOpen: show }),
  itemToFinish: null,
  setItemToFinish: (item) => set({ itemToFinish: item }),
  showRepairModal: false,
  setShowRepairModal: (show) => set({ showRepairModal: show }),
  itemToRepair: null,
  setItemToRepair: (item) => set({ itemToRepair: item }),

  showOperatorCheckinModal: false,
  setShowOperatorCheckinModal: (show) => set({ showOperatorCheckinModal: show }),
  operatorBadgeInput: '',
  setOperatorBadgeInput: (input) => set({ operatorBadgeInput: input }),
  isCheckingInOperator: false,
  setIsCheckingInOperator: (val) => set({ isCheckingInOperator: val }),

  showHourCorrectionModal: false,
  setShowHourCorrectionModal: (show) => set({ showHourCorrectionModal: show }),
  hourCorrectionEntry: null,
  setHourCorrectionEntry: (entry) => set({ hourCorrectionEntry: entry }),
  correctedHours: '',
  setCorrectedHours: (val) => set({ correctedHours: val }),
  correctionReason: '',
  setCorrectionReason: (val) => set({ correctionReason: val }),
  isSavingCorrection: false,
  setIsSavingCorrection: (val) => set({ isSavingCorrection: val }),

  selectedOrder: null,
  setSelectedOrder: (order) => set({ selectedOrder: order }),
  showStartModal: false,
  setShowStartModal: (show) => set({ showStartModal: show }),
  orderToLink: null,
  setOrderToLink: (order) => set({ orderToLink: order }),
  showLinkModal: false,
  setShowLinkModal: (show) => set({ showLinkModal: show }),
}));