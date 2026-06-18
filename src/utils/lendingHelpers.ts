// Lending logic for personnel (uitlenen)
// This file will contain helper functions and types for lending personnel to other departments/teams

type DateInput = Date | string | number;

interface LendingState {
  isLent: boolean;
  targetDepartmentId: string;
  targetShiftId: string;
  durationDays: number;
  autoReturn: boolean;
  startDate: Date;
  endDate: Date | null;
}

interface LendingPerson {
  lending?: Partial<LendingState>;
}

export function getDefaultLendingState(person: LendingPerson): LendingState {
  return {
    isLent: false,
    targetDepartmentId: '',
    targetShiftId: '',
    durationDays: 5,
    autoReturn: true,
    startDate: new Date(),
    endDate: null,
    ...person.lending,
  };
}

export function calculateLendingEndDate(startDate: DateInput, durationDays: number): Date {
  const end = new Date(startDate);
  end.setDate(end.getDate() + durationDays);
  return end;
}

export function isLendingActive(lending: Partial<LendingState> | null | undefined): boolean {
  if (!lending || !lending.isLent) return false;
  const now = new Date();
  const end = lending.endDate ? new Date(lending.endDate) : null;
  return !end || now <= end;
}

// Add more helpers as needed for team rotation, etc.
