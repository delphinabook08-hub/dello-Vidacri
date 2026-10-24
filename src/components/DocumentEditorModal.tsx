import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  RotateCw,
  Crop,
  Sparkles,
  Sun,
  Sliders,
  Type,
  PenTool,
  Check,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Layers
} from "lucide-react";
import {
  ScanFilterMode,
  QuadCorners,
  detectPaperCorners,
  warpPerspectiveBilinear,
  applyScanFilter,
  applyCustomAdjustments,
  applyWatermark,
  rotateImage
} from "../lib/documentCropper";
import { getTranslations } from "../lib/translations";

interface DocumentEditorModalProps {
  isOpen: boolean;
  pages: string[]; // List of base64 image data URLs
  onClose: () => void;
  onSave: (processedPages: string[]) => void;
  selectedLanguage?: string;
}

export default function DocumentEditorModal({
  isOpen,
  pages,
  onClose,
  onSave,
  selectedLanguage
}: DocumentEditorModalProps) {
  const t = getTranslations(selectedLanguage || "French");
  const ed = t.editor;
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [pageDataUrls, setPageDataUrls] = useState<string[]>([]);
  const [filterMode, setFilterMode] = useState<ScanFilterMode>("magic");
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);
  const [watermarkText, setWatermarkText] = useState("");
  const [showWatermarkInput, setShowWatermarkInput] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // 4-Corner Quad Points state per page index in normalized [0..1] relative coordinates
  const [cornersMap, setCornersMap] = useState<{ [index: number]: QuadCorners }>({});
  const [corners, setCorners] = useState<QuadCorners>({
    topLeft: { x: 0.05, y: 0.05 },
    topRight: { x: 0.95, y: 0.05 },
    bottomRight: { x: 0.95, y: 0.95 },
    bottomLeft: { x: 0.05, y: 0.95 }
  });

  const [activeHandle, setActiveHandle] = useState<keyof QuadCorners | null>(null);
  const [loupePosition, setLoupePosition] = useState<{ x: number; y: number; pixelX: number; pixelY: number } | null>(null);

  // Signature Pad state
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const sigCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawingSig, setIsDrawingSig] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (pages && pages.length > 0) {
      setPageDataUrls(pages);
      setCurrentPageIndex(0);
      setCornersMap({});
    }
  }, [pages]);

  const currentImage = pageDataUrls[currentPageIndex] || "";

  // Update corners map when current page corners change
  const updateCurrentPageCorners = (newCorners: QuadCorners) => {
    setCorners(newCorners);
    setCornersMap(prev => ({ ...prev, [currentPageIndex]: newCorners }));
  };

  // Auto-detect paper corners when switching image if not already stored
  const handleAutoDetectCorners = useCallback(() => {
    if (!currentImage) return;

    if (cornersMap[currentPageIndex]) {
      setCorners(cornersMap[currentPageIndex]);
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const w = img.width;
      const h = img.height;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, w, h);
        const detected = detectPaperCorners(w, h, imgData);
        const detectedNorm = {
          topLeft: { x: detected.topLeft.x / w, y: detected.topLeft.y / h },
          topRight: { x: detected.topRight.x / w, y: detected.topRight.y / h },
          bottomRight: { x: detected.bottomRight.x / w, y: detected.bottomRight.y / h },
          bottomLeft: { x: detected.bottomLeft.x / w, y: detected.bottomLeft.y / h }
        };
        updateCurrentPageCorners(detectedNorm);
      }
    };
    img.src = currentImage;
  }, [currentImage, currentPageIndex, cornersMap]);

  useEffect(() => {
    handleAutoDetectCorners();
  }, [handleAutoDetectCorners]);

  // Handle Dragging of Corner Points
  const handlePointerDown = (cornerKey: keyof QuadCorners, e: React.PointerEvent) => {
    e.stopPropagation();
    setActiveHandle(cornerKey);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!activeHandle || !imgRef.current || !containerRef.current) return;

    const rect = imgRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

    const normX = x / rect.width;
    const normY = y / rect.height;

    const updatedCorners = {
      ...corners,
      [activeHandle]: { x: normX, y: normY }
    };
    setCorners(updatedCorners);
    setCornersMap(prev => ({ ...prev, [currentPageIndex]: updatedCorners }));

    // Position magnifying loupe near the active handle
    setLoupePosition({
      x: e.clientX - containerRef.current.getBoundingClientRect().left,
      y: e.clientY - containerRef.current.getBoundingClientRect().top - 70,
      pixelX: normX,
      pixelY: normY
    });
  }, [activeHandle, corners, currentPageIndex]);

  const handlePointerUp = useCallback(() => {
    setActiveHandle(null);
    setLoupePosition(null);
  }, []);

  // Rotate Page 90°
  const handleRotate = async () => {
    if (!currentImage) return;
    setIsProcessing(true);
    const rotated = await rotateImage(currentImage, 90);
    const updated = [...pageDataUrls];
    updated[currentPageIndex] = rotated;
    setPageDataUrls(updated);
    setIsProcessing(false);
  };

  // Delete Current Page
  const handleDeletePage = () => {
    if (pageDataUrls.length <= 1) return;
    const updated = pageDataUrls.filter((_, idx) => idx !== currentPageIndex);
    setPageDataUrls(updated);
    setCurrentPageIndex(prev => Math.min(prev, updated.length - 1));
  };

  // Apply Full CamScanner Render (Perspective Warp + Filter + Brightness/Contrast + Watermark + Signature)
  const processPage = (imgUrl: string, cornerCoords: QuadCorners): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const origW = img.width;
        const origH = img.height;

        const srcCanvas = document.createElement("canvas");
        srcCanvas.width = origW;
        srcCanvas.height = origH;
        const srcCtx = srcCanvas.getContext("2d", { willReadFrequently: true });
        if (!srcCtx) {
          resolve(imgUrl);
          return;
        }
        srcCtx.drawImage(img, 0, 0);

        // Denormalize corner coordinates to pixel coordinates
        const pixelCorners: QuadCorners = {
          topLeft: { x: cornerCoords.topLeft.x * origW, y: cornerCoords.topLeft.y * origH },
          topRight: { x: cornerCoords.topRight.x * origW, y: cornerCoords.topRight.y * origH },
          bottomRight: { x: cornerCoords.bottomRight.x * origW, y: cornerCoords.bottomRight.y * origH },
          bottomLeft: { x: cornerCoords.bottomLeft.x * origW, y: cornerCoords.bottomLeft.y * origH }
        };

        // Calculate destination dimensions
        const topW = Math.hypot(pixelCorners.topRight.x - pixelCorners.topLeft.x, pixelCorners.topRight.y - pixelCorners.topLeft.y);
        const botW = Math.hypot(pixelCorners.bottomRight.x - pixelCorners.bottomLeft.x, pixelCorners.bottomRight.y - pixelCorners.bottomLeft.y);
        const leftH = Math.hypot(pixelCorners.bottomLeft.x - pixelCorners.topLeft.x, pixelCorners.bottomLeft.y - pixelCorners.topLeft.y);
        const rightH = Math.hypot(pixelCorners.bottomRight.x - pixelCorners.topRight.x, pixelCorners.bottomRight.y - pixelCorners.topRight.y);

        const destW = Math.max(600, Math.round(Math.max(topW, botW)));
        const destH = Math.max(800, Math.round(Math.max(leftH, rightH)));

        // Unwarp Perspective
        const warpedCanvas = warpPerspectiveBilinear(srcCanvas, pixelCorners, destW, destH);
        const outCtx = warpedCanvas.getContext("2d", { willReadFrequently: true });

        if (outCtx) {
          // CamScanner Filter
          applyScanFilter(outCtx, destW, destH, filterMode);

          // Brightness / Contrast
          applyCustomAdjustments(outCtx, destW, destH, brightness, contrast);

          // Watermark
          if (watermarkText) {
            applyWatermark(outCtx, destW, destH, watermarkText);
          }

          // Signature
          if (signatureDataUrl) {
            const sigImg = new Image();
            sigImg.onload = () => {
              const sigW = destW * 0.35;
              const sigH = (sigImg.height / sigImg.width) * sigW;
              outCtx.drawImage(sigImg, destW - sigW - 30, destH - sigH - 30, sigW, sigH);
              resolve(warpedCanvas.toDataURL("image/jpeg", 0.90));
            };
            sigImg.src = signatureDataUrl;
            return;
          }
        }

        resolve(warpedCanvas.toDataURL("image/jpeg", 0.90));
      };
      img.onerror = () => resolve(imgUrl);
      img.src = imgUrl;
    });
  };

  const handleSaveAll = async () => {
    setIsProcessing(true);
    try {
      const processed: string[] = [];
      for (let i = 0; i < pageDataUrls.length; i++) {
        const pageCorners = cornersMap[i] || corners;
        const res = await processPage(pageDataUrls[i], pageCorners);
        processed.push(res);
      }
      onSave(processed);
    } catch (err) {
      console.error("Error saving processed pages:", err);
      onSave(pageDataUrls);
    } finally {
      setIsProcessing(false);
    }
  };

  // Signature Pad Handlers
  const startDrawingSig = (e: React.PointerEvent<HTMLCanvasElement>) => {
    setIsDrawingSig(true);
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const drawSig = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingSig) return;
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000000";
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawingSig = () => {
    setIsDrawingSig(false);
  };

  const clearSignature = () => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureDataUrl(null);
  };

  const saveSignature = () => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    setSignatureDataUrl(canvas.toDataURL("image/png"));
    setShowSignaturePad(false);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-xl p-2 sm:p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-5xl h-[92vh] bg-zinc-950 border border-white/10 rounded-3xl flex flex-col overflow-hidden shadow-2xl relative"
        >
          {/* Header Bar */}
          <div className="p-4 bg-zinc-900 border-b border-white/10 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-teal-500/20 text-teal-400 rounded-xl border border-teal-500/30">
                <Crop className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  {ed.title}
                  <span className="px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 text-[9px] font-mono border border-teal-500/30 uppercase">
                    {ed.badge}
                  </span>
                </h3>
                <p className="text-[10px] text-slate-400">
                  {ed.subtitle}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveAll}
                disabled={isProcessing}
                className="px-5 py-2.5 bg-teal-500 hover:bg-teal-400 text-black text-xs font-bold tracking-wider uppercase rounded-xl transition-all shadow-lg shadow-teal-500/20 flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>{isProcessing ? ed.processingBtn : ed.applyBtn}</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="p-2.5 rounded-xl bg-zinc-800 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Main Editing Viewport */}
          <div
            ref={containerRef}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="flex-1 bg-zinc-900/60 relative flex items-center justify-center p-4 overflow-hidden select-none"
          >
            {/* Magnifying Loupe Overlay */}
            {loupePosition && (
              <div
                style={{
                  left: `${loupePosition.x - 45}px`,
                  top: `${loupePosition.y - 45}px`
                }}
                className="absolute z-40 pointer-events-none w-24 h-24 rounded-full border-2 border-teal-400 bg-zinc-950 shadow-2xl overflow-hidden flex items-center justify-center"
              >
                <div
                  style={{
                    backgroundImage: `url(${currentImage})`,
                    backgroundPosition: `${loupePosition.pixelX * 100}% ${loupePosition.pixelY * 100}%`,
                    backgroundSize: "400%",
                    width: "100%",
                    height: "100%"
                  }}
                />
                <div className="absolute w-2 h-2 rounded-full border border-teal-400 bg-teal-500/50" />
              </div>
            )}

            {/* Document Canvas Container */}
            <div className="relative max-w-full max-h-full flex items-center justify-center">
              <img
                ref={imgRef}
                src={currentImage}
                alt="Document Scan"
                className="max-w-full max-h-[58vh] object-contain rounded-lg shadow-2xl border border-white/10"
              />

              {/* 4-Corner SVG Polygon Overlay */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                <polygon
                  points={`${corners.topLeft.x * 100}% ${corners.topLeft.y * 100}%, ${corners.topRight.x * 100}% ${corners.topRight.y * 100}%, ${corners.bottomRight.x * 100}% ${corners.bottomRight.y * 100}%, ${corners.bottomLeft.x * 100}% ${corners.bottomLeft.y * 100}%`}
                  fill="rgba(20, 184, 166, 0.18)"
                  stroke="#14b8a6"
                  strokeWidth="2.5"
                  strokeDasharray="4 4"
                />
              </svg>

              {/* 4 Interactive Corner Drag Handles */}
              {(["topLeft", "topRight", "bottomRight", "bottomLeft"] as const).map(key => {
                const pt = corners[key];
                return (
                  <div
                    key={key}
                    onPointerDown={(e) => handlePointerDown(key, e)}
                    style={{
                      left: `${pt.x * 100}%`,
                      top: `${pt.y * 100}%`
                    }}
                    className="absolute z-30 w-7 h-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-teal-500 shadow-xl cursor-grab active:cursor-grabbing flex items-center justify-center hover:scale-125 transition-transform"
                  >
                    <div className="w-2 h-2 rounded-full bg-white" />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom Toolbar & Filter Controls */}
          <div className="p-4 bg-zinc-900 border-t border-white/10 space-y-3 shrink-0">
            {/* Filter Selector & Quick Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
                <button
                  type="button"
                  onClick={() => setFilterMode("magic")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                    filterMode === "magic"
                      ? "bg-teal-500 text-black border-teal-400 shadow-lg shadow-teal-500/20"
                      : "bg-zinc-800 text-slate-300 border-white/10 hover:bg-zinc-700"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{ed.filterMagic}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFilterMode("bw")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                    filterMode === "bw"
                      ? "bg-teal-500 text-black border-teal-400 shadow-lg shadow-teal-500/20"
                      : "bg-zinc-800 text-slate-300 border-white/10 hover:bg-zinc-700"
                  }`}
                >
                  <span>{ed.filterBw}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFilterMode("lighten")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                    filterMode === "lighten"
                      ? "bg-teal-500 text-black border-teal-400 shadow-lg shadow-teal-500/20"
                      : "bg-zinc-800 text-slate-300 border-white/10 hover:bg-zinc-700"
                  }`}
                >
                  <span>{ed.filterLighten}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFilterMode("grayscale")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                    filterMode === "grayscale"
                      ? "bg-teal-500 text-black border-teal-400 shadow-lg shadow-teal-500/20"
                      : "bg-zinc-800 text-slate-300 border-white/10 hover:bg-zinc-700"
                  }`}
                >
                  <span>{ed.filterGrayscale}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFilterMode("original")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                    filterMode === "original"
                      ? "bg-teal-500 text-black border-teal-400 shadow-lg shadow-teal-500/20"
                      : "bg-zinc-800 text-slate-300 border-white/10 hover:bg-zinc-700"
                  }`}
                >
                  <span>{ed.filterOriginal}</span>
                </button>
              </div>

              {/* Tools: Auto-Detect, Rotation, Watermark, Signature, Delete */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAutoDetectCorners}
                  className="px-2.5 py-1.5 rounded-xl bg-teal-500/20 text-teal-300 hover:bg-teal-500/30 border border-teal-500/40 text-xs font-semibold flex items-center gap-1 transition-all"
                  title="Auto-Cadrage"
                >
                  <Crop className="w-4 h-4 text-teal-400" />
                  <span>Auto</span>
                </button>

                <button
                  type="button"
                  onClick={handleRotate}
                  className="p-2 rounded-xl bg-zinc-800 text-slate-300 hover:text-white border border-white/10 hover:bg-zinc-700 transition-colors"
                  title={ed.rotate}
                >
                  <RotateCw className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setShowWatermarkInput(!showWatermarkInput)}
                  className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1 border transition-all ${
                    watermarkText ? "bg-teal-500/20 text-teal-300 border-teal-500/50" : "bg-zinc-800 text-slate-300 border-white/10"
                  }`}
                  title={ed.watermark}
                >
                  <Type className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setShowSignaturePad(true)}
                  className={`p-2 rounded-xl text-xs font-semibold flex items-center gap-1 border transition-all ${
                    signatureDataUrl ? "bg-teal-500/20 text-teal-300 border-teal-500/50" : "bg-zinc-800 text-slate-300 border-white/10"
                  }`}
                  title={ed.signature}
                >
                  <PenTool className="w-4 h-4" />
                </button>

                {pageDataUrls.length > 1 && (
                  <button
                    type="button"
                    onClick={handleDeletePage}
                    className="p-2 rounded-xl bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors"
                    title="Supprimer cette page"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Optional Watermark Input Bar */}
            {showWatermarkInput && (
              <div className="flex items-center gap-2 p-2 bg-zinc-950 rounded-xl border border-white/10">
                <Type className="w-4 h-4 text-teal-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Texte du filigrane (ex: CONFIDENTIEL / USAGE EXCLUSIF)..."
                  value={watermarkText}
                  onChange={(e) => setWatermarkText(e.target.value)}
                  className="flex-1 bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
                />
                {watermarkText && (
                  <button
                    type="button"
                    onClick={() => setWatermarkText("")}
                    className="text-slate-400 hover:text-white text-xs"
                  >
                    Effacer
                  </button>
                )}
              </div>
            )}

            {/* Brightness / Contrast Sliders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-white/5">
              <div className="flex items-center gap-3">
                <Sun className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-[11px] text-slate-400 shrink-0 w-20">Luminosité</span>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  value={brightness}
                  onChange={(e) => setBrightness(Number(e.target.value))}
                  className="flex-1 accent-teal-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                />
                <span className="text-[10px] font-mono text-slate-400 w-8 text-right">{brightness}</span>
              </div>

              <div className="flex items-center gap-3">
                <Sliders className="w-4 h-4 text-indigo-400 shrink-0" />
                <span className="text-[11px] text-slate-400 shrink-0 w-20">Contraste</span>
                <input
                  type="range"
                  min="-50"
                  max="50"
                  value={contrast}
                  onChange={(e) => setContrast(Number(e.target.value))}
                  className="flex-1 accent-teal-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
                />
                <span className="text-[10px] font-mono text-slate-400 w-8 text-right">{contrast}</span>
              </div>
            </div>

            {/* Multi-Page Carousel Bottom Bar */}
            {pageDataUrls.length > 1 && (
              <div className="flex items-center gap-2 pt-2 border-t border-white/5 overflow-x-auto no-scrollbar">
                <span className="text-[10px] uppercase font-mono text-slate-400 shrink-0 font-semibold mr-1">
                  Pages ({currentPageIndex + 1}/{pageDataUrls.length}) :
                </span>
                {pageDataUrls.map((url, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setCurrentPageIndex(idx)}
                    className={`relative w-12 h-16 rounded-lg overflow-hidden border-2 shrink-0 transition-all ${
                      idx === currentPageIndex
                        ? "border-teal-400 ring-2 ring-teal-500/50 scale-105"
                        : "border-white/10 opacity-60 hover:opacity-100"
                    }`}
                  >
                    <img src={url} alt={`Page ${idx + 1}`} className="w-full h-full object-cover" />
                    <span className="absolute bottom-0 right-0 bg-black/80 px-1 text-[8px] font-mono text-white">
                      {idx + 1}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Signature Pad Overlay Modal */}
          {showSignaturePad && (
            <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
              <div className="w-full max-w-md bg-zinc-900 border border-white/10 rounded-3xl p-6 space-y-4 shadow-2xl">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <PenTool className="w-4 h-4 text-teal-400" />
                    Signature / Tampon Électronique
                  </h4>
                  <button
                    type="button"
                    onClick={() => setShowSignaturePad(false)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="bg-white rounded-2xl p-2 h-44 flex items-center justify-center">
                  <canvas
                    ref={sigCanvasRef}
                    width={380}
                    height={160}
                    onPointerDown={startDrawingSig}
                    onPointerMove={drawSig}
                    onPointerUp={stopDrawingSig}
                    className="w-full h-full cursor-crosshair touch-none"
                  />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={clearSignature}
                    className="px-4 py-2 rounded-xl bg-zinc-800 text-slate-400 text-xs font-semibold hover:text-white"
                  >
                    Effacer
                  </button>
                  <button
                    type="button"
                    onClick={saveSignature}
                    className="px-5 py-2 rounded-xl bg-teal-500 text-black text-xs font-bold hover:bg-teal-400 shadow-lg shadow-teal-500/20"
                  >
                    Insérer la Signature
                  </button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
