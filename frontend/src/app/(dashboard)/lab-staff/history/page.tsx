"use client";

import { useEffect, useState, useCallback } from "react";
import { getMrisByLab, getMyLabProfile } from "@/lib/auth";
import type { MriMetaData } from "@/lib/types";
import { formatDate, formatDateTime } from "@/lib/utils";
import { Upload } from "lucide-react";
import Link from "next/link";
import ErrorState from "@/components/ui/ErrorState";
import EmptyState from "@/components/ui/EmptyState";
import TableSkeleton from "@/components/ui/TableSkeleton";

export default function LabStaffHistoryPage() {
  const [mris, setMris] = useState<MriMetaData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(false);
    getMyLabProfile()
      .then((lab) => getMrisByLab(lab.labId))
      .then(setMris)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Upload History</h1>
        {!loading && !error && mris.length > 0 && (
          <span className="text-sm text-gray-500">
            {mris.length} {mris.length === 1 ? "upload" : "uploads"}
          </span>
        )}
      </div>

      {error ? (
        <ErrorState
          message="Failed to load scan history. Please try again."
          onRetry={fetchData}
        />
      ) : loading ? (
        <TableSkeleton columns={5} />
      ) : mris.length === 0 ? (
        <EmptyState
          icon={<Upload size={48} />}
          title="No scans uploaded"
          description="Upload your first MRI scan to get started."
          action={
            <Link
              href="/lab-staff/upload"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
            >
              <Upload size={16} /> Upload MRI
            </Link>
          }
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
                  Patient
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                  Scan Date
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                  Modality
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                  Uploaded
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {mris.map((mri) => (
                <tr
                  key={mri.mriId}
                  className="hover:bg-blue-50/50 transition-colors"
                >
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {mri.mriId}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {mri.patient?.patientName || `#${mri.patient?.patientId}`}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {formatDate(mri.scanDate)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 uppercase">
                    {mri.modality}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {formatDateTime(mri.uploadedAt)}
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
