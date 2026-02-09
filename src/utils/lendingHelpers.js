// Lending logic for personnel (uitlenen)
// This file will contain helper functions and types for lending personnel to other departments/teams

export function getDefaultLendingState(person, structure) {
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

export function calculateLendingEndDate(startDate, durationDays) {
  const end = new Date(startDate);
  end.setDate(end.getDate() + durationDays);
  return end;
}

export function isLendingActive(lending) {
  if (!lending || !lending.isLent) return false;
  const now = new Date();
  const end = lending.endDate ? new Date(lending.endDate) : null;
  return !end || now <= end;
}

// Add more helpers as needed for team rotation, etc.
