"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { getPrediction, requestReReview } from "@/lib/auth";
import type { AiPrediction } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import StatusBadge from "@/components/domain/StatusBadge";
import DiceScoreBar from "@/components/domain/DiceScoreBar";
import MriViewer from "@/components/domain/MriViewer";
import DetailSkeleton from "@/components/ui/DetailSkeleton";
import ErrorState from "@/components/ui/ErrorState";
import Link from "next/link";
import { useToast } from "@/context/ToastContext";
import { RotateCcw } from "lucide-react";

export default function PredictionDetailPage() {
  const params = useParams();
  const { addToast } = useToast();
  const id = Number(params.id);
  const [prediction, setPrediction] = useState<AiPrediction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Re-review request state
  const [showReReviewForm, setShowReReviewForm] = useState(false);
  const [reReviewNotes, setReReviewNotes] = useState("");
  const [requestingReReview, setRequestingReReview] = useState(false);
  const [reReviewRequested, setReReviewRequested] = useState(false);

  const fetchData = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(false);
    getPrediction(id)
      .then(setPrediction)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRequestReReview = async () => {
    if (!reReviewNotes.trim() || !prediction) return;
    setRequestingReReview(true);
    try {
      await requestReReview(prediction.aiPredictionsId, reReviewNotes.trim());
      setReReviewRequested(true);
      setShowReReviewForm(false);
      addToast("Re-review requested successfully", "success");
    } catch {
      addToast("Failed to request re-review", "error");
    } finally {
      setRequestingReReview(false);
    }
  };

  if (loading) {
    return (
      <div>
        <Link
          href="/doctor/patients"
          className="text-sm text-blue-600 hover:text-blue-700 mb-4 inline-block"
        >
          &larr; Back to patients
        </Link>
        <DetailSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <Link
          href="/doctor/patients"
          className="text-sm text-blue-600 hover:text-blue-700 mb-4 inline-block"
        >
          &larr; Back to patients
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
          href="/doctor/patients"
          className="text-sm text-blue-600 hover:text-blue-700 mb-4 inline-block"
        >
          &larr; Back to patients
        </Link>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
          Prediction not found.
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <Link
        href="/doctor/patients"
        className="text-sm text-blue-600 hover:text-blue-700 mb-4 inline-block"
      >
        &larr; Back to patients
      </Link>

      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          AI Prediction #{prediction.aiPredictionsId}
        </h1>
        <StatusBadge status={prediction.status} type="prediction" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Summary</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Tumor Detected</span>
              <span
                className={`text-sm font-medium ${prediction.tumorDetected ? "text-red-600" : "text-green-600"}`}
              >
                {prediction.tumorDetected ? "Yes" : "No"}
              </span>
            </div>
            {prediction.estimatedRegion && (
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Estimated Region</span>
                <span className="text-sm font-medium text-gray-900">
                  {prediction.estimatedRegion}
                </span>
              </div>
            )}
            {prediction.tumorAreaMm2 && (
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Tumor Area</span>
                <span className="text-sm font-medium text-gray-900">
                  {prediction.tumorAreaMm2.toFixed(1)} mm&sup2;
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Model Version</span>
              <span className="text-sm text-gray-600">
                {prediction.modelVersion || "—"}
              </span>
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

        {/* Images */}
        <div className="lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Visualizations
          </h2>
          <MriViewer
            maskPath={prediction.maskFilePath}
            heatMapPath={prediction.heatMapPath}
          />
        </div>

        {/* Re-Review Request (only for reviewed predictions) */}
        {prediction.status === "reviewed" && (
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6">
            {reReviewRequested ? (
              <div className="flex items-center gap-2 text-amber-700">
                <RotateCcw size={18} />
                <span className="text-sm font-medium">
                  Re-review already requested
                </span>
                {reReviewNotes && (
                  <span className="text-sm text-amber-600 ml-2">
                    — {reReviewNotes}
                  </span>
                )}
              </div>
            ) : showReReviewForm ? (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-900">
                  Request Re-Review
                </h3>
                <textarea
                  value={reReviewNotes}
                  onChange={(e) => setReReviewNotes(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="Reason for requesting a re-review..."
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none transition text-gray-900"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleRequestReReview}
                    disabled={requestingReReview || !reReviewNotes.trim()}
                    className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {requestingReReview ? "Submitting..." : "Submit Request"}
                  </button>
                  <button
                    onClick={() => {
                      setShowReReviewForm(false);
                      setReReviewNotes("");
                    }}
                    className="px-4 py-2 bg-gray-100 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-200 transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowReReviewForm(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition"
              >
                <RotateCcw size={16} />
                Request Re-Review
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
