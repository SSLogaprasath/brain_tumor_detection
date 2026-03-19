interface MriViewerProps {
  maskPath: string | null;
  heatMapPath: string | null;
}

export default function MriViewer({ maskPath, heatMapPath }: MriViewerProps) {
  const getImageUrl = (path: string | null) => {
    if (!path) return null;
    return `/api/backend/images?path=${encodeURIComponent(path)}`;
  };

  const maskUrl = getImageUrl(maskPath);
  const heatMapUrl = getImageUrl(heatMapPath);

  if (!maskUrl && !heatMapUrl) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center">
        <p className="text-gray-500">No visualization images available</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {maskUrl && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">
            Segmentation Mask
          </p>
          <img
            src={maskUrl}
            alt="Segmentation mask"
            className="w-full rounded-lg border border-gray-200"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      )}
      {heatMapUrl && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">
            Heatmap Overlay
          </p>
          <img
            src={heatMapUrl}
            alt="Heatmap overlay"
            className="w-full rounded-lg border border-gray-200"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      )}
    </div>
  );
}
