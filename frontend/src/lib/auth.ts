import api from "./api";
import type {
  LoginRequest,
  LoginResponse,
  RegisterRequest,
  MriMetaData,
  AiPrediction,
  RadiologistReview,
  ReviewSubmitRequest,
  Patient,
  Radiologist,
  Lab,
  User,
  Hospital,
  AdminStats,
} from "./types";

// Auth
export async function loginUser(data: LoginRequest): Promise<LoginResponse> {
  const res = await api.post<LoginResponse>("/auth/login", data);
  return res.data;
}

export async function registerUser(
  data: RegisterRequest,
): Promise<{ message: string }> {
  const res = await api.post<{ message: string }>("/auth/register", data);
  return res.data;
}

export async function getLabsForRegistration(): Promise<Lab[]> {
  const res = await api.get<Lab[]>("/auth/labs");
  return res.data;
}

// MRI
export async function uploadMri(
  file: File,
  patientId: number,
  labId: number,
  scanDate: string,
  notes?: string,
): Promise<MriMetaData> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("patientId", String(patientId));
  formData.append("labId", String(labId));
  formData.append("scanDate", scanDate);
  if (notes) formData.append("notes", notes);

  const res = await api.post<MriMetaData>("/mri/upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

export async function getMrisByPatient(
  patientId: number,
): Promise<MriMetaData[]> {
  const res = await api.get<MriMetaData[]>(`/mri/patient/${patientId}`);
  return res.data;
}

export async function getMriById(mriId: number): Promise<MriMetaData> {
  const res = await api.get<MriMetaData>(`/mri/${mriId}`);
  return res.data;
}

export async function getMrisByLab(labId: number): Promise<MriMetaData[]> {
  const res = await api.get<MriMetaData[]>(`/mri/lab/${labId}`);
  return res.data;
}

// Review
export async function getPendingPredictions(): Promise<AiPrediction[]> {
  const res = await api.get<AiPrediction[]>("/review/pending");
  return res.data;
}

export async function getPrediction(id: number): Promise<AiPrediction> {
  const res = await api.get<AiPrediction>(`/review/prediction/${id}`);
  return res.data;
}

export async function submitReview(
  data: ReviewSubmitRequest,
): Promise<RadiologistReview> {
  const res = await api.post<RadiologistReview>("/review/submit", data);
  return res.data;
}

export async function uploadModifiedMask(
  file: Blob,
  predictionId: number,
): Promise<{ filePath: string }> {
  const formData = new FormData();
  formData.append("file", file, "modified_mask.png");
  formData.append("predictionId", String(predictionId));

  const res = await api.post<{ filePath: string }>(
    "/review/upload-mask",
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return res.data;
}

export async function getNextPendingPredictionId(
  currentId: number,
): Promise<number | null> {
  const pending = await getPendingPredictions();
  const next = pending.find((p) => p.aiPredictionsId !== currentId);
  return next?.aiPredictionsId ?? null;
}

// Re-Review
export async function requestReReview(
  predictionId: number,
  notes: string,
): Promise<RadiologistReview> {
  const res = await api.post<RadiologistReview>(
    `/review/${predictionId}/request-re-review`,
    { notes },
  );
  return res.data;
}

export async function getReReviewRequests(): Promise<RadiologistReview[]> {
  const res = await api.get<RadiologistReview[]>("/review/re-review-requests");
  return res.data;
}

export async function getReviewsByRadiologist(
  radiologistId: number,
): Promise<RadiologistReview[]> {
  const res = await api.get<RadiologistReview[]>(
    `/review/radiologist/${radiologistId}`,
  );
  return res.data;
}

// Profile endpoints
export async function getMyPatientProfile(): Promise<Patient> {
  const res = await api.get<Patient>("/patient/me");
  return res.data;
}

export async function getMyRadiologistProfile(): Promise<Radiologist> {
  const res = await api.get<Radiologist>("/radiologist/me");
  return res.data;
}

export async function getMyLabProfile(): Promise<Lab> {
  const res = await api.get<Lab>("/lab/me");
  return res.data;
}

// Admin
export async function getAllUsers(): Promise<User[]> {
  const res = await api.get<User[]>("/admin/users");
  return res.data;
}

export async function getAllHospitals(): Promise<Hospital[]> {
  const res = await api.get<Hospital[]>("/admin/hospitals");
  return res.data;
}

export async function getAllLabs(): Promise<Lab[]> {
  const res = await api.get<Lab[]>("/admin/labs");
  return res.data;
}

export async function getAdminStats(): Promise<AdminStats> {
  const res = await api.get<AdminStats>("/admin/stats");
  return res.data;
}
