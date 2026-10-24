import React, { useCallback, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Camera, Upload, X, Zap, ZapOff, Smartphone, Crop, Check, Sparkles, Grid, SlidersHorizontal, Sliders, ArrowLeft, Moon, Sun, Lightbulb, Mic, Music, FileAudio } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { compressImagesInParallel } from "../lib/imageCompressor";
import { autoCropAndTrimPaper, autoCropBatch, ScanFilterMode } from "../lib/documentCropper";
import { processUploadedDocumentFiles } from "../lib/pdfConverter";
import { optimizeAudioBlob } from "../lib/audioCompressor";
import DocumentEditorModal from "./DocumentEditorModal";
import { getTranslations } from "../lib/translations";

interface ScannerProps {
  onImagesCaptured: (base64Array: string[]) => void;
  onMultimodalCaptured?: (base64Array: string[], audioBase64: string, audioMimeType: string) => void;
  onTextCaptured?: (text: string) => void;
  selectedLanguage: string;
  activeTab?: "ocr" | "voice";
  onDirectFileUpload?: (files: File[]) => void;
}

export default function Scanner({ onImagesCaptured, onMultimodalCaptured, onTextCaptured, selectedLanguage, activeTab, onDirectFileUpload }: ScannerProps) {
  const t = getTranslations(selectedLanguage);
  const [showCamera, setShowCamera] = useState(false);
  const [capturedPages, setCapturedPages] = useState<string[]>([]);
  const [attachedAudio, setAttachedAudio] = useState<{ base64: string; mimeType: string; name: string } | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isCropping, setIsCropping] = useState(false);
  const [autoCropEnabled, setAutoCropEnabled] = useState(true);
  const [scanFilterMode, setScanFilterMode] = useState<ScanFilterMode>("magic");
  const [showGridOverlay, setShowGridOverlay] = useState(true);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [isScreenTorchOn, setIsScreenTorchOn] = useState(false);
  const [isNightModeEnhance, setIsNightModeEnhance] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [flashNotice, setFlashNotice] = useState<string | null>(null);
  
  // CamScanner Editor Modal state
  const [showEditorModal, setShowEditorModal] = useState(false);
  const [pagesToEdit, setPagesToEdit] = useState<string[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const showTemporaryNotice = (msg: string) => {
    setFlashNotice(msg);
    setTimeout(() => setFlashNotice(null), 3000);
  };

  const toggleFlash = async () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      const track = stream.getVideoTracks()[0];
      
      if (hasTorch && track) {
        try {
          const nextState = !isFlashOn;
          await track.applyConstraints({
            advanced: [{ torch: nextState } as any],
          });
          setIsFlashOn(nextState);
          showTemporaryNotice(nextState ? "⚡ Flash Torche LED activé" : "Flash Torche éteint");
          return;
        } catch (err) {
          console.warn("Hardware torch failed, falling back to Screen Torch:", err);
        }
      }
    }

    // Fallback or Screen Torch for night illumination
    const nextScreenTorch = !isScreenTorchOn;
    setIsScreenTorchOn(nextScreenTorch);
    setIsNightModeEnhance(nextScreenTorch);
    showTemporaryNotice(nextScreenTorch ? "💡 Flash Écran Nocturne activé" : "Flash Écran éteint");
  };

  const toggleNightMode = () => {
    const nextNight = !isNightModeEnhance;
    setIsNightModeEnhance(nextNight);
    showTemporaryNotice(nextNight ? "🌙 Mode Nuit (Basse Lumière) activé" : "Mode Nuit standard");
  };

  const startCamera = async () => {
    setCameraError(null);
    setIsFlashOn(false);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn("Direct HTML5 mediaDevices camera is not supported in this environment (WebView, non-HTTPS, or older Android browser).");
      setCameraError(
        "Votre navigateur ou version d'Android restreint l'accès direct à la caméra (ou vous n'êtes pas sur un site sécurisé HTTPS). Utilisez l'appareil photo natif Android ci-dessous, il est 100% compatible !"
      );
      return;
    }

    // Multi-stage progressive constraints designed for all versions of Android and browsers
    const constraintStages = [
      // Stage 1: Rear Camera, FHD Resolution
      {
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      },
      // Stage 2: Rear Camera, HD Resolution
      {
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      },
      // Stage 3: Broad Android back-facing camera
      {
        video: {
          facingMode: "environment"
        }
      },
      // Stage 4: Resilient fallback to any available capture stream
      {
        video: true
      }
    ];

    let activeStream: MediaStream | null = null;
    let succeeded = false;
    let fallbackError: any = null;

    for (const constraints of constraintStages) {
      try {
        activeStream = await navigator.mediaDevices.getUserMedia(constraints);
        succeeded = true;
        break;
      } catch (err) {
        fallbackError = err;
        console.warn("Retrying with camera fallback stream due to:", err);
      }
    }

    if (succeeded && activeStream) {
      setShowCamera(true);
      const stream = activeStream;
      
      const track = stream.getVideoTracks()[0];
      setTimeout(() => {
        try {
          if (track && typeof track.getCapabilities === "function") {
            const capabilities = track.getCapabilities() as any;
            setHasTorch(!!capabilities?.torch);
          } else {
            setHasTorch(false);
          }
        } catch (_) {
          setHasTorch(false);
        }
      }, 500);

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } else {
      console.warn("Live camera stream unavailable or permission denied:", fallbackError);
      const isPermissionDenied = 
        fallbackError?.name === "NotAllowedError" || 
        fallbackError?.name === "PermissionDeniedError" || 
        /permission|denied|allowed/i.test(String(fallbackError?.message || fallbackError));

      if (isPermissionDenied) {
        setCameraError(
          "L'autorisation d'accès au flux caméra a été refusée ou restreinte par votre navigateur. L'appareil photo haute résolution de votre appareil a été activé en relais !"
        );
      } else {
        setCameraError(
          "Impossible d'ouvrir le flux caméra direct dans ce navigateur. Utilisez l'appareil photo haute résolution ci-dessous !"
        );
      }

      // Auto-trigger native camera capture so user doesn't get blocked
      setTimeout(() => {
        triggerNativeCapture();
      }, 300);
    }
  };

  const triggerNativeCapture = () => {
    cameraInputRef.current?.click();
  };

  const triggerGalleryPicker = () => {
    galleryInputRef.current?.click();
  };

  const processAndSubmitFiles = async (files: File[]) => {
    setCameraError(null);

    // Check if any file is an audio file
    const hasAudio = files.some(f => {
      const nameLower = f.name.toLowerCase();
      return f.type.startsWith("audio/") || /\.(mp3|wav|m4a|aac|ogg|webm|flac|amr|wma|mp4)$/i.test(nameLower);
    });

    if (hasAudio && onDirectFileUpload) {
      onDirectFileUpload(files);
      return;
    }

    setIsCropping(true);
    try {
      const rawImageUrls = await processUploadedDocumentFiles(files);
      if (rawImageUrls.length === 0) {
        setCameraError("Aucune image ni page PDF valide n'a pu être extraite. Veuillez vérifier vos fichiers.");
        setIsCropping(false);
        return;
      }

      let processed = rawImageUrls;
      if (autoCropEnabled && scanFilterMode !== "original") {
        try {
          processed = await autoCropBatch(rawImageUrls, { filterMode: scanFilterMode });
        } catch (e) {
          console.warn("AutoCrop batch skipped, using raw images:", e);
        }
      }

      setIsCropping(false);
      const allPages = [...capturedPages, ...processed];
      setCapturedPages(allPages);
    } catch (err: any) {
      console.error("Error processing document files:", err);
      setCameraError("Erreur lors du traitement des fichiers : " + (err.message || "Fichier invalide"));
      setIsCropping(false);
    }
  };

  const handleNativeCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processAndSubmitFiles(Array.from(files));
    }
    // Reset value so uploading the same file again triggers onChange
    e.target.value = "";
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
    setShowCamera(false);
  };

  const capturePhoto = async () => {
    if (videoRef.current && canvasRef.current) {
      setIsCapturing(true);
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      const MAX_WIDTH = 1200;
      let width = video.videoWidth;
      let height = video.videoHeight;
      
      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width);
        width = MAX_WIDTH;
      }
      
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        if (isNightModeEnhance || isScreenTorchOn) {
          ctx.filter = "brightness(1.15) contrast(1.2) saturate(1.1)";
        } else {
          ctx.filter = "none";
        }
        ctx.drawImage(video, 0, 0, width, height);
      }
      
      const dataUrl = canvas.toDataURL("image/jpeg", 0.85);

      if (autoCropEnabled) {
        const cropRes = await autoCropAndTrimPaper(dataUrl, { padding: 12, filterMode: scanFilterMode });
        setCapturedPages(prev => [...prev, cropRes.croppedDataUrl]);
      } else {
        setCapturedPages(prev => [...prev, dataUrl]);
      }
      
      setTimeout(() => setIsCapturing(false), 200);
    }
  };

  const removePage = (index: number) => {
    setCapturedPages(prev => prev.filter((_, i) => i !== index));
  };

  const finishCapture = () => {
    if (capturedPages.length > 0) {
      onImagesCaptured(capturedPages);
      stopCamera();
      setCapturedPages([]);
    }
  };

  const onDrop = useCallback((acceptedFiles: File[], fileRejections: any[]) => {
    const rejectedFiles = (fileRejections || []).map(r => r.file).filter(Boolean);
    const filesToProcess = [...acceptedFiles, ...rejectedFiles];

    if (filesToProcess.length > 0) {
      processAndSubmitFiles(filesToProcess);
    }
  }, [autoCropEnabled, onImagesCaptured]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles: File[], fileRejections: any[]) => onDrop(acceptedFiles, fileRejections),
    noClick: true, // Prevents dropzone from attaching conflicting internal click handlers
    multiple: true,
  } as any);

  return (
    <div className="w-full space-y-8">
      <div className="text-center space-y-3">
        <div className="flex items-center justify-center gap-4">
          <div className="h-[1px] w-12 bg-teal-500/30" />
          <motion.h2 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-[10px] uppercase font-mono text-teal-400 font-bold tracking-[0.4em] px-3 py-1 border border-teal-500/20 rounded-md bg-teal-500/5"
          >
            Neural Vision Interface v2.4
          </motion.h2>
          <div className="h-[1px] w-12 bg-teal-500/30" />
        </div>
        <motion.p 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-5xl md:text-6xl font-display font-light text-white tracking-tighter"
        >
          Numérisation <span className="text-teal-500 italic">IA</span>
        </motion.p>
      </div>



      {capturedPages.length > 0 && !showCamera && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-5 rounded-3xl bg-zinc-900/90 border border-teal-500/40 backdrop-blur-xl space-y-4 shadow-2xl ring-1 ring-teal-500/20"
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-3 h-3 rounded-full bg-teal-400 animate-pulse" />
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  Dossier de numérisation ({capturedPages.length} page{capturedPages.length > 1 ? "s" : ""})
                  <span className="text-[9px] font-mono font-normal text-teal-300 px-2 py-0.5 rounded-full bg-teal-500/20 border border-teal-500/30">
                    1 seul document final
                  </span>
                </h3>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                  Toutes les pages scannées seront compilées dans un même fichier Word, PDF et Excel.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={triggerNativeCapture}
                className="px-3 py-2 rounded-xl bg-teal-500/15 hover:bg-teal-500/30 text-teal-300 border border-teal-500/30 text-xs font-bold flex items-center gap-1.5 transition-all shadow-md"
                title="Scanner un autre papier avec l'appareil photo"
              >
                <Camera className="w-3.5 h-3.5 text-teal-400" />
                <span>+ Photo Papier</span>
              </button>

              <button
                type="button"
                onClick={triggerGalleryPicker}
                className="px-3 py-2 rounded-xl bg-teal-500/15 hover:bg-teal-500/30 text-teal-300 border border-teal-500/30 text-xs font-bold flex items-center gap-1.5 transition-all shadow-md"
                title="Ajouter un autre document ou image depuis la galerie"
              >
                <Upload className="w-3.5 h-3.5 text-teal-400" />
                <span>+ Galerie / Fichier</span>
              </button>

              <button
                type="button"
                onClick={() => audioInputRef.current?.click()}
                className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all shadow-md ${
                  attachedAudio 
                    ? "bg-indigo-500/30 border-indigo-400 text-indigo-200" 
                    : "bg-indigo-500/15 hover:bg-indigo-500/30 text-indigo-300 border-indigo-500/30"
                }`}
                title="Joindre un fichier audio ou une dictée vocale au manuscrit"
              >
                <Mic className="w-3.5 h-3.5 text-indigo-400" />
                <span>{attachedAudio ? "🎙️ Audio joint" : "+ Note Vocale / Audio"}</span>
              </button>

              <input
                type="file"
                ref={audioInputRef}
                accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.webm,.amr"
                className="hidden"
                onChange={async (e) => {
                  if (e.target.files && e.target.files[0]) {
                    const file = e.target.files[0];
                    try {
                      const { base64, mimeType } = await optimizeAudioBlob(file);
                      setAttachedAudio({ base64, mimeType, name: file.name });
                      showTemporaryNotice("🎙️ Fichier audio joint au manuscrit avec succès !");
                    } catch (err: any) {
                      showTemporaryNotice("Erreur fichier audio : " + (err.message || "invalide"));
                    }
                  }
                  e.target.value = "";
                }}
              />

              <button
                type="button"
                onClick={() => {
                  setPagesToEdit(capturedPages);
                  setShowEditorModal(true);
                }}
                className="px-3 py-2 rounded-xl bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 text-xs font-bold flex items-center gap-1.5 transition-all"
              >
                <Crop className="w-3.5 h-3.5 text-teal-400" />
                <span>✂️ Recadrer</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCapturedPages([]);
                  setAttachedAudio(null);
                }}
                className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs transition-all"
                title="Effacer tout le dossier"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {attachedAudio && (
            <div className="p-3 rounded-2xl bg-indigo-950/60 border border-indigo-500/40 flex items-center justify-between gap-3 text-xs text-indigo-200">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-300">
                  <FileAudio className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-bold text-white flex items-center gap-1.5">
                    Note Vocale / Fichier Audio joint
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-indigo-500/30 text-indigo-300 font-mono">
                      Multimodal
                    </span>
                  </p>
                  <p className="text-[10px] text-indigo-300/80 font-mono truncate max-w-xs sm:max-w-md">
                    {attachedAudio.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAttachedAudio(null)}
                className="p-1.5 rounded-lg hover:bg-indigo-500/20 text-indigo-300 hover:text-white transition-colors"
                title="Retirer l'audio joint"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
            {capturedPages.map((page, idx) => (
              <div key={idx} className="relative group aspect-[3/4] rounded-2xl overflow-hidden border border-teal-500/20 bg-black shadow-lg">
                <img src={page} alt={`Page ${idx + 1}`} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPagesToEdit([page]);
                      setShowEditorModal(true);
                    }}
                    className="p-2 rounded-xl bg-teal-500 text-black shadow-lg"
                    title="Ajuster les 4 coins de cette page"
                  >
                    <Crop className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removePage(idx)}
                    className="p-2 rounded-xl bg-red-500 text-white shadow-lg"
                    title="Supprimer la page du dossier"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="absolute bottom-1 left-1 bg-black/80 text-teal-400 text-[8px] font-mono font-bold px-1.5 py-0.5 rounded border border-white/10">
                  P.{idx + 1}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-white/5">
            <span className="text-[10px] text-slate-400 font-mono">
              💡 Cliquez sur "+ Photo Papier" pour ajouter une page supplémentaire à ce dossier.
            </span>

            <button
              type="button"
              onClick={() => {
                if (attachedAudio && onMultimodalCaptured) {
                  onMultimodalCaptured(capturedPages, attachedAudio.base64, attachedAudio.mimeType);
                } else {
                  onImagesCaptured(capturedPages);
                }
              }}
              className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-black font-bold text-xs uppercase tracking-widest transition-all shadow-xl shadow-teal-500/20 flex items-center justify-center gap-2 scale-105"
            >
              <Sparkles className="w-4 h-4 text-black" />
              <span>
                {attachedAudio 
                  ? `Numériser Manuscrit + Audio (${capturedPages.length} p. + 🎙️)` 
                  : `Numériser tout le dossier (${capturedPages.length} page${capturedPages.length > 1 ? "s" : ""})`}
              </span>
            </button>
          </div>
        </motion.div>
      )}

      {isCropping && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3 bg-teal-500/20 border border-teal-500/40 text-teal-200 text-xs rounded-xl flex items-center justify-center gap-2 font-mono uppercase tracking-wider"
        >
          <Sparkles className="w-4 h-4 text-teal-400 animate-spin" />
          <span>Détection des contours et rognage du papier en cours...</span>
        </motion.div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Direct live camera feed */}
        <motion.button
          whileHover={{ scale: 1.01, borderColor: "rgba(20, 184, 166, 0.4)" }}
          whileTap={{ scale: 0.99 }}
          onClick={startCamera}
          className="flex flex-col items-center justify-center p-6 glass-card rounded-xl gap-3 group transition-all relative overflow-hidden tech-grid scanner-effect text-left h-full w-full"
        >
          <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-teal-500/30 group-hover:border-teal-500 transition-colors" />
          <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-teal-500/30 group-hover:border-teal-500 transition-colors" />
          <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-teal-500/30 group-hover:border-teal-500 transition-colors" />
          <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-teal-500/30 group-hover:border-teal-500 transition-colors" />
          
          <div className="absolute inset-0 bg-teal-500/[0.03] opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="p-3 rounded-lg bg-zinc-950/80 border border-white/5 group-hover:border-teal-500 group-hover:text-teal-400 text-slate-500 transition-all shadow-2xl relative z-10">
            <Camera className="w-6 h-6" />
          </div>
          <div className="text-center relative z-10 space-y-1">
            <span className="block font-display text-lg text-white tracking-tight">{t.scanner.startCamera}</span>
            <span className="inline-block px-2 py-0.5 rounded-full text-[7px] font-mono uppercase tracking-[0.2em] border bg-teal-500/10 text-teal-400 border-teal-500/20">
              HTML5
            </span>
          </div>
        </motion.button>

        {/* Native mobile camera fallback for older or restricted Android devices */}
        <motion.button
          whileHover={{ scale: 1.01, borderColor: "rgba(20, 184, 166, 0.4)" }}
          whileTap={{ scale: 0.99 }}
          onClick={triggerNativeCapture}
          className="flex flex-col items-center justify-center p-6 glass-card rounded-xl gap-3 group transition-all relative overflow-hidden tech-grid scanner-effect text-left h-full w-full"
        >
          <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-teal-500/30 group-hover:border-teal-500 transition-colors" />
          <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-teal-500/30 group-hover:border-teal-500 transition-colors" />
          <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-teal-500/30 group-hover:border-teal-500 transition-colors" />
          <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-teal-500/30 group-hover:border-teal-500 transition-colors" />
          
          <div className="absolute inset-0 bg-teal-500/[0.03] opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="p-3 rounded-lg bg-zinc-950/80 border border-white/5 group-hover:border-teal-500 group-hover:text-teal-400 text-slate-500 transition-all shadow-2xl relative z-10">
            <Smartphone className="w-6 h-6" />
          </div>
          <div className="text-center relative z-10 space-y-1">
            <span className="block font-display text-lg text-white tracking-tight">{t.scanner.takePhoto}</span>
            <span className="inline-block px-2 py-0.5 rounded-full text-[7px] font-mono uppercase tracking-[0.2em] border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
              100%
            </span>
          </div>
        </motion.button>

        {/* Gallery / File selection */}
        <div
          onClick={triggerGalleryPicker}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              processAndSubmitFiles(Array.from(e.dataTransfer.files));
            }
          }}
          className="relative group cursor-pointer rounded-xl border border-white/5 hover:border-teal-500/50 hover:bg-teal-950/20 transition-all p-6 flex flex-col items-center justify-center gap-3 glass-card overflow-hidden tech-grid h-full"
        >
          <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-white/10 group-hover:border-teal-500/50 transition-colors" />
          <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-white/10 group-hover:border-teal-500/50 transition-colors" />
          <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-white/10 group-hover:border-teal-500/50 transition-colors" />
          <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-white/10 group-hover:border-teal-500/50 transition-colors" />

          <div className="absolute inset-0 bg-teal-500/[0.02] opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="p-3 rounded-lg bg-zinc-950/80 border border-white/5 group-hover:border-teal-500/40 text-slate-500 group-hover:text-teal-400 transition-all shadow-2xl relative z-10">
            <Upload className="w-6 h-6" />
          </div>
          <div className="text-center relative z-10 space-y-1">
            <span className="block font-display text-lg text-white tracking-tight">{t.scanner.choosePhotos}</span>
            <span className="inline-block px-2 py-0.5 rounded-full bg-white/5 text-[7px] text-slate-400 font-mono uppercase tracking-[0.2em] border border-white/10 group-hover:text-teal-300 group-hover:border-teal-500/30">
              {t.scanner.gallery} & {t.scanner.pdfDoc}
            </span>
          </div>
        </div>
      </div>

      {cameraError && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex flex-col md:flex-row items-center justify-between gap-3 text-left shadow-lg"
        >
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0 animate-pulse" />
            <span className="leading-relaxed font-light">{cameraError}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {typeof window !== "undefined" && window.self !== window.top && (
              <button
                type="button"
                onClick={() => window.open(window.location.href, "_blank")}
                className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white font-bold uppercase text-[9px] tracking-wider rounded-lg transition-all"
                title="Ouvrir dans un nouvel onglet pour autoriser la caméra"
              >
                Plein écran
              </button>
            )}
            <button
              type="button"
              onClick={triggerNativeCapture}
              className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-black font-bold uppercase text-[9px] tracking-wider rounded-lg transition-all shadow-md flex items-center gap-1.5"
            >
              <Smartphone className="w-3 h-3" />
              <span>Prendre une photo</span>
            </button>
            <button
              type="button"
              onClick={() => setCameraError(null)}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
              title="Fermer ce message"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      )}

      <AnimatePresence>
        {showCamera && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 transition-colors duration-300 ${
              isScreenTorchOn ? "bg-white" : "bg-zinc-950/95 backdrop-blur-2xl"
            }`}
          >
            {/* Screen Torch High-Brightness Night Ring Frame */}
            <div className={`relative w-full max-w-2xl rounded-[2.5rem] sm:rounded-[3rem] overflow-hidden transition-all duration-300 ${
              isScreenTorchOn 
                ? "bg-white border-8 sm:border-[16px] border-white shadow-[0_0_120px_rgba(255,255,255,1)] ring-8 ring-white" 
                : "bg-zinc-900 shadow-[0_0_80px_rgba(0,0,0,0.8)] border border-white/5"
            }`}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                // @ts-ignore
                webkit-playsinline="true"
                className={`w-full aspect-[3/4] object-cover transition-all duration-300 ${
                  isCapturing ? "brightness-150 scale-[1.02]" : ""
                } ${
                  isNightModeEnhance || isScreenTorchOn 
                    ? "brightness-125 contrast-125 saturate-125 filter" 
                    : "brightness-105"
                }`}
              />

              {/* Temporary Flash / Night Mode Notification Badge */}
              <AnimatePresence>
                {flashNotice && (
                  <motion.div
                    initial={{ opacity: 0, y: -20, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.9 }}
                    className="absolute top-20 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-full bg-black/85 border border-teal-500/40 text-teal-300 text-xs font-mono font-bold shadow-2xl flex items-center gap-2 backdrop-blur-md"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-teal-400 animate-spin" />
                    <span>{flashNotice}</span>
                  </motion.div>
                )}
              </AnimatePresence>
              
              {/* Technical Overlay & Grid */}
              <div className="absolute inset-0 pointer-events-none p-6 sm:p-8 flex flex-col justify-between">
                <div className="absolute inset-6 sm:inset-8 border border-white/10 rounded-2xl">
                  <div className="absolute -top-1 -left-1 w-6 h-6 border-t-2 border-l-2 border-teal-500 rounded-tl-lg" />
                  <div className="absolute -top-1 -right-1 w-6 h-6 border-t-2 border-r-2 border-teal-500 rounded-tr-lg" />
                  <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-2 border-l-2 border-teal-500 rounded-bl-lg" />
                  <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-2 border-r-2 border-teal-500 rounded-br-lg" />
                </div>

                {/* Optional Grid alignment lines */}
                {showGridOverlay && (
                  <div className="absolute inset-6 sm:inset-8 grid grid-cols-3 grid-rows-3 pointer-events-none">
                    <div className="border-r border-b border-teal-500/20" />
                    <div className="border-r border-b border-teal-500/20" />
                    <div className="border-b border-teal-500/20" />
                    <div className="border-r border-b border-teal-500/20" />
                    <div className="border-r border-b border-teal-500/20 flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full border border-teal-500/40 flex items-center justify-center">
                        <div className="w-2 h-2 bg-teal-400 rounded-full animate-ping" />
                      </div>
                    </div>
                    <div className="border-b border-teal-500/20" />
                    <div className="border-r border-teal-500/20" />
                    <div className="border-r border-teal-500/20" />
                    <div />
                  </div>
                )}
                
                <div className="flex justify-between items-start">
                  <div className="w-8 h-8 border-t-2 border-l-2 border-teal-500/50" />
                  <div className="w-8 h-8 border-t-2 border-r-2 border-teal-500/50" />
                </div>
                <div className="flex flex-col items-center gap-2">
                   <div className="w-48 h-[1px] bg-gradient-to-r from-transparent via-teal-500 to-transparent animate-pulse" />
                   <span className="text-[10px] font-mono text-teal-400 uppercase tracking-widest bg-black/60 px-3 py-1 rounded-full border border-teal-500/20 backdrop-blur-sm">
                     {isNightModeEnhance || isFlashOn || isScreenTorchOn ? "⚡ Scan Nocturne IA Actif" : "Viseur CamScanner"}
                   </span>
                </div>
                <div className="flex justify-between items-end">
                  <div className="w-8 h-8 border-b-2 border-l-2 border-teal-500/50" />
                  <div className="w-8 h-8 border-b-2 border-r-2 border-teal-500/50" />
                </div>
              </div>
              
              {/* Camera Header Bar */}
              <div className="absolute top-4 sm:top-6 left-4 sm:left-6 right-4 sm:right-6 flex justify-between items-center z-20 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    stopCamera();
                    setCapturedPages([]);
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-black/70 backdrop-blur-md text-slate-200 hover:text-white transition-all border border-white/10 text-xs font-mono font-bold hover:bg-black/90 shrink-0"
                  title="Fermer la caméra et revenir à l'accueil"
                >
                  <ArrowLeft className="w-4 h-4 text-teal-400" />
                  <span className="hidden sm:inline">Retour</span>
                </button>

                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div className="bg-teal-500 text-black px-3.5 sm:px-4 py-1.5 rounded-full font-bold text-[10px] sm:text-[11px] uppercase tracking-wider shadow-[0_0_20px_rgba(20,184,166,0.4)] whitespace-nowrap">
                     Page {capturedPages.length + 1}
                  </div>

                  <button
                    onClick={() => setShowGridOverlay(!showGridOverlay)}
                    className={`p-2 sm:p-2.5 rounded-full backdrop-blur-md border border-white/10 transition-colors ${
                      showGridOverlay ? "bg-teal-500/30 text-teal-300" : "bg-black/60 text-slate-400"
                    }`}
                    title="Activer/Désactiver la grille de cadrage"
                  >
                    <Grid className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                  </button>

                  <button
                    onClick={toggleNightMode}
                    className={`p-2 sm:p-2.5 rounded-full backdrop-blur-md border transition-all ${
                      isNightModeEnhance 
                        ? "bg-indigo-500 text-white border-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.6)]" 
                        : "bg-black/60 text-slate-400 border-white/10 hover:text-white"
                    }`}
                    title={isNightModeEnhance ? "Mode Nuit activé (Rehaussement basse lumière)" : "Activer le Mode Nuit (Basse lumière)"}
                  >
                    <Moon className={`w-4 h-4 sm:w-4.5 sm:h-4.5 ${isNightModeEnhance ? "fill-white" : ""}`} />
                  </button>
                </div>

                {/* Night Flash & Torch Button */}
                <button
                  type="button"
                  onClick={toggleFlash}
                  className={`p-2.5 sm:p-3 rounded-full backdrop-blur-md transition-all border shrink-0 ${
                    isFlashOn || isScreenTorchOn 
                      ? "bg-amber-400 text-black border-amber-300 shadow-[0_0_25px_rgba(251,191,36,0.8)] scale-105" 
                      : "bg-black/60 text-slate-300 hover:text-white border-white/10"
                  }`}
                  title={
                    hasTorch 
                      ? (isFlashOn ? "Éteindre le Flash Torche" : "Allumer le Flash Torche (Nuit)")
                      : (isScreenTorchOn ? "Éteindre le Flash Écran" : "Allumer le Flash Écran Nocturne")
                  }
                >
                  <Zap className={`w-4 h-4 sm:w-5 sm:h-5 ${isFlashOn || isScreenTorchOn ? "fill-current animate-pulse" : ""}`} />
                </button>
              </div>
              
              <div className="absolute top-24 left-0 right-0 px-4 flex items-center gap-2 overflow-x-auto no-scrollbar py-2">
                 {capturedPages.map((page, idx) => (
                   <motion.div 
                     key={idx}
                     initial={{ scale: 0.8, opacity: 0 }}
                     animate={{ scale: 1, opacity: 1 }}
                     className="relative flex-shrink-0 w-16 h-20 rounded-lg border border-teal-500/50 overflow-hidden bg-black shadow-lg"
                   >
                     <img src={page} className="w-full h-full object-cover opacity-60" />
                     <button 
                       onClick={() => removePage(idx)}
                       className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full p-0.5"
                     >
                       <X className="w-2.5 h-2.5" />
                     </button>
                     <div className="absolute bottom-0 inset-x-0 bg-teal-500 text-black text-[6px] font-bold text-center py-0.5">
                       P{idx + 1}
                     </div>
                   </motion.div>
                 ))}

                 {capturedPages.length > 0 && (
                   <button
                     onClick={() => {
                       setPagesToEdit(capturedPages);
                       setShowEditorModal(true);
                     }}
                     className="flex-shrink-0 px-3 py-2 rounded-xl bg-teal-500/20 border border-teal-500/40 text-teal-300 text-xs font-bold flex items-center gap-1.5 hover:bg-teal-500/30 transition-all"
                   >
                     <SlidersHorizontal className="w-4 h-4 text-teal-400" />
                     <span>Éditer 4-Corners & Filtres</span>
                   </button>
                 )}
              </div>
              
              <div className="absolute bottom-12 left-0 right-0 flex items-center justify-center gap-10">
                <button
                  onClick={capturePhoto}
                  className="w-24 h-24 rounded-full border border-white/20 p-2 flex items-center justify-center bg-black/40 backdrop-blur-md"
                >
                  <div className="w-full h-full rounded-full bg-teal-500 shadow-[0_0_30px_rgba(20,184,166,0.6)] hover:scale-95 transition-transform" />
                </button>
                <button
                  onClick={finishCapture}
                  disabled={capturedPages.length === 0}
                  className="px-8 py-5 rounded-3xl bg-white text-black font-bold text-[10px] uppercase tracking-[0.2em] hover:bg-slate-200 transition-all disabled:opacity-20 disabled:grayscale shadow-2xl"
                >
                  Lancer OCR IA & Word {capturedPages.length > 0 && `(${capturedPages.length})`}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <canvas ref={canvasRef} className="hidden" />
      
      {/* Native Camera Input (Forces environment camera on mobile) */}
      <input 
        type="file" 
        accept="image/*" 
        capture="environment" 
        ref={cameraInputRef} 
        onChange={handleNativeCapture} 
        className="hidden" 
      />

      {/* Gallery & Multi-Document Input (Images, PDFs, Word, Text, Audio) */}
      <input 
        type="file" 
        accept="image/*,audio/*,video/*,.pdf,application/pdf,.doc,.docx,.txt,.csv,.rtf,.heic,.heif,.mp3,.wav,.m4a,.aac,.ogg,.webm,.flac,.amr,.wma,.mp4" 
        multiple
        ref={galleryInputRef} 
        onChange={handleNativeCapture} 
        className="hidden" 
      />

      {/* Document Crop & Filter Editor Modal */}
      <DocumentEditorModal
        isOpen={showEditorModal}
        pages={pagesToEdit}
        onClose={() => setShowEditorModal(false)}
        onSave={(processedPages) => {
          setCapturedPages(processedPages);
          setShowEditorModal(false);
        }}
        selectedLanguage={selectedLanguage}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-10 border-t border-white/5">
        {[
          { title: t.scanner.hdCamera, desc: t.scanner.autoCropHd, stat: "98.4%" },
          { title: t.scanner.handwritingOcr, desc: t.scanner.autoDetectEnabled, stat: "Ultra-HD" },
          { title: t.scanner.dataProtection, desc: t.scanner.secureImport, stat: "AES-256" }
        ].map((item, idx) => (
          <div key={idx} className="flex gap-4 items-start">
            <div className="w-1.5 h-1.5 bg-teal-500 rounded-full mt-1 animate-pulse" />
            <div className="space-y-1">
              <h4 className="text-[9px] font-mono text-teal-400 uppercase tracking-[0.2em] font-bold">{item.title}</h4>
              <p className="text-xs text-white font-medium">{item.desc}</p>
              <div className="text-[8px] font-mono text-slate-600 uppercase tracking-widest bg-white/5 inline-block px-2 py-0.5 rounded">
                Status: {item.stat}
              </div>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}

