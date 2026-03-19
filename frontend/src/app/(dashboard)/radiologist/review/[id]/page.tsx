"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  getPrediction,
  submitReview,
  getMyRadiologistProfile,
  getNextPendingPredictionId,
  getReReviewRequests,
} from "@/lib/auth";
import type { AiPrediction, RadiologistReview } from "@/lib/types";
import { reviewSchema, type ReviewForm } from "@/lib/schemas";
import { formatDateTime } from "@/lib/utils";
import StatusBadge from "@/components/domain/StatusBadge";
import DiceScoreBar from "@/components/domain/DiceScoreBar";
import SegmentationEditor from "@/components/domain/SegmentationEditor";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import DetailSkeleton from "@/components/ui/DetailSkeleton";
import ErrorState from "@/components/ui/ErrorState";
import TextInput from "@/components/ui/TextInput";
import TextArea from "@/components/ui/TextArea";
import RadioGroup from "@/components/ui/RadioGroup";
import Link from "next/link";
import { useToast } from "@/context/ToastContext";
import {
  Pencil,
  Columns2,
  Layers,
  SlidersHorizontal,
  AlertTriangle,
} from "lucide-react";

type ViewMode = "side-by-side" | "overlay" | "slider";
type SubmitMode = "default" | "next";

export default function ReviewPage() {
  const params = useParams();
  const router = useRouter();
  const { addToast } = useToast();
  const id = Number(params.id);

  const [prediction, setPrediction] = useState<AiPrediction | null>(null);
  const [radiologistId, setRadiologistId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitMode, setSubmitMode] = useState<SubmitMode>("default");
  const [reReviewInfo, setReReviewInfo] = useState<RadiologistReview | null>(null);

  // Correction fields — initialized from prediction once loaded
  const [editingPrediction, setEditingPrediction] = useState(false);
  const [corrTumorDetected, setCorrTumorDetected] = useState(false);
  const [corrRegion, setCorrRegion] = useState("");
  const [corrTumorArea, setCorrTumorArea] = useState("");
  const [modifiedMaskPath, setModifiedMaskPath] = useState<string | null>(null);
  const [editingMask, setEditingMask] = useState(false);

  // Image toggle modes
  const [viewMode, setViewMode] = useState<ViewMode>("side-by-side");
  const [overlayOpacity, setOverlayOpacity] = useState(50);
  const [sliderPos, setSliderPos] = useState(50);
  const sliderContainerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  // react-hook-form for the 3 review form fields
  const {
    register,
    handleSubmit: rhfHandleSubmit,
    watch,
    setValue: setFormValue,
    formState: { errors },
  } = useForm<ReviewForm>({
    resolver: zodResolver(reviewSchema),
    defaultValues: { diagnosis: "", notes: "", status: "approved" },
  });

  const statusValue = watch("status");

  const fetchData = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setFetchError(false);
    Promise.all([
      getPrediction(id),
      getMyRadiologistProfile(),
      getReReviewRequests().catch(() => []),
    ])
      .then(([pred, profile, reReviews]) => {
        setPrediction(pred);
        setRadiologistId(profile.radiologistId);
        setCorrTumorDetected(pred.tumorDetected);
        setCorrRegion(pred.estimatedRegion ?? "");
        setCorrTumorArea(
          pred.tumorAreaMm2 != null ? String(pred.tumorAreaMm2) : "",
        );
        const match = (reReviews as RadiologistReview[]).find(
          (r) => r.aiPrediction.aiPredictionsId === id,
        );
        setReReviewInfo(match ?? null);
      })
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openConfirm = (mode: SubmitMode) => {
    setSubmitMode(mode);
    setConfirmOpen(true);
  };

  const handleFormSubmit = (mode: SubmitMode) => {
    return rhfHandleSubmit(() => {
      if (!radiologistId || !prediction) return;
      openConfirm(mode);
    })();
  };

  const handleConfirmedSubmit = async () => {
    setConfirmOpen(false);
    if (!radiologistId || !prediction) return;

    setSubmitting(true);
    setSubmitError("");

    const formDiagnosis = watch("diagnosis");
    const formNotes = watch("notes");
    const formStatus = watch("status");

    try {
      const hasCorrections =
        corrTumorDetected !== prediction.tumorDetected ||
        corrRegion !== (prediction.estimatedRegion ?? "") ||
        corrTumorArea !==
          (prediction.tumorAreaMm2 != null
            ? String(prediction.tumorAreaMm2)
            : "");

      await submitReview({
        aiPredictionId: prediction.aiPredictionsId,
        radiologistId,
        diagnosis: formDiagnosis,
        notes: formNotes ?? "",
        status: formStatus,
        ...(modifiedMaskPath && { modifiedMaskPath }),
        ...(hasCorrections && {
          correctedTumorDetected: corrTumorDetected,
          correctedRegion: corrRegion || undefined,
          correctedTumorAreaMm2: corrTumorArea
            ? parseFloat(corrTumorArea)
            : undefined,
        }),
      });

      if (submitMode === "next") {
        const nextId = await getNextPendingPredictionId(
          prediction.aiPredictionsId,
        );
        if (nextId) {
          addToast("Review submitted — loading next scan", "success");
          router.push(`/radiologist/review/${nextId}`);
        } else {
          addToast("Review submitted — no more pending", "success");
          router.push("/radiologist");
        }
      } else {
        addToast("Review submitted successfully", "success");
        router.push("/radiologist");
      }
    } catch {
      setSubmitError("Failed to submit review. Please try again.");
      addToast("Failed to submit review", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Slider drag handlers
  const updateSliderPos = (clientX: number) => {
    if (!sliderContainerRef.current) return;
    const rect = sliderContainerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPos(pct);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    isDragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateSliderPos(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    updateSliderPos(e.clientX);
  };

  const handlePointerUp = () => {
    isDragging.current = false;
  };

  if (loading) {
    return (
      <div>
        <Link
          href="/radiologist"
          className="text-sm text-blue-600 hover:text-blue-700 mb-4 inline-block"
        >
          &larr; Back to pending reviews
        </Link>
        <DetailSkeleton />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div>
        <Link
          href="/radiologist"
          className="text-sm text-blue-600 hover:text-blue-700 mb-4 inline-block"
        >
          &larr; Back to pending reviews
        </Link>
        <ErrorState
          message="Failed to load prediction. Please try again."
          onRetry={fetchData}
        />
      </div>
    );
  }

  if (!prediction) {
    return (
      <div>
        <Link
          href="/radiologist"
          className="text-sm text-blue-600 hover:text-blue-700 mb-4 inline-block"
        >
          &larr; Back to pending reviews
        </Link>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
          Prediction not found.
        </div>
      </div>
    );
  }

  const flairSrc = prediction.flairImagePath ?? prediction.maskFilePath;
  const maskSrc = prediction.maskFilePath ?? prediction.heatMapPath;

  return (
    <div className="animate-fade-in">
      <ConfirmDialog
        open={confirmOpen}
        title="Submit Review"
        message={`Are you sure you want to ${statusValue === "approved" ? "approve" : "reject"} this prediction? This action cannot be undone.`}
        confirmLabel="Submit Review"
        onConfirm={handleConfirmedSubmit}
        onCancel={() => setConfirmOpen(false)}
      />

      <Link
        href="/radiologist"
        className="text-sm text-blue-600 hover:text-blue-700 mb-4 inline-block"
      >
        &larr; Back to pending reviews
      </Link>

      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Review Prediction #{prediction.aiPredictionsId}
        </h1>
        <StatusBadge status={prediction.status} type="prediction" />
      </div>

      {reReviewInfo && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start gap-3">
          <AlertTriangle className="text-amber-600 mt-0.5 shrink-0" size={20} />
          <div>
            <p className="text-sm font-semibold text-amber-800">Re-review requested</p>
            {reReviewInfo.reReviewNotes && (
              <p className="text-sm text-amber-700 mt-1">{reReviewInfo.reReviewNotes}</p>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Prediction Info */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              AI Prediction
            </h2>
            <button
              type="button"
              onClick={() => setEditingPrediction(!editingPrediction)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                editingPrediction
                  ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <Pencil size={14} />
              {editingPrediction ? "Editing" : "Modify"}
            </button>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Tumor Detected</span>
              {editingPrediction ? (
                <div className="flex gap-3">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      checked={corrTumorDetected}
                      onChange={() => setCorrTumorDetected(true)}
                      className="w-3.5 h-3.5 text-red-600"
                    />
                    <span className="text-sm text-red-600 font-medium">
                      Yes
                    </span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      checked={!corrTumorDetected}
                      onChange={() => setCorrTumorDetected(false)}
                      className="w-3.5 h-3.5 text-green-600"
                    />
                    <span className="text-sm text-green-600 font-medium">
                      No
                    </span>
                  </label>
                </div>
              ) : (
                <span
                  className={`text-sm font-medium ${corrTumorDetected ? "text-red-600" : "text-green-600"}`}
                >
                  {corrTumorDetected ? "Yes" : "No"}
                  {corrTumorDetected !== prediction.tumorDetected && (
                    <span className="ml-1 text-xs text-blue-600">
                      (modified)
                    </span>
                  )}
                </span>
              )}
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Estimated Region</span>
              {editingPrediction ? (
                <input
                  type="text"
                  value={corrRegion}
                  onChange={(e) => setCorrRegion(e.target.value)}
                  className="w-40 px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900"
                  placeholder="e.g. Frontal Lobe"
                />
              ) : (
                <span className="text-sm font-medium text-gray-900">
                  {corrRegion || "—"}
                  {corrRegion !== (prediction.estimatedRegion ?? "") && (
                    <span className="ml-1 text-xs text-blue-600">
                      (modified)
                    </span>
                  )}
                </span>
              )}
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Tumor Area</span>
              {editingPrediction ? (
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={corrTumorArea}
                    onChange={(e) => setCorrTumorArea(e.target.value)}
                    className="w-24 px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900"
                    placeholder="0.0"
                  />
                  <span className="text-sm text-gray-500">mm&sup2;</span>
                </div>
              ) : (
                <span className="text-sm font-medium text-gray-900">
                  {corrTumorArea
                    ? `${parseFloat(corrTumorArea).toFixed(1)} mm²`
                    : "—"}
                  {corrTumorArea !==
                    (prediction.tumorAreaMm2 != null
                      ? String(prediction.tumorAreaMm2)
                      : "") && (
                    <span className="ml-1 text-xs text-blue-600">
                      (modified)
                    </span>
                  )}
                </span>
              )}
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Predicted At</span>
              <span className="text-sm text-gray-600">
                {formatDateTime(prediction.predictedAt)}
              </span>
            </div>
          </div>
        </div>

        {/* Dice Scores */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Dice Scores
          </h2>
          <div className="space-y-4">
            <DiceScoreBar label="Whole Tumor (WT)" score={prediction.wtDice} />
            <DiceScoreBar label="Tumor Core (TC)" score={prediction.tcDice} />
            <DiceScoreBar
              label="Enhancing Tumor (ET)"
              score={prediction.etDice}
            />
          </div>
        </div>

        {/* Images — Comparison / Annotation Editor */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingMask ? "Mask Editor" : "MRI Comparison"}
              </h2>

              {/* View mode selector — only visible when not editing mask */}
              {!editingMask && (
                <div className="flex bg-gray-100 rounded-lg p-0.5">
                  {[
                    {
                      mode: "side-by-side" as ViewMode,
                      icon: Columns2,
                      label: "Side by Side",
                    },
                    {
                      mode: "overlay" as ViewMode,
                      icon: Layers,
                      label: "Overlay",
                    },
                    {
                      mode: "slider" as ViewMode,
                      icon: SlidersHorizontal,
                      label: "Slider",
                    },
                  ].map(({ mode, icon: Icon, label }) => (
                    <button
                      key={mode}
                      type="button"
                      title={label}
                      onClick={() => setViewMode(mode)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition ${
                        viewMode === mode
                          ? "bg-white text-blue-700 shadow-sm"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      <Icon size={14} />
                      <span className="hidden sm:inline">{label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="relative group">
              <button
                type="button"
                disabled={
                  !prediction.rawMaskFilePath || !prediction.flairImagePath
                }
                onClick={() => setEditingMask(!editingMask)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 text-white hover:bg-blue-700 disabled:hover:bg-blue-600"
              >
                {editingMask ? (
                  <>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m15 18-6-6 6-6" />
                    </svg>
                    Back to Comparison
                  </>
                ) : (
                  <>
                    <Pencil size={16} />
                    Edit Mask
                  </>
                )}
              </button>
              {(!prediction.rawMaskFilePath || !prediction.flairImagePath) && (
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  Raw mask not available for this prediction
                </span>
              )}
            </div>
          </div>

          {editingMask ? (
            <SegmentationEditor
              flairImagePath={prediction.flairImagePath}
              rawMaskFilePath={prediction.rawMaskFilePath}
              maskFilePath={prediction.maskFilePath}
              heatMapPath={prediction.heatMapPath}
              predictionId={prediction.aiPredictionsId}
              onMaskSaved={(path) => setModifiedMaskPath(path)}
            />
          ) : viewMode === "side-by-side" ? (
            /* Side-by-side mode (original) */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-2">
                  Original MRI
                </p>
                <div className="rounded-lg border border-gray-200 overflow-hidden bg-black aspect-square flex items-center justify-center">
                  {flairSrc ? (
                    <img
                      src={`/api/backend/images?path=${encodeURIComponent(flairSrc)}`}
                      alt="Original MRI"
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <span className="text-gray-500 text-sm">
                      No image available
                    </span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600 mb-2">
                  AI Prediction
                </p>
                <div className="rounded-lg border border-gray-200 overflow-hidden bg-black aspect-square flex items-center justify-center">
                  {maskSrc ? (
                    <img
                      src={`/api/backend/images?path=${encodeURIComponent(maskSrc)}`}
                      alt="AI Prediction"
                      className="max-w-full max-h-full object-contain"
                    />
                  ) : (
                    <span className="text-gray-500 text-sm">
                      No prediction available
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : viewMode === "overlay" ? (
            /* Overlay mode */
            <div>
              <div className="relative rounded-lg border border-gray-200 overflow-hidden bg-black aspect-square flex items-center justify-center mx-auto max-w-lg">
                {flairSrc && (
                  <img
                    src={`/api/backend/images?path=${encodeURIComponent(flairSrc)}`}
                    alt="Original MRI"
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                )}
                {maskSrc && (
                  <img
                    src={`/api/backend/images?path=${encodeURIComponent(maskSrc)}`}
                    alt="AI Prediction Overlay"
                    className="absolute inset-0 w-full h-full object-contain"
                    style={{
                      opacity: overlayOpacity / 100,
                      mixBlendMode: "screen",
                    }}
                  />
                )}
                {!flairSrc && !maskSrc && (
                  <span className="text-gray-500 text-sm">
                    No images available
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-4 max-w-lg mx-auto">
                <label className="text-sm text-gray-600 whitespace-nowrap">
                  Overlay Opacity
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={overlayOpacity}
                  onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                  className="flex-1 accent-blue-600"
                />
                <span className="text-sm text-gray-700 font-medium w-10 text-right">
                  {overlayOpacity}%
                </span>
              </div>
            </div>
          ) : (
            /* Slider (swipe) mode */
            <div>
              <div
                ref={sliderContainerRef}
                className="relative rounded-lg border border-gray-200 overflow-hidden bg-black aspect-square mx-auto max-w-lg cursor-col-resize select-none touch-none"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              >
                {/* Left image (Original) */}
                {flairSrc && (
                  <img
                    src={`/api/backend/images?path=${encodeURIComponent(flairSrc)}`}
                    alt="Original MRI"
                    className="absolute inset-0 w-full h-full object-contain"
                    style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
                    draggable={false}
                  />
                )}
                {/* Right image (Prediction) */}
                {maskSrc && (
                  <img
                    src={`/api/backend/images?path=${encodeURIComponent(maskSrc)}`}
                    alt="AI Prediction"
                    className="absolute inset-0 w-full h-full object-contain"
                    style={{ clipPath: `inset(0 0 0 ${sliderPos}%)` }}
                    draggable={false}
                  />
                )}
                {/* Divider line */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-white z-10"
                  style={{
                    left: `${sliderPos}%`,
                    transform: "translateX(-50%)",
                  }}
                >
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center">
                    <SlidersHorizontal size={14} className="text-gray-600" />
                  </div>
                </div>
              </div>
              <p className="text-center text-xs text-gray-500 mt-2">
                &larr; Original MRI | AI Prediction &rarr;
              </p>
            </div>
          )}

          {modifiedMaskPath && (
            <p className="mt-2 text-sm text-green-600 font-medium">
              Modified mask saved successfully.
            </p>
          )}
        </div>
      </div>

      {/* Review Form */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Submit Review
        </h2>

        {submitError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
            {submitError}
          </div>
        )}

        {!radiologistId && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-lg mb-4 text-sm">
            Radiologist profile not found. Please ensure your profile is set up.
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleFormSubmit("default");
          }}
          className="space-y-4"
        >
          <TextInput
            label="Diagnosis"
            id="diagnosis"
            type="text"
            required
            maxLength={200}
            placeholder="e.g., High-grade glioma in right frontal lobe"
            error={errors.diagnosis?.message}
            {...register("diagnosis")}
          />

          <TextArea
            label="Review Notes"
            id="notes"
            rows={4}
            placeholder="Additional observations about the AI segmentation accuracy..."
            error={errors.notes?.message}
            {...register("notes")}
          />

          <RadioGroup
            label="Decision *"
            name="status"
            options={[
              { value: "approved", label: "Approve", color: "green" },
              { value: "rejected", label: "Reject", color: "red" },
            ]}
            value={statusValue}
            onChange={(val) =>
              setFormValue("status", val as "approved" | "rejected")
            }
            error={errors.status?.message}
          />

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting || !radiologistId}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting && submitMode === "default"
                ? "Submitting..."
                : "Submit Review"}
            </button>

            <button
              type="button"
              disabled={submitting || !radiologistId}
              onClick={() => handleFormSubmit("next")}
              className="px-6 py-2.5 bg-white text-blue-600 border border-blue-300 rounded-lg font-medium hover:bg-blue-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting && submitMode === "next"
                ? "Submitting..."
                : "Submit & Next"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
