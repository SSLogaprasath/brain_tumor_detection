import type { AiPrediction } from "@/lib/types";
import StatusBadge from "./StatusBadge";
import DiceScoreBar from "./DiceScoreBar";
import Link from "next/link";

interface PredictionCardProps {
  prediction: AiPrediction;
  linkPrefix: string;
}

export default function PredictionCard({
  prediction,
  linkPrefix,
}: PredictionCardProps) {
  return (
    <Link
      href={`${linkPrefix}/${prediction.aiPredictionsId}`}
      className="block bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-3 h-3 rounded-full ${prediction.tumorDetected ? "bg-red-500" : "bg-green-500"}`}
          />
          <span className="font-medium text-gray-900">
            {prediction.tumorDetected ? "Tumor Detected" : "No Tumor"}
          </span>
        </div>
        <StatusBadge status={prediction.status} type="prediction" />
      </div>

      {prediction.estimatedRegion && (
        <p className="text-sm text-gray-600 mb-3">
          Region:{" "}
          <span className="font-medium">{prediction.estimatedRegion}</span>
        </p>
      )}

      {prediction.tumorAreaMm2 && (
        <p className="text-sm text-gray-600 mb-4">
          Area:{" "}
          <span className="font-medium">
            {prediction.tumorAreaMm2.toFixed(1)} mm&sup2;
          </span>
        </p>
      )}

      <div className="space-y-2">
        <DiceScoreBar label="Whole Tumor" score={prediction.wtDice} />
        <DiceScoreBar label="Tumor Core" score={prediction.tcDice} />
        <DiceScoreBar label="Enhancing" score={prediction.etDice} />
      </div>
    </Link>
  );
}
