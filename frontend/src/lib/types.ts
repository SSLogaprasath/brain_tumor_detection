// TypeScript interfaces matching backend JPA entities

// === Auth ===
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  role: string;
  email: string;
  userId: number;
}

export interface RegisterRequest {
  userName: string;
  email: string;
  password: string;
  roleId: number;
  labName?: string; // for lab_staff registration
  labId?: number; // for radiologist registration
}

// === Entities ===
export interface Role {
  roleId: number;
  roleName: "admin" | "doctor" | "radiologist" | "lab_staff" | "patient";
}

export interface User {
  userId: number;
  userName: string;
  email: string;
  dob: string | null;
  role: Role;
  createdAt: string;
}

export interface Patient {
  patientId: number;
  patientName: string;
  patientDob: string;
  gender: "male" | "female" | "other";
  user: User;
  createdAt: string;
}

export interface Hospital {
  hospitalId: number;
  hospitalName: string;
  location: string | null;
  createdAt: string;
}

export interface Lab {
  labId: number;
  labName: string;
  user: User;
  createdAt: string;
}

export interface Radiologist {
  radiologistId: number;
  radiologistName: string;
  user: User;
  lab: Lab;
  createdAt: string;
}

export interface MriMetaData {
  mriId: number;
  patient: Patient;
  lab: Lab;
  mriPath: string;
  scanDate: string;
  volumeId: number | null;
  sliceCount: number | null;
  modality: string;
  notes: string | null;
  uploadedAt: string;
}

export interface AiPrediction {
  aiPredictionsId: number;
  mri: MriMetaData;
  maskFilePath: string | null;
  heatMapPath: string | null;
  rawMaskFilePath: string | null;
  flairImagePath: string | null;
  wtDice: number | null;
  tcDice: number | null;
  etDice: number | null;
  tumorDetected: boolean;
  tumorAreaMm2: number | null;
  estimatedRegion: string | null;
  modelVersion: string | null;
  status: "processing" | "done" | "failed" | "reviewed";
  predictedAt: string;
}

export interface RadiologistReview {
  reviewId: number;
  aiPrediction: AiPrediction;
  radiologist: Radiologist;
  modifiedMaskFilePath: string | null;
  diagnosis: string | null;
  reviewNotes: string | null;
  status: "pending" | "approved" | "rejected";
  reviewedAt: string | null;
  createdAt: string;
  reReviewRequested: boolean;
  reReviewRequestedBy: number | null;
  reReviewNotes: string | null;
}

export interface ReviewSubmitRequest {
  aiPredictionId: number;
  radiologistId: number;
  diagnosis: string;
  notes: string;
  status: "approved" | "rejected";
  modifiedMaskPath?: string;
  correctedTumorDetected?: boolean;
  correctedRegion?: string;
  correctedTumorAreaMm2?: number;
}

export interface AdminStats {
  totalUsers: number;
  totalMris: number;
  totalPredictions: number;
  pendingPredictions: number;
  totalReviews: number;
}
