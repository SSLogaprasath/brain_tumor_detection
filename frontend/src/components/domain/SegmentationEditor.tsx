"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Stage, Layer, Image as KonvaImage, Circle } from "react-konva";
import type Konva from "konva";
import MriViewer from "./MriViewer";
import { uploadModifiedMask } from "@/lib/auth";
import {
  Paintbrush,
  Eraser,
  Eye,
  EyeOff,
  Undo2,
  Redo2,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Save,
  Move,
  Loader2,
} from "lucide-react";

// --- Constants -----------------------------------------------------------

const MASK_W = 240;
const MASK_H = 240;
const MASK_SIZE = MASK_W * MASK_H;

const CLASS_COLORS: Record<number, [number, number, number]> = {
  1: [255, 0, 0], // NCR / NET — red
  2: [0, 255, 0], // Edema — green
  3: [255, 255, 0], // Enhancing — yellow
};

const CLASS_LABELS: Record<number, string> = {
  1: "NCR/NET",
  2: "Edema",
  3: "Enhancing",
};

const MAX_HISTORY = 50;

// --- Props ---------------------------------------------------------------

interface SegmentationEditorProps {
  flairImagePath: string | null;
  rawMaskFilePath: string | null;
  maskFilePath: string | null;
  heatMapPath: string | null;
  predictionId: number;
  onMaskSaved?: (filePath: string) => void;
}

// --- Helpers -------------------------------------------------------------

function getImageUrl(path: string | null): string | null {
  if (!path) return null;
  return `/api/backend/images?path=${encodeURIComponent(path)}`;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/** Paint a filled circle into the mask array. */
function paintCircle(
  mask: Uint8Array,
  cx: number,
  cy: number,
  radius: number,
  value: number,
) {
  const r = Math.ceil(radius);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy <= r * r) {
        const px = cx + dx;
        const py = cy + dy;
        if (px >= 0 && px < MASK_W && py >= 0 && py < MASK_H) {
          mask[py * MASK_W + px] = value;
        }
      }
    }
  }
}

/** Paint a line from (x0,y0) to (x1,y1) with filled circles. */
function paintLine(
  mask: Uint8Array,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
  value: number,
) {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(Math.ceil(dist), 1);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.round(x0 + (x1 - x0) * t);
    const y = Math.round(y0 + (y1 - y0) * t);
    paintCircle(mask, x, y, radius, value);
  }
}

// --- Component -----------------------------------------------------------

export default function SegmentationEditor({
  flairImagePath,
  rawMaskFilePath,
  maskFilePath,
  heatMapPath,
  predictionId,
  onMaskSaved,
}: SegmentationEditorProps) {
  // Fallback to static viewer for old predictions
  if (!flairImagePath || !rawMaskFilePath) {
    return <MriViewer maskPath={maskFilePath} heatMapPath={heatMapPath} />;
  }

  return (
    <EditorCanvas
      flairImagePath={flairImagePath}
      rawMaskFilePath={rawMaskFilePath}
      predictionId={predictionId}
      onMaskSaved={onMaskSaved}
    />
  );
}

// Separate inner component so hooks are not called conditionally
function EditorCanvas({
  flairImagePath,
  rawMaskFilePath,
  predictionId,
  onMaskSaved,
}: {
  flairImagePath: string;
  rawMaskFilePath: string;
  predictionId: number;
  onMaskSaved?: (filePath: string) => void;
}) {
  // --- Refs --------------------------------------------------------------

  const stageRef = useRef<Konva.Stage>(null);
  const maskDataRef = useRef(new Uint8Array(MASK_SIZE));
  const originalMaskRef = useRef(new Uint8Array(MASK_SIZE));
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  // --- State -------------------------------------------------------------

  const [flairImg, setFlairImg] = useState<HTMLImageElement | null>(null);
  const [overlayImg, setOverlayImg] = useState<HTMLCanvasElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Tools
  const [activeTool, setActiveTool] = useState<"brush" | "eraser" | "pan">(
    "brush",
  );
  const [brushSize, setBrushSize] = useState(8);
  const [activeClass, setActiveClass] = useState<1 | 2 | 3>(1);
  const [overlayOpacity, setOverlayOpacity] = useState(0.5);
  const [classVisibility, setClassVisibility] = useState({
    1: true,
    2: true,
    3: true,
  });

  // Zoom / Pan
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [containerWidth, setContainerWidth] = useState(480);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(
    null,
  );

  // Undo / Redo
  const [history, setHistory] = useState<Uint8Array[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);

  // --- Canvas display size -----------------------------------------------

  const displaySize = Math.min(containerWidth, 600);

  useEffect(() => {
    if (!containerRef.current) return;
    const resize = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // --- Initial scale to fit display area ---------------------------------

  useEffect(() => {
    const s = displaySize / MASK_W;
    setStageScale(s);
  }, [displaySize]);

  // --- Render overlay from mask data -------------------------------------

  const renderOverlay = useCallback(() => {
    if (!overlayCanvasRef.current) return;
    const ctx = overlayCanvasRef.current.getContext("2d")!;
    const imageData = ctx.createImageData(MASK_W, MASK_H);
    const d = imageData.data;

    for (let i = 0; i < MASK_SIZE; i++) {
      const cls = maskDataRef.current[i];
      if (
        cls > 0 &&
        cls <= 3 &&
        classVisibility[cls as 1 | 2 | 3]
      ) {
        const [r, g, b] = CLASS_COLORS[cls];
        d[i * 4] = r;
        d[i * 4 + 1] = g;
        d[i * 4 + 2] = b;
        d[i * 4 + 3] = Math.round(overlayOpacity * 255);
      }
    }

    ctx.putImageData(imageData, 0, 0);
    setOverlayImg(overlayCanvasRef.current);
  }, [classVisibility, overlayOpacity]);

  // --- Load images -------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      try {
        // Load FLAIR image
        const flair = await loadImage(getImageUrl(flairImagePath)!);
        if (cancelled) return;
        setFlairImg(flair);

        // Create overlay canvas
        const canvas = document.createElement("canvas");
        canvas.width = MASK_W;
        canvas.height = MASK_H;
        overlayCanvasRef.current = canvas;

        // Load raw mask and decode pixel values
        const maskImg = await loadImage(getImageUrl(rawMaskFilePath)!);
        if (cancelled) return;

        const tmpCanvas = document.createElement("canvas");
        tmpCanvas.width = MASK_W;
        tmpCanvas.height = MASK_H;
        const tmpCtx = tmpCanvas.getContext("2d")!;
        tmpCtx.drawImage(maskImg, 0, 0, MASK_W, MASK_H);
        const imgData = tmpCtx.getImageData(0, 0, MASK_W, MASK_H);

        for (let i = 0; i < MASK_SIZE; i++) {
          maskDataRef.current[i] = imgData.data[i * 4]; // R channel = class value (0-3)
        }

        // Keep original for reset
        originalMaskRef.current = new Uint8Array(maskDataRef.current);

        // Init history
        const firstSnap = new Uint8Array(maskDataRef.current);
        setHistory([firstSnap]);
        setHistoryIdx(0);
      } catch (err) {
        console.error("Failed to load images for annotation editor:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [flairImagePath, rawMaskFilePath]);

  // Re-render overlay when visibility / opacity / loading changes
  useEffect(() => {
    if (!loading) renderOverlay();
  }, [loading, renderOverlay]);

  // --- History helpers ---------------------------------------------------

  const pushHistory = useCallback(() => {
    const snapshot = new Uint8Array(maskDataRef.current);
    setHistory((prev) => {
      const trimmed = prev.slice(0, historyIdx + 1);
      trimmed.push(snapshot);
      if (trimmed.length > MAX_HISTORY) trimmed.shift();
      return trimmed;
    });
    setHistoryIdx((prev) => Math.min(prev + 1, MAX_HISTORY - 1));
  }, [historyIdx]);

  const undo = useCallback(() => {
    if (historyIdx > 0) {
      const newIdx = historyIdx - 1;
      maskDataRef.current = new Uint8Array(history[newIdx]);
      setHistoryIdx(newIdx);
      renderOverlay();
    }
  }, [historyIdx, history, renderOverlay]);

  const redo = useCallback(() => {
    if (historyIdx < history.length - 1) {
      const newIdx = historyIdx + 1;
      maskDataRef.current = new Uint8Array(history[newIdx]);
      setHistoryIdx(newIdx);
      renderOverlay();
    }
  }, [historyIdx, history, renderOverlay]);

  const resetMask = useCallback(() => {
    maskDataRef.current = new Uint8Array(originalMaskRef.current);
    pushHistory();
    renderOverlay();
  }, [pushHistory, renderOverlay]);

  // --- Screen-to-mask coordinate transform -------------------------------

  const screenToMask = useCallback(
    (screenX: number, screenY: number) => {
      return {
        x: Math.floor((screenX - stagePos.x) / stageScale),
        y: Math.floor((screenY - stagePos.y) / stageScale),
      };
    },
    [stagePos, stageScale],
  );

  // --- Drawing events ----------------------------------------------------

  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (activeTool === "pan") return; // pan handled by Konva draggable
      const stage = e.target.getStage();
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const maskPos = screenToMask(pointer.x, pointer.y);
      const value = activeTool === "eraser" ? 0 : activeClass;
      const radius = brushSize / 2 / stageScale;
      paintCircle(maskDataRef.current, maskPos.x, maskPos.y, radius, value);
      lastPosRef.current = maskPos;
      setIsDrawing(true);
      renderOverlay();
    },
    [activeTool, activeClass, brushSize, stageScale, screenToMask, renderOverlay],
  );

  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage();
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const maskPos = screenToMask(pointer.x, pointer.y);
      setCursorPos(maskPos);

      if (!isDrawing || activeTool === "pan") return;

      const value = activeTool === "eraser" ? 0 : activeClass;
      const radius = brushSize / 2 / stageScale;

      if (lastPosRef.current) {
        paintLine(
          maskDataRef.current,
          lastPosRef.current.x,
          lastPosRef.current.y,
          maskPos.x,
          maskPos.y,
          radius,
          value,
        );
      }

      lastPosRef.current = maskPos;
      renderOverlay();
    },
    [isDrawing, activeTool, activeClass, brushSize, stageScale, screenToMask, renderOverlay],
  );

  const handleMouseUp = useCallback(() => {
    if (isDrawing) {
      pushHistory();
      setIsDrawing(false);
      lastPosRef.current = null;
    }
  }, [isDrawing, pushHistory]);

  // --- Zoom --------------------------------------------------------------

  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = e.target.getStage();
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const scaleBy = 1.15;
      const oldScale = stageScale;
      const newScale =
        e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
      const clamped = Math.max(0.5, Math.min(8, newScale));

      setStageScale(clamped);
      setStagePos({
        x: pointer.x - (pointer.x - stagePos.x) * (clamped / oldScale),
        y: pointer.y - (pointer.y - stagePos.y) * (clamped / oldScale),
      });
    },
    [stageScale, stagePos],
  );

  const zoomIn = () => {
    const newScale = Math.min(8, stageScale * 1.3);
    const center = displaySize / 2;
    setStageScale(newScale);
    setStagePos({
      x: center - (center - stagePos.x) * (newScale / stageScale),
      y: center - (center - stagePos.y) * (newScale / stageScale),
    });
  };

  const zoomOut = () => {
    const newScale = Math.max(0.5, stageScale / 1.3);
    const center = displaySize / 2;
    setStageScale(newScale);
    setStagePos({
      x: center - (center - stagePos.x) * (newScale / stageScale),
      y: center - (center - stagePos.y) * (newScale / stageScale),
    });
  };

  const resetZoom = () => {
    const s = displaySize / MASK_W;
    setStageScale(s);
    setStagePos({ x: 0, y: 0 });
  };

  // --- Save / Export -----------------------------------------------------

  const handleSave = async () => {
    setSaving(true);
    try {
      // Export mask as grayscale PNG with pixel values 0-3
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = MASK_W;
      exportCanvas.height = MASK_H;
      const ctx = exportCanvas.getContext("2d")!;
      const imageData = ctx.createImageData(MASK_W, MASK_H);

      for (let i = 0; i < MASK_SIZE; i++) {
        const v = maskDataRef.current[i];
        imageData.data[i * 4] = v;
        imageData.data[i * 4 + 1] = v;
        imageData.data[i * 4 + 2] = v;
        imageData.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(imageData, 0, 0);

      const blob = await new Promise<Blob>((resolve) => {
        exportCanvas.toBlob((b) => resolve(b!), "image/png");
      });

      const { filePath } = await uploadModifiedMask(blob, predictionId);
      setSaved(true);
      onMaskSaved?.(filePath);
    } catch (err) {
      console.error("Failed to save modified mask:", err);
    } finally {
      setSaving(false);
    }
  };

  // --- Keyboard shortcuts ------------------------------------------------

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "z") {
        e.preventDefault();
        undo();
      } else if (e.ctrlKey && e.key === "y") {
        e.preventDefault();
        redo();
      } else if (e.key === "b") {
        setActiveTool("brush");
      } else if (e.key === "e") {
        setActiveTool("eraser");
      } else if (e.key === " ") {
        e.preventDefault();
        setActiveTool("pan");
      }
    };
    const upHandler = (e: KeyboardEvent) => {
      if (e.key === " ") {
        setActiveTool("brush");
      }
    };
    window.addEventListener("keydown", handler);
    window.addEventListener("keyup", upHandler);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("keyup", upHandler);
    };
  }, [undo, redo]);

  // --- Loading state -----------------------------------------------------

  if (loading) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-12 text-center">
        <Loader2 size={32} className="mx-auto text-blue-500 animate-spin mb-3" />
        <p className="text-gray-500">Loading annotation editor...</p>
      </div>
    );
  }

  // --- Brush cursor size in display coordinates --------------------------

  const cursorRadius = brushSize / 2;

  // --- Render ------------------------------------------------------------

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-3">
        Segmentation Editor
      </h3>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
        {/* Tools */}
        <div className="flex items-center gap-1 border-r border-gray-300 pr-2">
          <ToolBtn
            active={activeTool === "brush"}
            onClick={() => setActiveTool("brush")}
            title="Brush (B)"
          >
            <Paintbrush size={16} />
          </ToolBtn>
          <ToolBtn
            active={activeTool === "eraser"}
            onClick={() => setActiveTool("eraser")}
            title="Eraser (E)"
          >
            <Eraser size={16} />
          </ToolBtn>
          <ToolBtn
            active={activeTool === "pan"}
            onClick={() => setActiveTool("pan")}
            title="Pan (Space)"
          >
            <Move size={16} />
          </ToolBtn>
        </div>

        {/* Brush size */}
        <div className="flex items-center gap-2 border-r border-gray-300 pr-2">
          <span className="text-xs text-gray-500 whitespace-nowrap">Size</span>
          <input
            type="range"
            min={1}
            max={30}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className="w-20 h-1.5 accent-blue-600"
          />
          <span className="text-xs text-gray-600 w-5 text-right">
            {brushSize}
          </span>
        </div>

        {/* Class selector */}
        <div className="flex items-center gap-1 border-r border-gray-300 pr-2">
          {([1, 2, 3] as const).map((cls) => (
            <button
              key={cls}
              onClick={() => setActiveClass(cls)}
              className={`px-2 py-1 text-xs font-medium rounded transition ${
                activeClass === cls
                  ? "ring-2 ring-offset-1 ring-gray-900 shadow-sm"
                  : "opacity-60 hover:opacity-100"
              }`}
              style={{
                backgroundColor: `rgb(${CLASS_COLORS[cls].join(",")})`,
                color: cls === 2 ? "#000" : "#fff",
              }}
              title={CLASS_LABELS[cls]}
            >
              {CLASS_LABELS[cls]}
            </button>
          ))}
        </div>

        {/* Visibility toggles */}
        <div className="flex items-center gap-1 border-r border-gray-300 pr-2">
          {([1, 2, 3] as const).map((cls) => (
            <button
              key={cls}
              onClick={() =>
                setClassVisibility((prev) => ({
                  ...prev,
                  [cls]: !prev[cls],
                }))
              }
              className="p-1 rounded hover:bg-gray-200 transition"
              style={{
                color: `rgb(${CLASS_COLORS[cls].join(",")})`,
                opacity: classVisibility[cls] ? 1 : 0.3,
              }}
              title={`${classVisibility[cls] ? "Hide" : "Show"} ${CLASS_LABELS[cls]}`}
            >
              {classVisibility[cls] ? <Eye size={14} /> : <EyeOff size={14} />}
            </button>
          ))}
        </div>

        {/* Opacity */}
        <div className="flex items-center gap-2 border-r border-gray-300 pr-2">
          <span className="text-xs text-gray-500">Opacity</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(overlayOpacity * 100)}
            onChange={(e) => setOverlayOpacity(Number(e.target.value) / 100)}
            className="w-16 h-1.5 accent-blue-600"
          />
        </div>

        {/* Undo / Redo / Reset */}
        <div className="flex items-center gap-1 border-r border-gray-300 pr-2">
          <ToolBtn
            active={false}
            onClick={undo}
            title="Undo (Ctrl+Z)"
            disabled={historyIdx <= 0}
          >
            <Undo2 size={16} />
          </ToolBtn>
          <ToolBtn
            active={false}
            onClick={redo}
            title="Redo (Ctrl+Y)"
            disabled={historyIdx >= history.length - 1}
          >
            <Redo2 size={16} />
          </ToolBtn>
          <ToolBtn active={false} onClick={resetMask} title="Reset to AI mask">
            <RotateCcw size={16} />
          </ToolBtn>
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-1 border-r border-gray-300 pr-2">
          <ToolBtn active={false} onClick={zoomOut} title="Zoom out">
            <ZoomOut size={16} />
          </ToolBtn>
          <button
            onClick={resetZoom}
            className="px-1.5 py-0.5 text-xs text-gray-600 hover:bg-gray-200 rounded"
            title="Reset zoom"
          >
            {Math.round((stageScale / (displaySize / MASK_W)) * 100)}%
          </button>
          <ToolBtn active={false} onClick={zoomIn} title="Zoom in">
            <ZoomIn size={16} />
          </ToolBtn>
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          className={`ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition ${
            saved
              ? "bg-green-100 text-green-700"
              : "bg-blue-600 text-white hover:bg-blue-700"
          } disabled:opacity-50`}
        >
          {saving ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Save size={14} />
          )}
          {saving ? "Saving..." : saved ? "Saved" : "Save Mask"}
        </button>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-2 text-xs text-gray-500">
        <span>
          <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-200 rounded text-[10px]">
            B
          </kbd>{" "}
          Brush
        </span>
        <span>
          <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-200 rounded text-[10px]">
            E
          </kbd>{" "}
          Eraser
        </span>
        <span>
          <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-200 rounded text-[10px]">
            Space
          </kbd>{" "}
          Pan
        </span>
        <span>Scroll to zoom</span>
        <span>
          <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-200 rounded text-[10px]">
            Ctrl+Z
          </kbd>{" "}
          Undo
        </span>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="overflow-hidden rounded-lg border border-gray-300 bg-black"
        style={{
          cursor:
            activeTool === "pan"
              ? "grab"
              : "crosshair",
        }}
      >
        <Stage
          ref={stageRef}
          width={displaySize}
          height={displaySize}
          scaleX={stageScale}
          scaleY={stageScale}
          x={stagePos.x}
          y={stagePos.y}
          draggable={activeTool === "pan"}
          onDragEnd={(e) => {
            setStagePos({ x: e.target.x(), y: e.target.y() });
          }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => {
            handleMouseUp();
            setCursorPos(null);
          }}
        >
          <Layer>
            {flairImg && (
              <KonvaImage image={flairImg} width={MASK_W} height={MASK_H} />
            )}
            {overlayImg && (
              <KonvaImage image={overlayImg} width={MASK_W} height={MASK_H} />
            )}
          </Layer>
          <Layer>
            {cursorPos && activeTool !== "pan" && (
              <Circle
                x={cursorPos.x}
                y={cursorPos.y}
                radius={cursorRadius / stageScale}
                stroke={
                  activeTool === "eraser"
                    ? "#ffffff"
                    : `rgb(${CLASS_COLORS[activeClass].join(",")})`
                }
                strokeWidth={1 / stageScale}
                listening={false}
              />
            )}
          </Layer>
        </Stage>
      </div>
    </div>
  );
}

// --- Toolbar button component --------------------------------------------

function ToolBtn({
  active,
  disabled,
  onClick,
  title,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`p-1.5 rounded transition ${
        active
          ? "bg-blue-100 text-blue-700"
          : "text-gray-600 hover:bg-gray-200"
      } disabled:opacity-30 disabled:cursor-not-allowed`}
      title={title}
    >
      {children}
    </button>
  );
}
