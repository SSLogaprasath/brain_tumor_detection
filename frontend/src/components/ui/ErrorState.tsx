import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export default function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
      <AlertTriangle size={40} className="mx-auto text-red-400 mb-3" />
      <p className="text-gray-700 font-medium mb-1">Something went wrong</p>
      <p className="text-sm text-gray-500 mb-4">
        {message || "Failed to load data. Please try again."}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition"
        >
          <RefreshCw size={16} />
          Retry
        </button>
      )}
    </div>
  );
}
