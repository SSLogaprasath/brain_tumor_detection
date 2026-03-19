"use client";

import { useEffect, useState, useCallback } from "react";
import { getAllLabs } from "@/lib/auth";
import type { Lab } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { FlaskConical } from "lucide-react";
import ErrorState from "@/components/ui/ErrorState";
import EmptyState from "@/components/ui/EmptyState";
import TableSkeleton from "@/components/ui/TableSkeleton";

export default function AdminLabsPage() {
  const [labs, setLabs] = useState<Lab[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(false);
    getAllLabs()
      .then(setLabs)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Labs</h1>
        {!loading && !error && labs.length > 0 && (
          <span className="text-sm text-gray-500">
            {labs.length} {labs.length === 1 ? "lab" : "labs"}
          </span>
        )}
      </div>

      {error ? (
        <ErrorState
          message="Failed to load labs. Please try again."
          onRetry={fetchData}
        />
      ) : loading ? (
        <TableSkeleton columns={3} />
      ) : labs.length === 0 ? (
        <EmptyState
          icon={<FlaskConical size={48} />}
          title="No labs found"
          description="No labs have been registered yet."
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
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {labs.map((lab) => (
                <tr
                  key={lab.labId}
                  className="hover:bg-blue-50/50 transition-colors"
                >
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {lab.labId}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {lab.labName}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {formatDate(lab.createdAt)}
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
