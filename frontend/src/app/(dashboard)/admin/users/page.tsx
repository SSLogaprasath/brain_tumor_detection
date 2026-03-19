"use client";

import { useEffect, useState, useCallback } from "react";
import { getAllUsers } from "@/lib/auth";
import type { User } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { Users } from "lucide-react";
import ErrorState from "@/components/ui/ErrorState";
import EmptyState from "@/components/ui/EmptyState";
import TableSkeleton from "@/components/ui/TableSkeleton";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(false);
    getAllUsers()
      .then(setUsers)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
        {!loading && !error && users.length > 0 && (
          <span className="text-sm text-gray-500">
            {users.length} {users.length === 1 ? "user" : "users"}
          </span>
        )}
      </div>

      {error ? (
        <ErrorState
          message="Failed to load users. Please try again."
          onRetry={fetchData}
        />
      ) : loading ? (
        <TableSkeleton columns={5} />
      ) : users.length === 0 ? (
        <EmptyState
          icon={<Users size={48} />}
          title="No users found"
          description="No users have been registered yet."
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
                  Email
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                  Role
                </th>
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {users.map((user) => (
                <tr
                  key={user.userId}
                  className="hover:bg-blue-50/50 transition-colors"
                >
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {user.userId}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {user.userName}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {user.email}
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 capitalize">
                      {user.role?.roleName?.replace("_", " ") || "—"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {formatDate(user.createdAt)}
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
