"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getMyPatientProfile, getMrisByPatient } from "@/lib/auth";
import type { MriMetaData } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import ErrorState from "@/components/ui/ErrorState";
import EmptyState from "@/components/ui/EmptyState";
import TableSkeleton from "@/components/ui/TableSkeleton";
import { ScanLine } from "lucide-react";

export default function PatientScansPage() {
  const router = useRouter();
  const [mris, setMris] = useState<MriMetaData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(false);
    getMyPatientProfile()
      .then((patient) => getMrisByPatient(patient.patientId))
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
        <h1 className="text-2xl font-bold text-gray-900">My Scans</h1>
        {!loading && !error && mris.length > 0 && (
          <span className="text-sm text-gray-500">
            {mris.length} {mris.length === 1 ? "scan" : "scans"}
          </span>
        )}
      </div>

      {error ? (
        <ErrorState
          message="Failed to load your scans. Please try again."
          onRetry={fetchData}
        />
      ) : loading ? (
        <TableSkeleton columns={5} />
      ) : mris.length === 0 ? (
        <EmptyState
          icon={<ScanLine size={48} />}
          title="No scans found"
          description="You don't have any MRI scans yet."
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
                  Notes
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {mris.map((mri) => (
                <tr
                  key={mri.mriId}
                  className="hover:bg-blue-50/50 transition-colors cursor-pointer"
                  onClick={() => router.push(`/patient/results/${mri.mriId}`)}
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
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                    {mri.notes || "—"}
                  </td>
                  <td className="px-6 py-4">
                    <Link
                      href={`/patient/results/${mri.mriId}`}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View Results
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
