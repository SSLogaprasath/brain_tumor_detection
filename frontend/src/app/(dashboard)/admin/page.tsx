"use client";

import { useEffect, useState, useCallback } from "react";
import { getAdminStats } from "@/lib/auth";
import type { AdminStats } from "@/lib/types";
import { Users, ScanLine, Brain, ClipboardCheck, AlertTriangle, RefreshCw } from "lucide-react";

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(false);
    getAdminStats()
      .then(setStats)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const cards = [
    {
      label: "Total Users",
      value: stats?.totalUsers ?? "—",
      icon: <Users size={24} />,
      color: "bg-blue-500",
    },
    {
      label: "Total MRI Scans",
      value: stats?.totalMris ?? "—",
      icon: <ScanLine size={24} />,
      color: "bg-purple-500",
    },
    {
      label: "AI Predictions",
      value: stats?.totalPredictions ?? "—",
      icon: <Brain size={24} />,
      color: "bg-orange-500",
    },
    {
      label: "Pending Reviews",
      value: stats?.pendingPredictions ?? "—",
      icon: <ClipboardCheck size={24} />,
      color: "bg-green-500",
    },
    {
      label: "Completed Reviews",
      value: stats?.totalReviews ?? "—",
      icon: <ClipboardCheck size={24} />,
      color: "bg-teal-500",
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Admin Dashboard
      </h1>

      {error ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <AlertTriangle size={40} className="mx-auto text-red-400 mb-3" />
          <p className="text-gray-700 font-medium mb-1">Something went wrong</p>
          <p className="text-sm text-gray-500 mb-4">
            Failed to load dashboard stats. Please try again.
          </p>
          <button
            onClick={fetchData}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
          >
            <RefreshCw size={16} />
            Retry
          </button>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-gray-200 p-6 animate-pulse"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gray-200 rounded-xl" />
                <div>
                  <div className="h-3 bg-gray-200 rounded w-20 mb-2" />
                  <div className="h-7 bg-gray-200 rounded w-12" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in">
          {cards.map((card) => (
            <div
              key={card.label}
              className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-4">
                <div className={`${card.color} text-white p-3 rounded-xl`}>
                  {card.icon}
                </div>
                <div>
                  <p className="text-sm text-gray-500">{card.label}</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {card.value}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
