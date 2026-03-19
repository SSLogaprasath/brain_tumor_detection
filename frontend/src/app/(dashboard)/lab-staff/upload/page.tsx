"use client";

import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { uploadMri, getMyLabProfile } from "@/lib/auth";
import { uploadMriSchema, type UploadMriForm } from "@/lib/schemas";
import { Upload, CheckCircle } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/context/ToastContext";
import TextInput from "@/components/ui/TextInput";
import TextArea from "@/components/ui/TextArea";

export default function UploadMriPage() {
  const { addToast } = useToast();
  const [labId, setLabId] = useState<number | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UploadMriForm>({
    resolver: zodResolver(uploadMriSchema),
    defaultValues: { patientId: "", scanDate: "", notes: "" },
  });

  const file = watch("file");

  useEffect(() => {
    getMyLabProfile()
      .then((lab) => setLabId(lab.labId))
      .catch(() => {});
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && f.name.endsWith(".h5")) {
      setValue("file", f, { shouldValidate: true });
    }
  };

  const onSubmit = async (values: UploadMriForm) => {
    if (!labId) return;

    setSubmitError("");
    setSuccess(false);

    try {
      await uploadMri(
        values.file,
        Number(values.patientId),
        labId,
        values.scanDate,
        values.notes || undefined,
      );
      setSuccess(true);
      reset();
      if (fileRef.current) fileRef.current.value = "";
      addToast("MRI uploaded successfully! AI inference started.", "success");
    } catch {
      setSubmitError("Upload failed. Please check the file and patient ID.");
      addToast("Upload failed. Please try again.", "error");
    }
  };

  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Upload MRI Scan</h1>

      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl">
        {!labId && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-lg mb-4 text-sm">
            Lab profile not found. Ensure your account is linked to a lab.
          </div>
        )}

        {submitError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
            {submitError}
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg mb-4 text-sm flex items-center gap-2">
            <CheckCircle size={16} />
            MRI uploaded successfully! AI inference has started.
            <Link
              href="/lab-staff/history"
              className="underline font-medium ml-1"
            >
              View history
            </Link>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* File Drop Zone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              MRI File (.h5) *
            </label>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all ${
                errors.file ? "border-red-400" : "border-gray-300"
              }`}
            >
              <Upload size={32} className="mx-auto text-gray-400 mb-2" />
              {file ? (
                <p className="text-sm text-gray-900 font-medium">
                  {file.name} ({(file.size / (1024 * 1024)).toFixed(1)} MB)
                </p>
              ) : (
                <p className="text-sm text-gray-500">
                  Drag and drop an H5 file here, or click to browse
                </p>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".h5"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setValue("file", f, { shouldValidate: true });
                }}
              />
            </div>
            {errors.file?.message && (
              <p className="mt-1 text-sm text-red-600">{errors.file.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <TextInput
              label="Patient ID"
              id="patientId"
              type="number"
              required
              error={errors.patientId?.message}
              {...register("patientId")}
            />

            <TextInput
              label="Scan Date"
              id="scanDate"
              type="date"
              required
              error={errors.scanDate?.message}
              {...register("scanDate")}
            />
          </div>

          <TextArea
            label="Notes (optional)"
            id="notes"
            rows={3}
            placeholder="Additional notes about the scan..."
            error={errors.notes?.message}
            {...register("notes")}
          />

          <button
            type="submit"
            disabled={isSubmitting || !file || !labId}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? "Uploading..." : "Upload & Start AI Analysis"}
          </button>
        </form>
      </div>
    </div>
  );
}
