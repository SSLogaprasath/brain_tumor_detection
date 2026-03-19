"use client";

import { useEffect, useState, useCallback } from "react";
import { getReviewsByRadiologist, getMyRadiologistProfile } from "@/lib/auth";
import type { RadiologistReview } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import StatusBadge from "@/components/domain/StatusBadge";
import ErrorState from "@/components/ui/ErrorState";
import EmptyState from "@/components/ui/EmptyState";
import TableSkeleton from "@/components/ui/TableSkeleton";
import { History } from "lucide-react";

export default function RadiologistHistoryPage() {
  const [reviews, setReviews] = useState<RadiologistReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(false);
    getMyRadiologistProfile()
      .then((profile) => getReviewsByRadiologist(profile.radiologistId))
      .then(setReviews)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Review History</h1>
        {!loading && !error && reviews.length > 0 && (
          <span className="text-sm text-gray-500">
            {reviews.length} {reviews.length === 1 ? "review" : "reviews"}
          </span>
        )}
      </div>

      {error ? (
        <ErrorState
          message="Failed to load review history. Please try again."
          onRetry={fetchData}
        />
      ) : loading ? (
        <TableSkeleton columns={5} />
      ) : reviews.length === 0 ? (
        <EmptyState
          icon={<History size={48} />}
          title="No reviews yet"
          description="Your completed reviews will appear here."
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-fade-in">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                  Review ID
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                  Prediction
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                  Diagnosis
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                  Reviewed At
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {reviews.map((review) => (
                <tr
                  key={review.reviewId}
                  className="hover:bg-blue-50/50 transition-colors"
                >
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {review.reviewId}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    #{review.aiPrediction?.aiPredictionsId}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                    {review.diagnosis || "—"}
                  </td>
                  <td className="px-6 py-4">
                    <StatusBadge status={review.status} type="review" />
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {formatDateTime(review.reviewedAt)}
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
