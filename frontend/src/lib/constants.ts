export const ROLE_IDS = {
  admin: 1,
  doctor: 2,
  radiologist: 3,
  lab_staff: 4,
  patient: 5,
} as const;

export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  doctor: "Doctor",
  radiologist: "Radiologist",
  lab_staff: "Lab Staff",
  patient: "Patient",
};

export const ROLE_DASHBOARDS: Record<string, string> = {
  admin: "/admin",
  doctor: "/doctor",
  radiologist: "/radiologist",
  lab_staff: "/lab-staff",
  patient: "/patient",
};

export const PREDICTION_STATUS_COLORS: Record<string, string> = {
  processing: "bg-yellow-100 text-yellow-800",
  done: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  reviewed: "bg-blue-100 text-blue-800",
};

export const REVIEW_STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

export const REGISTER_ROLES = [
  { id: 2, label: "Doctor" },
  { id: 3, label: "Radiologist" },
  { id: 4, label: "Lab Staff" },
  { id: 5, label: "Patient" },
];
