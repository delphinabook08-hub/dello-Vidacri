import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Zap, Globe, LayoutGrid, FileText, Loader2, Settings, Share2, Smartphone, Sparkles, X, Mic, Camera, Upload, HardDrive, FileAudio, ArrowLeft, ArrowRight, RotateCcw, History, Palette, Sun, Moon } from "lucide-react";
import { compressImagesInParallel } from "./lib/imageCompressor";
import { optimizeAudioBlob } from "./lib/audioCompressor";
import Scanner from "./components/Scanner";
import VoiceRecorder from "./components/VoiceRecorder";
import ResultView from "./components/ResultView";
import LoadingOverlay from "./components/LoadingOverlay";

import SettingsModal, { ColorPalette } from "./components/SettingsModal";
import QRCodeModal from "./components/QRCodeModal";
import TermsModal from "./components/TermsModal";
import OnboardingModal from "./components/OnboardingModal";
import LanguageSelectionModal from "./components/LanguageSelectionModal";
import OfflineBanner from "./components/OfflineBanner";
import { ForceUpdateModal } from "./components/ForceUpdateModal";
import { AdminDashboardModal } from "./components/AdminDashboardModal";
import { AppLogo } from "./components/AppLogo";
import { checkAppVersion, CURRENT_APP_VERSION, RemoteVersionInfo } from "./lib/versionManager";
import { getTranslations } from "./lib/translations";
import { trackUserVisit, trackAnalyticsEvent } from "./lib/analytics";
import { autoFormatAndPunctuateText } from "./lib/textUtils";

export interface TranscriptionResult {
  text: string;
  tableData?: string[][];
  summary?: string;
  keyPoints?: string[];
}

const LANGUAGES = [
  { code: "French", label: "Français" },
  { code: "English", label: "English" },
  { code: "Chinese", label: "中文 (Chinese)" },
  { code: "Ukrainian", label: "Українська (Ukrainian)" },
  { code: "Russian", label: "Русский (Russian)" },
  { code: "German", label: "Deutsch (German)" },
  { code: "Spanish", label: "Español (Spanish)" },
  { code: "Portuguese", label: "Português" },
  { code: "Arabic", label: "العربية (Arabic)" },
  { code: "Italian", label: "Italiano" },
  { code: "Japanese", label: "日本語" },
  { code: "Lingala", label: "Lingala" },
  { code: "Swahili", label: "Kiswahili" },
  { code: "Tshiluba", label: "Tshiluba (Ciluba)" },
  { code: "Kikongo", label: "Kikongo (Kikongo ya Leta)" },
  { code: "Dhu Alur", label: "Dhu Alur / Mahagi (RDC)" },
];

async function parseApiResponse<T = any>(response: Response, defaultErrorMsg: string): Promise<T> {
  const text = await response.text().catch(() => "");
  const trimmed = text.trim();

  // Handle server warmup, proxy 503/504 or Vite HTML fallback pages
  if (
    trimmed.startsWith("<!doctype") || 
    trimmed.startsWith("<html") || 
    trimmed.includes("Please wait while your application starts") ||
    trimmed.includes("Starting Server") ||
    trimmed.includes("503 Service Unavailable") ||
    trimmed.includes("504 Gateway")
  ) {
    if (response.status === 503 || trimmed.includes("503") || trimmed.includes("high demand") || trimmed.includes("UNAVAILABLE")) {
      throw new Error("Les serveurs d'IA sont temporairement très sollicités. Veuillez relancer l'analyse dans quelques secondes.");
    }
    throw new Error("Le serveur est en cours de synchronisation. Veuillez patienter un instant et réessayer.");
  }

  if (!response.ok) {
    let serverError = defaultErrorMsg;
    try {
      const errObj = JSON.parse(trimmed);
      if (errObj && errObj.error) {
        serverError = errObj.error;
        try {
          const nested = JSON.parse(serverError);
          if (nested?.error?.message) {
            serverError = nested.error.message;
          }
        } catch (_) {}
      }
    } catch (_) {}
    throw new Error(serverError);
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch (e) {
    console.error("API response JSON parse error:", e, text);
    throw new Error("Le serveur a renvoyé une réponse non valide. Veuillez recharger et réessayer.");
  }
}

export default function App() {
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [transcriptionResult, setTranscriptionResult] = useState<TranscriptionResult | null>(null);
  const [lastTranscriptionResult, setLastTranscriptionResult] = useState<TranscriptionResult | null>(null);
  const [lastCapturedImages, setLastCapturedImages] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState(() => {
    return localStorage.getItem("abookscan_selected_language") || "French";
  });
  const [isLanguageModalOpen, setIsLanguageModalOpen] = useState(() => {
    return !localStorage.getItem("abookscan_selected_language");
  });

  const handleLanguageChange = (lang: string) => {
    setSelectedLanguage(lang);
    localStorage.setItem("abookscan_selected_language", lang);
    setIsLanguageModalOpen(false);
  };

  const t = getTranslations(selectedLanguage);
  const [activeTab, setActiveTab] = useState<"ocr" | "voice">("ocr");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);
  const [isAdminDashboardOpen, setIsAdminDashboardOpen] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(() => {
    return !localStorage.getItem("abookscan_onboarded");
  });
  const [history, setHistory] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem("abookscan_history");
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
    } catch (e) {
      console.error("Failed to parse history from localStorage", e);
      return [];
    }
  });
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBtn, setShowInstallBtn] = useState(false);
  const [qrModalTab, setQrModalTab] = useState<"share" | "install" | "twa">("share");
  const [showFloatingInstallBanner, setShowFloatingInstallBanner] = useState(false);
  const [openedFileNotice, setOpenedFileNotice] = useState<string | null>(null);
  const directFileInputRef = useRef<HTMLInputElement | null>(null);

  // Forced Version Update & Netlify synchronization control
  const [updateRequired, setUpdateRequired] = useState(false);
  const [remoteVersionInfo, setRemoteVersionInfo] = useState<RemoteVersionInfo | null>(null);

  useEffect(() => {
    const performVersionVerification = async () => {
      try {
        const result = await checkAppVersion();
        if (result.isMandatory || (result.isOutdated && result.remoteInfo?.forceUpdate)) {
          setRemoteVersionInfo(result.remoteInfo);
          setUpdateRequired(true);
        }
      } catch (err) {
        console.warn("Version verification failed:", err);
      }
    };

    // 1. Initial check upon loading
    performVersionVerification();
    trackUserVisit(selectedLanguage);

    // 2. Periodic check every 2 minutes
    const interval = setInterval(performVersionVerification, 2 * 60 * 1000);

    // 3. Trigger check immediately when user returns to the tab/app
    const handleVisibility = () => {
      if (!document.hidden) {
        performVersionVerification();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);

    // 4. Listen to ServiceWorker updates
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        performVersionVerification();
      });
    }

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, []);

  // Advanced confidentiality features for maximum Android compliance
  const [isPrivateMode, setIsPrivateMode] = useState(() => {
    return localStorage.getItem("abookscan_private_mode") === "true";
  });
  const [isScreenProtect, setIsScreenProtect] = useState(() => {
    return localStorage.getItem("abookscan_screen_protect") === "true";
  });
  const [isBlurred, setIsBlurred] = useState(false);

  // Theme & Color Palette management
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const saved = localStorage.getItem("abookscan_theme");
    return saved === "light" ? "light" : "dark";
  });

  const [colorPalette, setColorPalette] = useState<ColorPalette>(() => {
    const saved = localStorage.getItem("abookscan_palette") as ColorPalette | null;
    if (saved && ["emerald", "amethyst", "sunset", "sapphire"].includes(saved)) {
      return saved;
    }
    return "emerald";
  });

  const handleThemeChange = (newTheme: "dark" | "light") => {
    setTheme(newTheme);
    localStorage.setItem("abookscan_theme", newTheme);
  };

  const handlePaletteChange = (palette: ColorPalette) => {
    setColorPalette(palette);
    localStorage.setItem("abookscan_palette", palette);
  };

  const cycleNextPalette = () => {
    const palettes: ColorPalette[] = ["emerald", "amethyst", "sunset", "sapphire"];
    const nextIdx = (palettes.indexOf(colorPalette) + 1) % palettes.length;
    handlePaletteChange(palettes[nextIdx]);
  };

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.add("light");
      root.classList.remove("dark");
    } else {
      root.classList.add("dark");
      root.classList.remove("light");
    }
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("palette-emerald", "palette-amethyst", "palette-sunset", "palette-sapphire");
    root.classList.add(`palette-${colorPalette}`);
  }, [colorPalette]);

  const handlePrivateModeChange = (val: boolean) => {
    setIsPrivateMode(val);
    localStorage.setItem("abookscan_private_mode", String(val));
  };

  const handleScreenProtectChange = (val: boolean) => {
    setIsScreenProtect(val);
    localStorage.setItem("abookscan_screen_protect", String(val));
    if (!val) {
      setIsBlurred(false);
    }
  };

  useEffect(() => {
    const handleBlur = () => {
      if (isScreenProtect) {
        setIsBlurred(true);
      }
    };
    const handleFocus = () => {
      setIsBlurred(false);
    };
    const handleVisibilityUpdate = () => {
      if (document.hidden && isScreenProtect) {
        setIsBlurred(true);
      } else {
        setIsBlurred(false);
      }
    };

    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityUpdate);

    return () => {
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityUpdate);
    };
  }, [isScreenProtect]);

  // Mode Retour : Prise en charge intelligente du bouton Retour Android & Navigateur (popstate)
  useEffect(() => {
    const handlePopState = () => {
      // 1. Priorité fermeture des modales si ouvertes
      if (isAdminDashboardOpen) {
        setIsAdminDashboardOpen(false);
        return;
      }
      if (isSettingsOpen) {
        setIsSettingsOpen(false);
        return;
      }
      if (isQRModalOpen) {
        setIsQRModalOpen(false);
        return;
      }
      if (isTermsOpen) {
        setIsTermsOpen(false);
        return;
      }
      if (isLanguageModalOpen) {
        setIsLanguageModalOpen(false);
        return;
      }
      // 2. Si on est dans les résultats, retour fluide au scanner avec rétention en mémoire
      if (transcriptionResult) {
        setLastTranscriptionResult(transcriptionResult);
        setLastCapturedImages(capturedImages);
        setTranscriptionResult(null);
        return;
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [
    isAdminDashboardOpen, 
    isSettingsOpen, 
    isQRModalOpen, 
    isTermsOpen, 
    isLanguageModalOpen, 
    transcriptionResult, 
    capturedImages
  ]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBtn(true);
      const dismissed = sessionStorage.getItem("abookscan_install_dismissed") === "true";
      if (!dismissed) {
        setShowFloatingInstallBanner(true);
      }
    };

    const handleAppInstalled = () => {
      setShowInstallBtn(false);
      setShowFloatingInstallBanner(false);
      setDeferredPrompt(null);
      console.log("AbookScan IA was successfully installed as a native WebAPK/PWA app!");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    // Automative delayed check for general PWA promotion (e.g. mobile Safari)
    const isCurrentlyStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    const dismissed = sessionStorage.getItem("abookscan_install_dismissed") === "true";

    if (!isCurrentlyStandalone && !dismissed) {
      const timer = setTimeout(() => {
        setShowFloatingInstallBanner(true);
      }, 5000);
      return () => {
        window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
        window.removeEventListener("appinstalled", handleAppInstalled);
        clearTimeout(timer);
      };
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      console.log("Device app installation accepted by user");
    }
    setDeferredPrompt(null);
    setShowInstallBtn(false);
    setShowFloatingInstallBanner(false);
  };

  const handleDismissFloatingBanner = () => {
    setShowFloatingInstallBanner(false);
    sessionStorage.setItem("abookscan_install_dismissed", "true");
  };

  const handleOpenInstallGuide = () => {
    setQrModalTab("install");
    setIsQRModalOpen(true);
    setShowFloatingInstallBanner(false);
  };

  const handleInstallClick = () => {
    if (deferredPrompt) {
      handleInstallApp();
    } else {
      handleOpenInstallGuide();
    }
  };

  // Web Launch Queue & PWA Share Target system handler ("Ouvrir avec AbookScan IA")
  useEffect(() => {
    const checkSharedFileInIDB = async () => {
      try {
        const request = indexedDB.open("abookscan_share_db", 1);
        request.onsuccess = (e: any) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains("shared_files")) return;
          const tx = db.transaction("shared_files", "readwrite");
          const store = tx.objectStore("shared_files");
          const getReq = store.get("latest_file");
          getReq.onsuccess = () => {
            const item = getReq.result;
            if (item && item.file) {
              store.delete("latest_file");
              const file = item.file;
              setOpenedFileNotice(file.name || "Fichier externe");
              handleDirectLocalFileUpload([file]);
            }
          };
        };
      } catch (err) {
        console.warn("Could not read shared file from IDB:", err);
      }
    };

    if ("launchQueue" in window) {
      try {
        (window as any).launchQueue.setConsumer(async (launchParams: any) => {
          if (launchParams.files && launchParams.files.length > 0) {
            const filesArr: File[] = [];
            for (const handle of launchParams.files) {
              const file = await handle.getFile();
              if (file) filesArr.push(file);
            }
            if (filesArr.length > 0) {
              setOpenedFileNotice(filesArr[0].name);
              handleDirectLocalFileUpload(filesArr);
            }
          }
        });
      } catch (e) {
        console.warn("LaunchQueue error:", e);
      }
    }

    const query = new URLSearchParams(window.location.search);
    if (query.get("shared_file") === "1" || query.get("share_target") === "true" || query.get("file_handler") === "true") {
      checkSharedFileInIDB();
      window.history.replaceState({}, document.title, window.location.pathname);
    } else {
      checkSharedFileInIDB();
    }
  }, []);

  const handleImagesCaptured = async (base64Array: string[]) => {
    if (!navigator.onLine) {
      setError(t.offline?.message || "Connexion Internet absente. Veuillez vérifier votre réseau Wi-Fi ou vos données mobiles.");
      return;
    }

    setCapturedImages(base64Array);
    setIsProcessing(true);
    setError(null);
    
    try {
      const mimeType = "image/jpeg";
      // Optimize images for ultra-fast and reliable multi-page network payload
      const optimizedImages = await compressImagesInParallel(base64Array, 1080, 0.78);
      
      const payload = JSON.stringify({
        base64Images: optimizedImages,
        mimeType,
        language: selectedLanguage,
      });

      let response = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      });

      // Seamless auto-retry on temporary 503 or demand spike
      if (response.status === 503) {
        await new Promise(res => setTimeout(res, 1200));
        response = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
        });
      }

      const result = await parseApiResponse<TranscriptionResult>(
        response, 
        "La transcription a échoué. Veuillez réessayer."
      );

      setTranscriptionResult(result);
      setLastTranscriptionResult(result);
      setLastCapturedImages(base64Array);
      try {
        window.history.pushState({ view: "result" }, "");
      } catch (_) {}
      trackAnalyticsEvent("scan", { pages: base64Array.length });
      
      // Zero-Retention check: skip logging if in private mode
      if (!isPrivateMode) {
        const newHistoryItem = {
          text: result.text,
          preview: base64Array[0] && base64Array[0].length < 100000 ? base64Array[0] : undefined,
          date: new Date().toLocaleString(),
          images: [], // Exclude multi-megabyte raw base64 arrays from state/localStorage to keep app lightweight
          result: result
        };
        
        const updatedHistory = [newHistoryItem, ...history].slice(0, 5);
        setHistory(updatedHistory);
        try {
          // Store lightweight history without giant base64 payloads to prevent localstorage freeze
          const lightweight = updatedHistory.map(h => ({
            text: h.text,
            date: h.date,
            type: h.type,
            result: h.result,
            preview: h.preview && h.preview.length < 50000 ? h.preview : undefined
          }));
          localStorage.setItem("abookscan_history", JSON.stringify(lightweight));
        } catch (e) {
          console.warn("localStorage quota reached for history, storing trimmed version", e);
        }
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : "Transcription failed");
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAudioCaptured = async (
    base64Audio: string,
    mimeType: string,
    promptMode: "formatted" | "verbatim" | "meeting_notes"
  ) => {
    if (!navigator.onLine) {
      setError(t.offline?.message || "Connexion Internet absente. Veuillez vérifier votre réseau Wi-Fi ou vos données mobiles.");
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const audioPayload = JSON.stringify({
        audioBase64: base64Audio,
        mimeType,
        language: selectedLanguage,
        promptMode,
      });

      let response = await fetch("/api/transcribe-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: audioPayload,
      });

      if (response.status === 503) {
        await new Promise(res => setTimeout(res, 1200));
        response = await fetch("/api/transcribe-audio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: audioPayload,
        });
      }

      const result = await parseApiResponse<{ text: string; summary?: string; keyPoints?: string[] }>(
        response, 
        "La transcription vocale a échoué. Veuillez réessayer."
      );

      // Raw, verbatim or formatted transcript text WITHOUT forcing summary at top
      let combinedText = result.text;

      // Only if mode was explicitly "summary" or "meeting_notes", append/prepend executive summary
      if (((promptMode as string) === "summary" || (promptMode as string) === "meeting_notes") && result.summary) {
        combinedText = `📌 SYNTHÈSE VOCALE :\n${result.summary}\n\n` + combinedText;
        if (result.keyPoints && result.keyPoints.length > 0) {
          combinedText += `\n\n🔑 POINTS CLÉS :\n` + result.keyPoints.map((kp: string) => `• ${kp}`).join("\n");
        }
      }

      const finalResult: TranscriptionResult = {
        text: combinedText,
        summary: result.summary,
        keyPoints: result.keyPoints,
      };

      setTranscriptionResult(finalResult);
      setLastTranscriptionResult(finalResult);
      setLastCapturedImages([]);
      try {
        window.history.pushState({ view: "result" }, "");
      } catch (_) {}
      trackAnalyticsEvent("voice", { mode: promptMode });

      if (!isPrivateMode) {
        const newHistoryItem = {
          text: finalResult.text,
          preview: "/icon.png",
          date: new Date().toLocaleString(),
          images: [],
          result: finalResult,
          type: "audio"
        };
        
        const updatedHistory = [newHistoryItem, ...history].slice(0, 5);
        setHistory(updatedHistory);
        try {
          const lightweight = updatedHistory.map(h => ({
            text: h.text,
            date: h.date,
            type: h.type,
            result: h.result,
            preview: h.preview && h.preview.length < 50000 ? h.preview : undefined
          }));
          localStorage.setItem("abookscan_history", JSON.stringify(lightweight));
        } catch (e) {
          console.warn("localStorage quota exceeded for audio history", e);
        }
      }
    } catch (err: any) {
      let rawError = err instanceof Error ? err.message : "Échec de la transcription vocale";
      if (rawError === "Failed to fetch" || rawError.includes("Failed to fetch") || rawError.includes("NetworkError")) {
        rawError = "Connexion au serveur interrompue (fichier audio volumineux ou réseau instable). L'audio a été automatiquement optimisé. Veuillez réanalyser.";
      }
      setError(rawError);
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDirectTextCaptured = (text: string) => {
    if (!text || !text.trim()) return;

    // Apply automatic formatting and punctuation correction
    const formatted = autoFormatAndPunctuateText(text, selectedLanguage);

    const finalResult: TranscriptionResult = {
      text: formatted || text.trim(),
    };

    setTranscriptionResult(finalResult);
    setLastTranscriptionResult(finalResult);
    setLastCapturedImages([]);
    try {
      window.history.pushState({ view: "result" }, "");
    } catch (_) {}
    trackAnalyticsEvent("voice", { mode: "direct" });

    if (!isPrivateMode) {
      const newHistoryItem = {
        text: finalResult.text,
        preview: "/icon.png",
        date: new Date().toLocaleString(),
        images: [],
        result: finalResult,
        type: "audio" as const,
      };
      
      const updatedHistory = [newHistoryItem, ...history].slice(0, 5);
      setHistory(updatedHistory);
      try {
        const lightweight = updatedHistory.map(h => ({
          text: h.text,
          date: h.date,
          type: h.type,
          result: h.result,
          preview: h.preview && h.preview.length < 50000 ? h.preview : undefined
        }));
        localStorage.setItem("abookscan_history", JSON.stringify(lightweight));
      } catch (e) {
        console.warn("localStorage quota exceeded for direct voice history", e);
      }
    }
  };

  const handleMultimodalCaptured = async (
    base64Images: string[],
    base64Audio: string,
    audioMimeType: string = "audio/webm"
  ) => {
    if (!navigator.onLine) {
      setError(t.offline?.message || "Connexion Internet absente. Veuillez vérifier votre réseau Wi-Fi ou vos données mobiles.");
      return;
    }

    setCapturedImages(base64Images);
    setIsProcessing(true);
    setError(null);

    try {
      const optimizedImages = await compressImagesInParallel(base64Images, 1200, 0.85);

      const multiPayload = JSON.stringify({
        base64Images: optimizedImages,
        audioBase64: base64Audio,
        audioMimeType,
        mimeType: "image/jpeg",
        language: selectedLanguage,
      });

      let response = await fetch("/api/transcribe-multimodal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: multiPayload,
      });

      if (response.status === 503) {
        await new Promise(res => setTimeout(res, 1200));
        response = await fetch("/api/transcribe-multimodal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: multiPayload,
        });
      }

      const result = await parseApiResponse<TranscriptionResult>(
        response,
        "La transcription combinée (audio + manuscrit) a échoué. Veuillez réessayer."
      );

      setTranscriptionResult(result);
      setLastTranscriptionResult(result);
      setLastCapturedImages(base64Images);
      try {
        window.history.pushState({ view: "result" }, "");
      } catch (_) {}
      trackAnalyticsEvent("multimodal_scan", { pages: base64Images.length });

      if (!isPrivateMode) {
        const newHistoryItem = {
          text: result.text,
          preview: base64Images[0] && base64Images[0].length < 100000 ? base64Images[0] : undefined,
          date: new Date().toLocaleString(),
          images: [],
          result: result,
          type: "multimodal",
        };
        const updatedHistory = [newHistoryItem, ...history].slice(0, 5);
        setHistory(updatedHistory);
        try {
          const lightweight = updatedHistory.map(h => ({
            text: h.text,
            date: h.date,
            type: h.type,
            result: h.result,
            preview: h.preview && h.preview.length < 50000 ? h.preview : undefined
          }));
          localStorage.setItem("abookscan_history", JSON.stringify(lightweight));
        } catch (e) {
          console.warn("localStorage quota reached for history", e);
        }
      }
    } catch (err: any) {
      setError(err instanceof Error ? err.message : "Échec de l'analyse combinée");
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDirectLocalFileUpload = async (files: File[]) => {
    if (!files || files.length === 0) return;
    setError(null);

    const audioFiles: File[] = [];
    const docFiles: File[] = [];

    for (const file of files) {
      const nameLower = file.name.toLowerCase();
      const isAudio = file.type.startsWith("audio/") || file.type.startsWith("video/") || /\.(mp3|wav|m4a|aac|ogg|webm|flac|amr|wma|mp4)$/i.test(nameLower);
      if (isAudio) {
        audioFiles.push(file);
      } else {
        docFiles.push(file);
      }
    }

    // Both audio and manuscript documents submitted together
    if (audioFiles.length > 0 && docFiles.length > 0) {
      setIsProcessing(true);
      try {
        const { processUploadedDocumentFiles } = await import("./lib/pdfConverter");
        const rawImageUrls = await processUploadedDocumentFiles(docFiles);
        const { base64: audioBase64, mimeType: audioMimeType } = await optimizeAudioBlob(audioFiles[0]);
        if (rawImageUrls.length === 0) {
          handleAudioCaptured(audioBase64, audioMimeType, "formatted");
          return;
        }
        await handleMultimodalCaptured(rawImageUrls, audioBase64, audioMimeType);
      } catch (err: any) {
        setError("Erreur lors du traitement combiné audio et manuscrit : " + (err.message || "Fichiers invalides"));
        setIsProcessing(false);
      }
      return;
    }

    if (audioFiles.length > 0) {
      const audioFile = audioFiles[0];
      setIsProcessing(true);
      setActiveTab("voice");
      try {
        const { base64, mimeType } = await optimizeAudioBlob(audioFile);
        handleAudioCaptured(base64, mimeType, "formatted");
      } catch (err: any) {
        setError("Erreur lors de la préparation du fichier audio local : " + (err.message || "Fichier invalide"));
        setIsProcessing(false);
      }
      return;
    }

    if (docFiles.length > 0) {
      setIsProcessing(true);
      setActiveTab("ocr");
      try {
        const { processUploadedDocumentFiles } = await import("./lib/pdfConverter");
        const rawImageUrls = await processUploadedDocumentFiles(docFiles);
        if (rawImageUrls.length === 0) {
          setError("Aucun contenu manuscrit ou document valide n'a pu être extrait.");
          setIsProcessing(false);
          return;
        }
        handleImagesCaptured(rawImageUrls);
      } catch (err: any) {
        setError("Erreur lors de l'importation du fichier local : " + (err.message || "Fichier non supporté"));
        setIsProcessing(false);
      }
    }
  };

  const handleReset = () => {
    if (transcriptionResult) {
      setLastTranscriptionResult(transcriptionResult);
      setLastCapturedImages(capturedImages);
    }
    // Aggressive clearing for Private Mode document protection
    if (isPrivateMode) {
      setCapturedImages([]);
      setTranscriptionResult(null);
      // Explicit dereferencing of large base64 buffers to trigger instant browser garbage collection
      try {
        (window as any)._lastBuffer = null;
      } catch (_) {}
    } else {
      setCapturedImages([]);
      setTranscriptionResult(null);
    }
    setError(null);
  };

  const handleRestoreLastResult = () => {
    if (lastTranscriptionResult) {
      setCapturedImages(lastCapturedImages);
      setTranscriptionResult(lastTranscriptionResult);
      try {
        window.history.pushState({ view: "result" }, "");
      } catch (_) {}
    } else if (history.length > 0) {
      selectHistoryItem(history[0]);
    }
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem("abookscan_history");
  };

  const selectHistoryItem = (item: any) => {
    setCapturedImages(item.images || [item.preview]);
    setTranscriptionResult(item.result);
  };

  const shareApp = async () => {
    setQrModalTab("share");
    setIsQRModalOpen(true);
  };

  return (
    <div className={`min-h-screen font-sans selection:bg-teal-500/30 overflow-x-hidden relative transition-colors duration-300 ${
      theme === "light" ? "bg-slate-50 text-slate-800" : "bg-zinc-950 text-slate-300"
    }`}>
      {/* Privacy Task-Switcher Cover Backdrop */}
      <AnimatePresence>
        {isBlurred && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsBlurred(false)}
            className="fixed inset-0 z-[200] bg-zinc-950/98 backdrop-blur-3xl flex flex-col items-center justify-center text-center p-6 cursor-pointer pointer-events-auto"
          >
            <div className="max-w-md space-y-4 flex flex-col items-center pointer-events-none">
              <div className="w-16 h-16 rounded-full bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h2 className="text-xl font-display font-light text-white">{t.hero.secureScreenActive}</h2>
              <p className="text-xs text-slate-500 leading-relaxed max-w-xs">
                {t.hero.secureScreenDesc}
              </p>
              <span className="text-[8px] font-mono uppercase tracking-[0.2em] text-teal-500/40 animate-pulse">{t.hero.tapToResume}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dynamic Ambient Cloud & Aurora Background System */}
      <div className={`fixed inset-0 z-0 overflow-hidden pointer-events-none transition-colors duration-500 ${
        theme === "light" ? "bg-slate-50" : "bg-zinc-950"
      }`}>
        <div className="absolute top-0 left-0 w-full h-full tech-grid opacity-15" />
        
        {/* Animated Multicolor Glowing Nebula Spheres */}
        <div className="absolute top-[8%] left-[5%] w-[45%] h-[45%] cloud-sphere cloud-sphere-1" />
        <div className="absolute top-[35%] left-[45%] w-[40%] h-[40%] cloud-sphere cloud-sphere-2" style={{ animationDelay: '-6s' }} />
        <div className="absolute -bottom-[8%] right-[8%] w-[55%] h-[55%] cloud-sphere cloud-sphere-3" style={{ animationDelay: '-12s' }} />
        <div className="absolute top-[65%] left-[8%] w-[35%] h-[35%] cloud-sphere cloud-sphere-4" style={{ animationDelay: '-18s' }} />
        
        {/* Atmospheric overlays */}
        <div className={`absolute inset-0 transition-opacity duration-500 ${
          theme === "light" 
            ? "bg-gradient-to-t from-slate-50 via-slate-50/70 to-transparent opacity-85" 
            : "bg-gradient-to-t from-zinc-950 via-transparent to-transparent opacity-75"
        }`} />
        <div className={`absolute inset-0 backdrop-blur-[2px] ${
          theme === "light" ? "bg-white/20" : "bg-zinc-950/20"
        }`} />
      </div>

      <main className="relative z-10 container mx-auto px-6 py-6 min-h-screen flex flex-col">
        {isProcessing && <LoadingOverlay selectedLanguage={selectedLanguage} />}
        
        {capturedImages.length === 0 && !transcriptionResult && (
          <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full pt-16">
            {/* Header / Navigation Bar - Horizontally Scrollable on Mobile */}
            <div className="fixed top-8 left-0 right-0 px-6 z-30 pointer-events-none">
              <div className="max-w-4xl mx-auto flex items-center gap-4 pointer-events-auto">
                <div className="flex-1 overflow-x-auto no-scrollbar pb-2">
                  <div className="flex items-center gap-2.5 glass-card p-2 rounded-full w-max min-w-full sm:min-w-0">
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full shrink-0 border ${
                      theme === "light" 
                        ? "bg-slate-100 border-slate-300 text-slate-900" 
                        : "bg-white/5 border-white/10 text-white"
                    }`}>
                      <AppLogo size="sm" />
                      <span className="text-[10px] font-bold tracking-widest uppercase">AbookScan</span>
                    </div>

                    {/* Active Tab */}
                    <div className="flex items-center gap-2 px-5 py-2.5 rounded-full text-[10px] uppercase font-bold tracking-[0.25em] btn-theme-gradient whitespace-nowrap">
                      <LayoutGrid className="w-3.5 h-3.5" />
                      {t.nav.scanTab}
                    </div>
                    
                    <div className={`h-4 w-[1px] mx-0.5 ${theme === "light" ? "bg-slate-300" : "bg-white/20"}`} />
                    
                    {/* Quick Palette Cycle Switcher Button */}
                    <button 
                      onClick={cycleNextPalette}
                      className={`flex items-center gap-2 px-3.5 py-2.5 rounded-full text-[10px] uppercase font-bold tracking-wider transition-all whitespace-nowrap group ${
                        theme === "light"
                          ? "bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 shadow-sm"
                          : "bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10"
                      }`}
                      title={`Palette active : ${colorPalette}. Cliquez pour changer de couleur`}
                    >
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-[var(--theme-brand)]" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--theme-brand)]" />
                      </span>
                      <Palette className="w-3.5 h-3.5 text-[var(--theme-brand)] group-hover:rotate-45 transition-transform duration-500" />
                      <span className="capitalize">{colorPalette}</span>
                    </button>

                    {/* Quick Dark / Light Toggle */}
                    <button
                      onClick={() => handleThemeChange(theme === "dark" ? "light" : "dark")}
                      className={`p-2.5 rounded-full transition-all group ${
                        theme === "light"
                          ? "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 shadow-sm"
                          : "bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10"
                      }`}
                      title={theme === "dark" ? "Passer au Mode Clair" : "Passer au Mode Sombre"}
                    >
                      {theme === "dark" ? (
                        <Sun className="w-3.5 h-3.5 text-amber-400 group-hover:rotate-90 transition-transform" />
                      ) : (
                        <Moon className="w-3.5 h-3.5 text-indigo-600 group-hover:-rotate-12 transition-transform" />
                      )}
                    </button>

                    <div className={`h-4 w-[1px] mx-0.5 ${theme === "light" ? "bg-slate-300" : "bg-white/20"}`} />

                    <button 
                      onClick={() => setIsSettingsOpen(true)}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-[10px] uppercase font-bold tracking-widest transition-all whitespace-nowrap overflow-hidden group relative ${
                        theme === "light"
                          ? "bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-300"
                          : "bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/10"
                      }`}
                    >
                      <Settings className="w-3.5 h-3.5 group-hover:rotate-90 transition-transform duration-700" />
                      <span>{t.nav.settings}</span>
                    </button>

                    <button 
                      onClick={handleInstallClick}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-full text-[10px] uppercase font-bold tracking-widest badge-theme transition-all whitespace-nowrap group"
                    >
                      {showInstallBtn ? (
                        <>
                          <Smartphone className="w-3.5 h-3.5 animate-pulse text-[var(--theme-brand)]" />
                          <span>{t.nav.installApp}</span>
                        </>
                      ) : (
                        <>
                          <Share2 className="w-3.5 h-3.5 text-[var(--theme-brand)] group-hover:scale-110 transition-transform" />
                          <span>{t.nav.installShare}</span>
                        </>
                      )}
                    </button>

                    <div className={`h-4 w-[1px] mx-0.5 ${theme === "light" ? "bg-slate-300" : "bg-white/20"}`} />
                    
                    <div className="flex items-center gap-2 px-3.5 py-1.5 badge-theme rounded-full whitespace-nowrap">
                       <div className="w-1.5 h-1.5 rounded-full bg-[var(--theme-brand)] animate-pulse" />
                       <span className="text-[8px] font-mono uppercase tracking-widest font-bold">
                         Accès Gratuit & Illimité
                       </span>
                    </div>

                    {isPrivateMode && (
                      <>
                        <div className={`h-4 w-[1px] mx-0.5 ${theme === "light" ? "bg-slate-300" : "bg-white/20"}`} />
                        <div className="flex items-center gap-1.5 px-3 py-2 badge-theme rounded-full whitespace-nowrap">
                          <div className="w-1 h-1 rounded-full bg-[var(--theme-brand)] animate-pulse" />
                          <span className="text-[7px] font-mono uppercase tracking-widest font-bold">
                            {t.nav.privateMode}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex-1 flex flex-col justify-center space-y-6"
            >
              {/* Hidden Direct File Upload Input for Local Audio / Manuscripts */}
              <input 
                type="file" 
                ref={directFileInputRef}
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleDirectLocalFileUpload(Array.from(e.target.files));
                  }
                  e.target.value = "";
                }}
                accept="image/*,image/heic,image/heif,.pdf,application/pdf,.doc,.docx,.txt,.csv,audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.webm,.amr"
                multiple
                className="hidden"
              />

              {/* Notification Banner when file is opened via system "Ouvrir avec" / "Partager avec" */}
              {openedFileNotice && (
                <div className="w-full max-w-xl mx-auto bg-teal-950/90 border border-teal-500/40 rounded-2xl p-4 flex items-center justify-between gap-3 text-xs text-teal-300 shadow-xl backdrop-blur-md animate-fade-in">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-teal-500/20 text-teal-300 rounded-xl border border-teal-500/30">
                      <Upload className="w-5 h-5 animate-bounce" />
                    </div>
                    <div>
                      <p className="font-bold text-white text-xs flex items-center gap-2">
                        {t.hero.fileOpenedNotice}
                        <span className="px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 text-[9px] uppercase font-mono border border-teal-500/30">
                          {t.hero.fileSystemOpened}
                        </span>
                      </p>
                      <p className="text-[11px] text-teal-200/80 mt-0.5 font-mono truncate max-w-xs sm:max-w-md">
                        {openedFileNotice}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setOpenedFileNotice(null)}
                    className="p-1.5 hover:bg-teal-500/20 rounded-lg text-teal-300 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Hero Branding Header with Logo */}
              <div className="flex flex-col items-center justify-center text-center space-y-3 pt-6 sm:pt-4">
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="relative group cursor-pointer"
                  onClick={() => setIsSettingsOpen(true)}
                  title="AbookScan IA"
                >
                  <div 
                    className="absolute -inset-1.5 rounded-3xl blur-md opacity-60 group-hover:opacity-100 transition-opacity" 
                    style={{ background: "var(--theme-gradient)" }}
                  />
                  <AppLogo size="hero" />
                </motion.div>

                <div>
                  <h1 className={`text-2xl sm:text-3xl font-display font-bold tracking-tight flex items-center justify-center gap-2 ${
                    theme === "light" ? "text-slate-900" : "text-white"
                  }`}>
                    AbookScan <span className="text-theme-gradient">IA</span>
                  </h1>
                  <p className={`text-xs font-mono mt-1 max-w-sm mx-auto ${
                    theme === "light" ? "text-slate-600" : "text-slate-400"
                  }`}>
                    {t.hero.subtitle}
                  </p>
                </div>
              </div>

              {/* Mode Selector Tabs (OCR vs Voice Dictation vs Direct Local File Upload) */}
              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("ocr")}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-[11px] uppercase tracking-wider transition-all cursor-pointer ${
                    activeTab === "ocr"
                      ? "btn-theme-gradient scale-105"
                      : theme === "light"
                        ? "bg-white text-slate-700 hover:text-slate-900 border border-slate-300 shadow-sm"
                        : "bg-zinc-900/90 text-slate-400 hover:text-white border border-white/10"
                  }`}
                >
                  <Camera className="w-4 h-4" />
                  <span>{t.hero.ocrTitle}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("voice")}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-[11px] uppercase tracking-wider transition-all cursor-pointer ${
                    activeTab === "voice"
                      ? "bg-gradient-to-r from-violet-600 via-purple-600 to-pink-600 text-white shadow-[0_0_24px_rgba(168,85,247,0.5)] scale-105"
                      : theme === "light"
                        ? "bg-white text-slate-700 hover:text-slate-900 border border-slate-300 shadow-sm"
                        : "bg-zinc-900/90 text-slate-400 hover:text-white border border-white/10"
                  }`}
                >
                  <Mic className="w-4 h-4 text-purple-300 animate-pulse" />
                  <span>{t.hero.voiceTitle}</span>
                </button>

                <button
                  type="button"
                  onClick={() => directFileInputRef.current?.click()}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-[11px] uppercase tracking-wider transition-all bg-gradient-to-r from-emerald-500/15 to-teal-500/15 border border-emerald-500/35 text-emerald-600 dark:text-emerald-300 hover:from-emerald-500 hover:to-teal-500 hover:text-black shadow-lg shadow-emerald-500/10 scale-100 hover:scale-105 cursor-pointer"
                >
                  <HardDrive className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                  <span>{t.hero.uploadTitle}</span>
                </button>
              </div>

              {activeTab === "ocr" && (
                <div className="max-w-md mx-auto p-3 badge-theme rounded-2xl text-xs text-center flex items-center justify-center gap-2 shadow-sm">
                  <Sparkles className="w-4 h-4 text-[var(--theme-brand)] shrink-0" />
                  <span className="font-medium">{t.hero.ocrDesc}</span>
                </div>
              )}

              {activeTab === "voice" && (
                <div className="max-w-md mx-auto p-3 bg-purple-500/10 border border-purple-500/30 text-purple-700 dark:text-purple-300 rounded-2xl text-xs text-center flex items-center justify-center gap-2 shadow-sm">
                  <Mic className="w-4 h-4 text-purple-500 dark:text-purple-400 shrink-0" />
                  <span className="font-medium">{t.hero.voiceDesc}</span>
                </div>
              )}

              {activeTab === "ocr" ? (
                <Scanner 
                  onImagesCaptured={handleImagesCaptured}
                  onMultimodalCaptured={handleMultimodalCaptured}
                  selectedLanguage={selectedLanguage}
                  activeTab={activeTab}
                  onDirectFileUpload={handleDirectLocalFileUpload}
                />
              ) : (
                <VoiceRecorder
                  onAudioCaptured={handleAudioCaptured}
                  onDirectTextCaptured={handleDirectTextCaptured}
                  selectedLanguage={selectedLanguage}
                  isProcessing={isProcessing}
                  onDirectFileUpload={handleDirectLocalFileUpload}
                />
              )}
            </motion.div>
          </div>
        )}

        {error && (
          <div className="max-w-md mx-auto mt-8 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm flex items-center justify-between backdrop-blur-md">
            <span>{error}</span>
            <button 
              onClick={handleReset}
              className="px-3 py-1 bg-red-500/20 rounded-lg hover:bg-red-500/30 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {transcriptionResult && (
          <div className="flex-1 w-full">
            <ResultView 
              images={capturedImages} 
              result={transcriptionResult} 
              onReset={handleReset} 
              activeTab={activeTab}
              selectedLanguage={selectedLanguage}
              theme={theme}
            />
          </div>
        )}

        <LanguageSelectionModal 
          isOpen={isLanguageModalOpen}
          languages={LANGUAGES}
          selectedLanguage={selectedLanguage}
          onSelectLanguage={handleLanguageChange}
        />
        <SettingsModal 
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          selectedLanguage={selectedLanguage}
          onLanguageChange={handleLanguageChange}
          languages={LANGUAGES}
          history={history}
          onClearHistory={clearHistory}
          onSelectHistoryItem={selectHistoryItem}
          isPrivateMode={isPrivateMode}
          onPrivateModeChange={handlePrivateModeChange}
          isScreenProtect={isScreenProtect}
          onScreenProtectChange={handleScreenProtectChange}
          theme={theme}
          onThemeChange={handleThemeChange}
          colorPalette={colorPalette}
          onColorPaletteChange={handlePaletteChange}
          onOpenAdminStats={() => setIsAdminDashboardOpen(true)}
          onOpenTwaGuide={() => {
            setQrModalTab("twa");
            setIsQRModalOpen(true);
          }}
        />
        <AdminDashboardModal 
          isOpen={isAdminDashboardOpen}
          onClose={() => setIsAdminDashboardOpen(false)}
          selectedLanguage={selectedLanguage}
        />
        <QRCodeModal 
          isOpen={isQRModalOpen}
          onClose={() => setIsQRModalOpen(false)}
          url={window.location.origin.includes("ais-dev-") ? window.location.origin.replace("ais-dev-", "ais-pre-") : window.location.origin}
          onInstall={handleInstallApp}
          showInstallBtn={showInstallBtn}
          initialTab={qrModalTab}
          selectedLanguage={selectedLanguage}
        />
        <TermsModal 
          isOpen={isTermsOpen}
          onClose={() => setIsTermsOpen(false)}
          theme={theme}
          selectedLanguage={selectedLanguage}
        />
        <OnboardingModal 
          isOpen={isOnboardingOpen}
          selectedLanguage={selectedLanguage}
          onClose={() => {
            setIsOnboardingOpen(false);
            localStorage.setItem("abookscan_onboarded", "true");
          }}
        />
        <OfflineBanner 
          theme={theme}
          selectedLanguage={selectedLanguage}
        />

        {/* Blocking Mandatory Update Modal for New Netlify Releases */}
        {updateRequired && (
          <ForceUpdateModal 
            currentVersion={CURRENT_APP_VERSION}
            remoteInfo={remoteVersionInfo}
            t={t}
            isMandatory={true}
          />
        )}

        {/* Automatic Highly Visible PWA Install Banner */}
        <AnimatePresence>
          {showFloatingInstallBanner && (
            <motion.div
              initial={{ opacity: 0, y: 100, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 100, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed bottom-20 left-4 right-4 md:left-auto md:right-8 md:w-[380px] z-[100] p-5 rounded-3xl bg-zinc-900/98 border border-teal-500/20 shadow-[0_10px_50px_rgba(0,0,0,0.8)] backdrop-blur-xl flex flex-col gap-4 text-left pointer-events-auto"
            >
              <button
                onClick={handleDismissFloatingBanner}
                className="absolute top-3.5 right-3.5 p-1 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                aria-label="Dismiss banner"
              >
                <X className="w-3.5 h-3.5" />
              </button>

              <div className="flex items-start gap-3 pr-6">
                <div className="p-2.5 rounded-2xl bg-teal-500/10 border border-teal-500/20 shrink-0 text-teal-400">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[8px] font-mono uppercase tracking-widest text-teal-400 font-bold">{t.qrModal.title}</span>
                    <Sparkles className="w-3 h-3 text-teal-300 animate-pulse" />
                  </div>
                  <h3 className="text-sm font-semibold text-white tracking-tight">{t.qrModal.scanToInstall}</h3>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed font-light">
                {/iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase()) 
                  ? t.qrModal.iosGuide
                  : t.qrModal.androidGuide}
              </p>

              <div className="flex gap-2.5 mt-1">
                <button
                  onClick={showInstallBtn ? handleInstallApp : handleOpenInstallGuide}
                  className="flex-1 py-2.5 bg-teal-500 text-black font-bold text-[10px] uppercase tracking-wider rounded-xl hover:bg-teal-400 transition-all shadow-[0_0_15px_rgba(20,184,166,0.3)] text-center flex items-center justify-center gap-1.5"
                >
                  <Smartphone className="w-3 h-3" />
                  {showInstallBtn ? t.qrModal.installBtn : t.qrModal.installGuideTitle}
                </button>
                <button
                  onClick={handleDismissFloatingBanner}
                  className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white font-bold text-[10px] uppercase tracking-wider rounded-xl transition-all text-center border border-white/5"
                >
                  {t.settings.cancel}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer / System Status */}
      <footer className="fixed bottom-0 left-0 right-0 p-2 flex flex-col items-center gap-1.5 pointer-events-none z-20">
        <button 
          onClick={() => setIsTermsOpen(true)}
          className="px-3 py-1 bg-black/40 backdrop-blur-md border border-white/5 rounded-full text-[7px] uppercase tracking-[0.2em] text-slate-500 hover:text-teal-500 hover:border-teal-500/20 transition-all pointer-events-auto shadow-2xl"
        >
          {t.terms.title}
        </button>
        
        <button
          onClick={() => setIsAdminDashboardOpen(true)}
          className="px-4 py-1 bg-zinc-900/80 backdrop-blur-xl border border-white/5 rounded-full shadow-[0_0_20px_rgba(0,0,0,0.5)] flex items-center gap-3 pointer-events-auto hover:border-teal-500/30 transition-all cursor-pointer group"
          title="Ouvrir la console administrateur"
        >
          <div className="w-1 h-1 bg-teal-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(20,184,166,1)]" />
          <p className="text-[9px] font-mono text-slate-500 tracking-widest uppercase group-hover:text-slate-300 transition-colors">
            AbookScan v2.4 • <span className="text-teal-500/70">IA {selectedLanguage}</span>
          </p>
        </button>
      </footer>
    </div>
  );
}

