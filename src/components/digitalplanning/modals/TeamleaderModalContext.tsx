import React, { createContext, useContext, type ReactNode } from "react";
import { create } from "zustand";

type TeamleaderModalContextValue = Record<string, unknown>;

const TeamleaderModalContext = createContext<TeamleaderModalContextValue | null>(null);

type NewOrderData = {
	orderId: string;
	item: string;
	machine: string;
	plan: string;
};

type TeamleaderModalState = {
	showAddOrderModal: boolean;
	creatingOrder: boolean;
	newOrderData: NewOrderData;
	selectedStationDetail: string | null;
	activeKpi: string | null;
	lastKpi: string | null;
	kpiWeekOffset: number;
	modalTitle: string;
	viewingDossier: any;
	selectedOverproductionGroup: any;
	overproductionTargetOrderId: string;
	overproductionManualStation: string;
	assigningOverproduction: boolean;
	showExportModal: boolean;
	exportTrackingTaskId: string | null;
	exportModalType: string;
	exportModalLocked: boolean;
	exportPreloadedTask: any;
	setShowAddOrderModal: (value: boolean) => void;
	setCreatingOrder: (value: boolean) => void;
	setNewOrderData: (value: NewOrderData | ((prev: NewOrderData) => NewOrderData)) => void;
	setSelectedStationDetail: (value: string | null) => void;
	setActiveKpi: (value: string | null) => void;
	setLastKpi: (value: string | null) => void;
	setKpiWeekOffset: (value: number | ((prev: number) => number)) => void;
	setModalTitle: (value: string) => void;
	setViewingDossier: (value: any) => void;
	setSelectedOverproductionGroup: (value: any) => void;
	setOverproductionTargetOrderId: (value: string) => void;
	setOverproductionManualStation: (value: string) => void;
	setAssigningOverproduction: (value: boolean) => void;
	setShowExportModal: (value: boolean) => void;
	setExportTrackingTaskId: (value: string | null) => void;
	setExportModalType: (value: string) => void;
	setExportModalLocked: (value: boolean) => void;
	setExportPreloadedTask: (value: any) => void;
};

const initialNewOrderData: NewOrderData = {
	orderId: "",
	item: "",
	machine: "",
	plan: "",
};

export const useTeamleaderModalStore = create<TeamleaderModalState>((set) => ({
	showAddOrderModal: false,
	creatingOrder: false,
	newOrderData: initialNewOrderData,
	selectedStationDetail: null,
	activeKpi: null,
	lastKpi: null,
	kpiWeekOffset: 0,
	modalTitle: "",
	viewingDossier: null,
	selectedOverproductionGroup: null,
	overproductionTargetOrderId: "",
	overproductionManualStation: "",
	assigningOverproduction: false,
	showExportModal: false,
	exportTrackingTaskId: null,
	exportModalType: "planning",
	exportModalLocked: false,
	exportPreloadedTask: null,
	setShowAddOrderModal: (value) => set({ showAddOrderModal: value }),
	setCreatingOrder: (value) => set({ creatingOrder: value }),
	setNewOrderData: (value) =>
		set((state) => ({
			newOrderData: typeof value === "function" ? value(state.newOrderData) : value,
		})),
	setSelectedStationDetail: (value) => set({ selectedStationDetail: value }),
	setActiveKpi: (value) => set({ activeKpi: value }),
	setLastKpi: (value) => set({ lastKpi: value }),
	setKpiWeekOffset: (value) =>
		set((state) => ({
			kpiWeekOffset: typeof value === "function" ? value(state.kpiWeekOffset) : value,
		})),
	setModalTitle: (value) => set({ modalTitle: value }),
	setViewingDossier: (value) => set({ viewingDossier: value }),
	setSelectedOverproductionGroup: (value) => set({ selectedOverproductionGroup: value }),
	setOverproductionTargetOrderId: (value) => set({ overproductionTargetOrderId: value }),
	setOverproductionManualStation: (value) => set({ overproductionManualStation: value }),
	setAssigningOverproduction: (value) => set({ assigningOverproduction: value }),
	setShowExportModal: (value) => set({ showExportModal: value }),
	setExportTrackingTaskId: (value) => set({ exportTrackingTaskId: value }),
	setExportModalType: (value) => set({ exportModalType: value }),
	setExportModalLocked: (value) => set({ exportModalLocked: value }),
	setExportPreloadedTask: (value) => set({ exportPreloadedTask: value }),
}));

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
