import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});
export type LoginForm = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    userName: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Please enter a valid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
    roleId: z.coerce.number(),
    labName: z.string().optional(),
    labId: z.coerce.number().optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine(
    (data) =>
      data.roleId !== 4 || (data.labName && data.labName.trim().length > 0),
    {
      message: "Lab name is required for Lab Staff",
      path: ["labName"],
    },
  )
  .refine((data) => data.roleId !== 3 || (data.labId && data.labId > 0), {
    message: "Please select a lab",
    path: ["labId"],
  });
export type RegisterForm = z.infer<typeof registerSchema>;

export const uploadMriSchema = z.object({
  patientId: z.string().min(1, "Patient ID is required"),
  scanDate: z.string().min(1, "Scan date is required"),
  file: z.instanceof(File, { message: "Please select an MRI file" }),
  notes: z.string().optional(),
});
export type UploadMriForm = z.infer<typeof uploadMriSchema>;

export const reviewSchema = z.object({
  diagnosis: z
    .string()
    .min(1, "Diagnosis is required")
    .max(200, "Diagnosis must be 200 characters or less"),
  notes: z.string().optional(),
  status: z.enum(["approved", "rejected"]),
});
export type ReviewForm = z.infer<typeof reviewSchema>;
