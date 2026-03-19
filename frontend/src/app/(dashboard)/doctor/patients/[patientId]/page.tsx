"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { getMrisByPatient, getPrediction } from "@/lib/auth";
import type { MriMetaData, AiPrediction } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import StatusBadge from "@/components/domain/StatusBadge";
import ErrorState from "@/components/ui/ErrorState";
import EmptyState from "@/components/ui/EmptyState";
import TableSkeleton from "@/components/ui/TableSkeleton";
import { ScanLine } from "lucide-react";

export default function PatientMriPage() {
  const params = useParams();
  const router = useRouter();
  const patientId = Number(params.patientId);
  const [mris, setMris] = useState<MriMetaData[]>([]);
  const [predictions, setPredictions] = useState<Record<number, AiPrediction>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(() => {
    if (!patientId) return;
    setLoading(true);
    setError(false);
    getMrisByPatient(patientId)
      .then(async (data) => {
        setMris(data);
        const predMap: Record<number, AiPrediction> = {};
        for (const mri of data) {
          try {
            const pred = await getPrediction(mri.mriId);
            predMap[mri.mriId] = pred;
          } catch {
            // No prediction yet
          }
        }
        setPredictions(predMap);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [patientId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        Patient #{patientId} — MRI Scans
      </h1>
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/doctor/patients"
          className="text-sm text-blue-600 hover:text-blue-700 inline-block"
        >
          &larr; Back to search
        </Link>
        {!loading && !error && mris.length > 0 && (
          <span className="text-sm text-gray-500">
            {mris.length} {mris.length === 1 ? "scan" : "scans"}
          </span>
        )}
      </div>

      {error ? (
        <ErrorState
          message="Failed to load MRI scans. Please try again."
          onRetry={fetchData}
        />
      ) : loading ? (
        <TableSkeleton columns={6} />
      ) : mris.length === 0 ? (
        <EmptyState
          icon={<ScanLine size={48} />}
          title="No MRI scans found"
          description="No scans found for this patient."
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-fade-in">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                  MRI ID
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                  Scan Date
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                  Modality
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                  AI Status
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                  Tumor
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {mris.map((mri) => {
                const pred = predictions[mri.mriId];
                return (
                  <tr
                    key={mri.mriId}
                    className={
                      pred
                        ? "hover:bg-blue-50/50 transition-colors cursor-pointer"
                        : "hover:bg-blue-50/50 transition-colors"
                    }
                    onClick={() =>
                      pred &&
                      router.push(`/doctor/predictions/${pred.aiPredictionsId}`)
                    }
                  >
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {mri.mriId}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {formatDate(mri.scanDate)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 uppercase">
                      {mri.modality}
                    </td>
                    <td className="px-6 py-4">
                      {pred ? (
                        <StatusBadge status={pred.status} type="prediction" />
                      ) : (
                        <span className="text-sm text-gray-400">
                          No prediction
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {pred?.tumorDetected !== undefined ? (
                        <span
                          className={`text-sm font-medium ${pred.tumorDetected ? "text-red-600" : "text-green-600"}`}
                        >
                          {pred.tumorDetected ? "Detected" : "None"}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {pred && (
                        <Link
                          href={`/doctor/predictions/${pred.aiPredictionsId}`}
                          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                          onClick={(e) => e.stopPropagation()}
                        >
                          View Details
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
