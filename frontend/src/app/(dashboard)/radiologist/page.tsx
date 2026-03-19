"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getPendingPredictions, getReReviewRequests } from "@/lib/auth";
import type { AiPrediction, RadiologistReview } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import StatusBadge from "@/components/domain/StatusBadge";
import ErrorState from "@/components/ui/ErrorState";
import EmptyState from "@/components/ui/EmptyState";
import TableSkeleton from "@/components/ui/TableSkeleton";
import Link from "next/link";
import { ClipboardCheck, RotateCcw } from "lucide-react";

export default function RadiologistDashboard() {
  const router = useRouter();
  const [predictions, setPredictions] = useState<AiPrediction[]>([]);
  const [reReviewIds, setReReviewIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(false);
    Promise.all([getPendingPredictions(), getReReviewRequests().catch(() => [])])
      .then(([preds, reReviews]) => {
        setPredictions(preds);
        setReReviewIds(
          new Set(
            (reReviews as RadiologistReview[]).map(
              (r) => r.aiPrediction.aiPredictionsId,
            ),
          ),
        );
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Pending Reviews</h1>
        {!loading && !error && predictions.length > 0 && (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">
            {predictions.length} pending
          </span>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-6">
        AI predictions awaiting your review
      </p>

      {error ? (
        <ErrorState
          message="Failed to load predictions. Please try again."
          onRetry={fetchData}
        />
      ) : loading ? (
        <TableSkeleton columns={7} />
      ) : predictions.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck size={48} />}
          title="All caught up!"
          description="No pending predictions to review. Check back later."
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-fade-in">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                  ID
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                  Patient
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                  Scan Date
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                  Tumor
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                  Region
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {predictions.map((pred) => (
                <tr
                  key={pred.aiPredictionsId}
                  className="hover:bg-blue-50/50 transition-colors cursor-pointer"
                  onClick={() =>
                    router.push(`/radiologist/review/${pred.aiPredictionsId}`)
                  }
                >
                  <td className="px-6 py-4 text-sm text-gray-900">
                    <span className="inline-flex items-center gap-1.5">
                      {pred.aiPredictionsId}
                      {reReviewIds.has(pred.aiPredictionsId) && (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700"
                          title="Re-review requested"
                        >
                          <RotateCcw size={10} />
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {pred.mri?.patient?.patientName ||
                      `Patient #${pred.mri?.patient?.patientId}`}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {formatDate(pred.mri?.scanDate)}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`text-sm font-medium ${pred.tumorDetected ? "text-red-600" : "text-green-600"}`}
                    >
                      {pred.tumorDetected ? "Detected" : "None"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {pred.estimatedRegion || "—"}
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={pred.status} type="prediction" />
                  </td>
                  <td className="px-6 py-4">
                    <Link
                      href={`/radiologist/review/${pred.aiPredictionsId}`}
                      className="inline-flex items-center px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Review
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
