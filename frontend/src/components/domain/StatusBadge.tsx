import {
  PREDICTION_STATUS_COLORS,
  REVIEW_STATUS_COLORS,
} from "@/lib/constants";

interface StatusBadgeProps {
  status: string;
  type?: "prediction" | "review";
}

export default function StatusBadge({
  status,
  type = "prediction",
}: StatusBadgeProps) {
  const colors =
    type === "review" ? REVIEW_STATUS_COLORS : PREDICTION_STATUS_COLORS;
  const colorClass = colors[status] || "bg-gray-100 text-gray-800";

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${colorClass}`}
    >
      {status}
    </span>
  );
}
