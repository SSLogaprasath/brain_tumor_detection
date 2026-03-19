"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { getPrediction } from "@/lib/auth";
import type { AiPrediction } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";
import StatusBadge from "@/components/domain/StatusBadge";
import DiceScoreBar from "@/components/domain/DiceScoreBar";
import MriViewer from "@/components/domain/MriViewer";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function PatientResultPage() {
  const params = useParams();
  const id = Number(params.id);
  const [prediction, setPrediction] = useState<AiPrediction | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

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

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-24" />
        <div className="flex items-center gap-4">
          <div className="h-8 bg-gray-200 rounded w-40" />
          <div className="h-6 bg-gray-200 rounded w-16" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="h-5 bg-gray-200 rounded w-20 mb-4" />
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex justify-between">
                  <div className="h-4 bg-gray-200 rounded w-24" />
                  <div className="h-4 bg-gray-200 rounded w-20" />
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="h-5 bg-gray-200 rounded w-28 mb-4" />
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i}>
                  <div className="h-3 bg-gray-200 rounded w-24 mb-2" />
                  <div className="h-4 bg-gray-200 rounded w-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <Link
          href="/patient/scans"
          className="text-sm text-blue-600 hover:text-blue-700 mb-4 inline-block"
        >
          &larr; Back to scans
        </Link>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <AlertTriangle size={40} className="mx-auto text-red-400 mb-3" />
          <p className="text-gray-700 font-medium mb-1">Something went wrong</p>
          <p className="text-sm text-gray-500 mb-4">
            Failed to load results. Please try again.
          </p>
          <button
            onClick={fetchData}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
          >
            <RefreshCw size={16} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!prediction) {
    return (
      <div>
        <Link
          href="/patient/scans"
          className="text-sm text-blue-600 hover:text-blue-700 mb-4 inline-block"
        >
          &larr; Back to scans
        </Link>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
          Results not available yet. Please check back later.
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <Link
        href="/patient/scans"
        className="text-sm text-blue-600 hover:text-blue-700 mb-4 inline-block"
      >
        &larr; Back to scans
      </Link>

      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Scan Results</h1>
        <StatusBadge status={prediction.status} type="prediction" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
              <span className="text-sm text-gray-500">Analyzed At</span>
              <span className="text-sm text-gray-600">
                {formatDateTime(prediction.predictedAt)}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Accuracy Scores
          </h2>
          <div className="space-y-4">
            <DiceScoreBar label="Whole Tumor" score={prediction.wtDice} />
            <DiceScoreBar label="Tumor Core" score={prediction.tcDice} />
            <DiceScoreBar label="Enhancing Tumor" score={prediction.etDice} />
          </div>
        </div>

        <div className="lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Visualizations
          </h2>
          <MriViewer
            maskPath={prediction.maskFilePath}
            heatMapPath={prediction.heatMapPath}
          />
        </div>
      </div>
    </div>
  );
}
