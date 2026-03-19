"use client";

import { useEffect, useState, useCallback } from "react";
import { getAllHospitals } from "@/lib/auth";
import type { Hospital } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { Building2 } from "lucide-react";
import ErrorState from "@/components/ui/ErrorState";
import EmptyState from "@/components/ui/EmptyState";
import TableSkeleton from "@/components/ui/TableSkeleton";

export default function AdminHospitalsPage() {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(false);
    getAllHospitals()
      .then(setHospitals)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Hospitals</h1>
        {!loading && !error && hospitals.length > 0 && (
          <span className="text-sm text-gray-500">
            {hospitals.length}{" "}
            {hospitals.length === 1 ? "hospital" : "hospitals"}
          </span>
        )}
      </div>

      {error ? (
        <ErrorState
          message="Failed to load hospitals. Please try again."
          onRetry={fetchData}
        />
      ) : loading ? (
        <TableSkeleton columns={4} />
      ) : hospitals.length === 0 ? (
        <EmptyState
          icon={<Building2 size={48} />}
          title="No hospitals found"
          description="No hospitals have been registered yet."
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
                  Name
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                  Location
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {hospitals.map((h) => (
                <tr
                  key={h.hospitalId}
                  className="hover:bg-blue-50/50 transition-colors"
                >
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {h.hospitalId}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {h.hospitalName}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {h.location || "—"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {formatDate(h.createdAt)}
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
