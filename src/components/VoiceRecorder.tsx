import React, { useState, useRef, useEffect, useCallback } from "react";
import { Mic, Square, Play, Pause, RefreshCw, Upload, Sparkles, Volume2, Radio, CheckCircle2, FileAudio, Music, FileSpreadsheet, HardDrive, Loader2, Users, MessageSquare, AlignLeft, Clock, Copy, Check } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useDropzone } from "react-dropzone";
import { optimizeAudioBlob } from "../lib/audioCompressor";
import { getTranslations } from "../lib/translations";
import { autoFormatAndPunctuateText } from "../lib/textUtils";

interface VoiceRecorderProps {
  onAudioCaptured: (base64Audio: string, mimeType: string, promptMode: "formatted" | "verbatim" | "meeting_notes") => void;
  onDirectTextCaptured?: (text: string) => void;
  selectedLanguage: string;
  isProcessing?: boolean;
  onDirectFileUpload?: (files: File[]) => void;
}

export default function VoiceRecorder({ onAudioCaptured, onDirectTextCaptured, selectedLanguage, isProcessing, onDirectFileUpload }: VoiceRecorderProps) {
  const t = getTranslations(selectedLanguage);
  const [activeSourceMode, setActiveSourceMode] = useState<"record" | "upload" | "meeting">("record");
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadedFileSize, setUploadedFileSize] = useState<string | null>(null);
  const [promptMode, setPromptMode] = useState<"formatted" | "verbatim" | "meeting_notes">("formatted");
  const [audioError, setAudioError] = useState<string | null>(null);
  const [micVolume, setMicVolume] = useState<number>(0);

  // Live Speech Recognition & Paragraph Transcript state
  const [liveMeetingParagraphs, setLiveMeetingParagraphs] = useState<string[]>([]);
  const [soloLiveSentences, setSoloLiveSentences] = useState<string[]>([]);
  const [currentInterimTranscript, setCurrentInterimTranscript] = useState<string>("");
  const [isEditingSoloText, setIsEditingSoloText] = useState(false);
  const [editableSoloText, setEditableSoloText] = useState("");
  const [copiedTranscript, setCopiedTranscript] = useState(false);
  const [pauseThresholdSec, setPauseThresholdSec] = useState<number>(1.5);
  const [showPauseBreakAlert, setShowPauseBreakAlert] = useState(false);

  const getSpeechRecognitionLang = (lang: string) => {
    const l = (lang || "fr").toLowerCase();
    if (l === "fr" || l.includes("franc") || l.includes("french")) return "fr-FR";
    if (l === "en" || l.includes("anglais") || l.includes("english")) return "en-US";
    if (l === "es" || l.includes("espagnol") || l.includes("spanish")) return "es-ES";
    if (l === "de" || l.includes("allemand") || l.includes("german")) return "de-DE";
    if (l === "it" || l.includes("italien") || l.includes("italian")) return "it-IT";
    if (l === "pt" || l.includes("portugais") || l.includes("portuguese")) return "pt-PT";
    if (l === "ar" || l.includes("arabe") || l.includes("arabic")) return "ar-SA";
    if (l === "sw" || l.includes("swahili")) return "sw-TZ";
    if (l === "zh" || l.includes("chinois")) return "zh-CN";
    if (l === "nl" || l.includes("néerlandais")) return "nl-NL";
    if (l === "ru" || l.includes("russe")) return "ru-RU";
    return "fr-FR";
  };

  const recognitionRef = useRef<any>(null);
  const isRecordingRef = useRef(false);
  const activeSourceModeRef = useRef(activeSourceMode);
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);
  const currentInterimTranscriptRef = useRef<string>("");
  const lastSpeechTimestampRef = useRef<number>(0);
  const lastPauseBreakTimestampRef = useRef<number>(0);
  const pauseCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pauseThresholdSecRef = useRef<number>(pauseThresholdSec);

  useEffect(() => {
    pauseThresholdSecRef.current = pauseThresholdSec;
  }, [pauseThresholdSec]);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    activeSourceModeRef.current = activeSourceMode;
    if (activeSourceMode === "meeting") {
      setPromptMode("meeting_notes");
    }
  }, [activeSourceMode]);

  // Auto scroll live transcript box to bottom on new text
  useEffect(() => {
    if (transcriptScrollRef.current) {
      transcriptScrollRef.current.scrollTop = transcriptScrollRef.current.scrollHeight;
    }
  }, [liveMeetingParagraphs, currentInterimTranscript]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const normalizeAudioMimeType = (rawMime: string, filename: string): string => {
    const mimeLower = (rawMime || "").split(";")[0].trim().toLowerCase();
    const nameLower = (filename || "").toLowerCase();

    if (mimeLower.includes("webm") || nameLower.endsWith(".webm")) return "audio/webm";
    if (mimeLower.includes("wav") || mimeLower.includes("wave") || nameLower.endsWith(".wav")) return "audio/wav";
    if (mimeLower.includes("m4a") || nameLower.endsWith(".m4a")) return "audio/mp4";
    if (mimeLower.includes("aac") || nameLower.endsWith(".aac")) return "audio/aac";
    if (mimeLower.includes("ogg") || mimeLower.includes("vorbis") || nameLower.endsWith(".ogg")) return "audio/ogg";
    if (mimeLower.includes("flac") || nameLower.endsWith(".flac")) return "audio/flac";
    if (mimeLower.includes("mp4") || nameLower.endsWith(".mp4") || mimeLower.includes("3gp") || nameLower.endsWith(".3gp")) return "audio/mp4";
    if (mimeLower.includes("mpeg") || mimeLower.includes("mp3") || nameLower.endsWith(".mp3")) return "audio/mp3";

    return "audio/mp3";
  };

  // Format seconds to MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return bytes + " octets";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " Ko";
    return (bytes / (1024 * 1024)).toFixed(1) + " Mo";
  };

  const [isCompressing, setIsCompressing] = useState(false);
  const [compressStatus, setCompressStatus] = useState<string>("");

  // Process audio or manuscript file (from drop or input picker)
  const processAudioFile = (file: File) => {
    const nameLower = file.name.toLowerCase();
    const isAudioType = file.type.startsWith("audio/") || file.type.startsWith("video/");
    const isAudioExt = /\.(mp3|wav|m4a|aac|ogg|webm|flac|amr|wma|mp4)$/i.test(nameLower);

    if (!isAudioType && !isAudioExt) {
      if (onDirectFileUpload) {
        onDirectFileUpload([file]);
        return;
      }
      setAudioError("Format de fichier non supporté. Veuillez importer un fichier audio (MP3, WAV, M4A, AAC, OGG) ou un document manuscrit.");
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      setAudioError("Le fichier audio dépasse la limite autorisée de 100 Mo.");
      return;
    }

    setAudioError(null);
    setAudioBlob(file);
    setUploadedFileName(file.name);
    setUploadedFileSize(formatBytes(file.size));

    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
    const url = URL.createObjectURL(file);
    setAudioUrl(url);
    setActiveSourceMode("upload");
  };

  const onDropAudio = useCallback((acceptedFiles: File[], fileRejections: any[]) => {
    if (acceptedFiles && acceptedFiles.length > 0) {
      processAudioFile(acceptedFiles[0]);
    } else if (fileRejections && fileRejections.length > 0) {
      const rejectedFile = fileRejections[0].file;
      if (rejectedFile) {
        processAudioFile(rejectedFile);
      }
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles: File[], fileRejections: any[]) => onDropAudio(acceptedFiles, fileRejections),
    accept: {
      "audio/*": [".mp3", ".wav", ".m4a", ".aac", ".ogg", ".webm", ".flac", ".amr", ".wma"],
      "video/mp4": [".mp4", ".m4a"],
      "application/octet-stream": [".mp3", ".wav", ".m4a", ".aac", ".ogg"]
    },
    multiple: false,
  } as any);

  const wakeLockRef = useRef<any>(null);
  const startTimeRef = useRef<number>(0);
  const pausedMsRef = useRef<number>(0);
  const pauseStartRef = useRef<number>(0);

  const silentAudioRef = useRef<HTMLAudioElement | null>(null);

  const startSilentAudioAnchor = () => {
    try {
      if (!silentAudioRef.current) {
        const audio = new Audio();
        audio.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
        audio.loop = true;
        silentAudioRef.current = audio;
      }
      silentAudioRef.current.play().catch(() => {});
    } catch (err) {}
  };

  const stopSilentAudioAnchor = () => {
    if (silentAudioRef.current) {
      silentAudioRef.current.pause();
    }
  };

  const requestWakeLock = async () => {
    try {
      if ("wakeLock" in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
      }
    } catch (err) {
      console.warn("Wake Lock not acquired:", err);
    }
  };

  const releaseWakeLock = () => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch(() => {});
      wakeLockRef.current = null;
    }
  };

  const setupMediaSession = () => {
    try {
      if ("mediaSession" in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: "🔴 Enregistrement vocal actif (Facebook & Arrière-plan)",
          artist: "AbookScan IA",
          album: "Enregistrement continu sans coupure",
          artwork: [
            {
              src: "https://cdn-icons-png.flaticon.com/512/3235/3235042.png",
              sizes: "512x512",
              type: "image/png",
            },
          ],
        });
        navigator.mediaSession.playbackState = "playing";
        startSilentAudioAnchor();
      }
    } catch (err) {}
  };

  const clearMediaSession = () => {
    try {
      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "none";
      }
      stopSilentAudioAnchor();
    } catch (err) {}
  };

  const getExactElapsedSeconds = () => {
    if (!startTimeRef.current) return 0;
    const now = Date.now();
    const elapsedMs = now - startTimeRef.current - pausedMsRef.current;
    return Math.max(0, Math.floor(elapsedMs / 1000));
  };

  // Page Visibility API handler to maintain recording state & time precision when browser is minimized or app switched
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (isRecording && !isPaused) {
          setRecordingTime(getExactElapsedSeconds());
          requestWakeLock();
        }
        if (audioContextRef.current && audioContextRef.current.state === "suspended") {
          audioContextRef.current.resume().catch(() => {});
        }
      } else if (document.visibilityState === "hidden") {
        if (isRecording && !isPaused) {
          document.title = `🔴 [Enregistrement en cours...] AbookScan IA`;
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isRecording, isPaused]);

  // Start recording voice via microphone
  const startRecording = async () => {
    setAudioError(null);
    setAudioBlob(null);
    setUploadedFileName(null);
    setUploadedFileSize(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    audioChunksRef.current = [];

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setAudioError("L'accès au microphone n'est pas supporté par votre navigateur.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Audio visualizer setup with iOS Safari AudioContext resume handling
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const audioCtx = new AudioCtx();
          if (audioCtx.state === "suspended") {
            await audioCtx.resume().catch(() => {});
          }
          audioContextRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 64;
          source.connect(analyser);
          analyserRef.current = analyser;

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          let lastVisualizerUpdate = 0;
          const updateVolume = () => {
            if (analyserRef.current) {
              const now = Date.now();
              if (now - lastVisualizerUpdate > 80) {
                lastVisualizerUpdate = now;
                analyserRef.current.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                  sum += dataArray[i];
                }
                const avg = sum / dataArray.length;
                setMicVolume(avg);
              }
            }
            animFrameRef.current = requestAnimationFrame(updateVolume);
          };
          updateVolume();
        }
      } catch (err) {
        console.warn("AudioContext visualizer skipped:", err);
      }

      // Determine mime type across iOS Safari, Chrome, and Android
      let mimeType = "audio/webm";
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported) {
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
          mimeType = "audio/webm;codecs=opus";
        } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
          mimeType = "audio/mp4";
        } else if (MediaRecorder.isTypeSupported("audio/aac")) {
          mimeType = "audio/aac";
        } else if (MediaRecorder.isTypeSupported("audio/ogg")) {
          mimeType = "audio/ogg";
        } else if (MediaRecorder.isTypeSupported("audio/wav")) {
          mimeType = "audio/wav";
        } else {
          mimeType = "";
        }
      }

      const recorderOptions = mimeType ? { mimeType } : undefined;
      const mediaRecorder = new MediaRecorder(stream, recorderOptions);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);

        stream.getTracks().forEach((track) => track.stop());
        if (audioContextRef.current) {
          audioContextRef.current.close().catch(() => {});
        }
        if (animFrameRef.current) {
          cancelAnimationFrame(animFrameRef.current);
        }
        setMicVolume(0);
        releaseWakeLock();
        clearMediaSession();
        document.title = "AbookScan IA - Scanner Pro";
      };

      // Request background keep-alive locks
      requestWakeLock();
      setupMediaSession();

      // Start live speech recognition for real-time transcription across both solo dictation and meeting modes
      setLiveMeetingParagraphs([]);
      setSoloLiveSentences([]);
      setCurrentInterimTranscript("");
      currentInterimTranscriptRef.current = "";
      setIsEditingSoloText(false);
      setEditableSoloText("");
      startLiveSpeechRecognition();

      mediaRecorder.start(200);
      setIsRecording(true);
      setIsPaused(false);
      setRecordingTime(0);

      startTimeRef.current = Date.now();
      pausedMsRef.current = 0;

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        const secs = getExactElapsedSeconds();
        setRecordingTime(secs);
        const formatted = formatTime(secs);
        document.title = `🔴 [${formatted}] Enregistrement vocal - AbookScan IA`;
      }, 500);
    } catch (err: any) {
      console.warn("Microphone access unavailable or denied:", err);
      const isPermissionDenied = 
        err?.name === "NotAllowedError" || 
        err?.name === "PermissionDeniedError" || 
        /permission|denied|allowed/i.test(String(err?.message || err));

      if (isPermissionDenied) {
        setAudioError("L'accès au microphone a été refusé par le navigateur. Vous pouvez autoriser le micro dans les paramètres ou importer directement un fichier audio existant ci-dessous.");
      } else {
        setAudioError("Impossible d'accéder au microphone (" + (err?.message || "Erreur de périphérique") + "). Vous pouvez également importer un fichier audio.");
      }
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      if (isPaused) {
        mediaRecorderRef.current.resume();
        setIsPaused(false);
        if (pauseStartRef.current > 0) {
          pausedMsRef.current += (Date.now() - pauseStartRef.current);
          pauseStartRef.current = 0;
        }
        requestWakeLock();
        setupMediaSession();
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
          const secs = getExactElapsedSeconds();
          setRecordingTime(secs);
          const formatted = formatTime(secs);
          document.title = `🔴 [${formatted}] Enregistrement vocal - AbookScan IA`;
        }, 500);
      } else {
        mediaRecorderRef.current.pause();
        setIsPaused(true);
        pauseStartRef.current = Date.now();
        document.title = `⏸️ [En pause] Enregistrement - AbookScan IA`;
        if (timerRef.current) clearInterval(timerRef.current);
      }
    }
  };

  // Live speech recognition for both Solo and Meeting Mode with instant word-by-word streaming & silence pause detection
  const startLiveSpeechRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    try {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch (e) {}
      }
      if (pauseCheckIntervalRef.current) {
        clearInterval(pauseCheckIntervalRef.current);
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = getSpeechRecognitionLang(selectedLanguage);

      lastSpeechTimestampRef.current = Date.now();
      lastPauseBreakTimestampRef.current = Date.now();

      recognition.onresult = (event: any) => {
        let interimText = "";
        lastSpeechTimestampRef.current = Date.now();

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            if (transcript.trim()) {
              const timeFormatted = formatTime(getExactElapsedSeconds());
              if (activeSourceModeRef.current === "meeting") {
                const paragraphEntry = `[Échange ${timeFormatted}] ${transcript.trim()}`;
                setLiveMeetingParagraphs((prev) => [...prev, paragraphEntry]);
              } else {
                setSoloLiveSentences((prev) => [...prev, transcript.trim()]);
              }
              setCurrentInterimTranscript("");
              currentInterimTranscriptRef.current = "";
              lastPauseBreakTimestampRef.current = Date.now();
            }
          } else {
            interimText += transcript;
          }
        }

        if (interimText.trim()) {
          setCurrentInterimTranscript(interimText.trim());
          currentInterimTranscriptRef.current = interimText.trim();
        }
      };

      recognition.onerror = (e: any) => {
        console.warn("Speech recognition error:", e);
      };

      recognition.onend = () => {
        if (isRecordingRef.current) {
          try { recognition.start(); } catch (err) {}
        }
      };

      recognition.start();
      recognitionRef.current = recognition;

      // Silence Pause Monitor Loop (Checks every 200ms for automatic breaks in meeting mode)
      pauseCheckIntervalRef.current = setInterval(() => {
        if (!isRecordingRef.current) return;

        const now = Date.now();
        const timeSinceSpeech = (now - lastSpeechTimestampRef.current) / 1000;
        const currentText = currentInterimTranscriptRef.current.trim();
        const threshold = pauseThresholdSecRef.current;

        if (
          currentText.length > 0 &&
          timeSinceSpeech >= threshold &&
          (now - lastPauseBreakTimestampRef.current) / 1000 >= threshold
        ) {
          const timeFormatted = formatTime(getExactElapsedSeconds());
          if (activeSourceModeRef.current === "meeting") {
            const paragraphEntry = `[Paragraphe ${timeFormatted} • Pause ${threshold}s] ${currentText}`;
            setLiveMeetingParagraphs((prev) => [...prev, paragraphEntry]);
            setShowPauseBreakAlert(true);
            setTimeout(() => setShowPauseBreakAlert(false), 2500);
          } else {
            setSoloLiveSentences((prev) => [...prev, currentText]);
          }

          setCurrentInterimTranscript("");
          currentInterimTranscriptRef.current = "";
          lastPauseBreakTimestampRef.current = now;
        }
      }, 200);

    } catch (err) {
      console.warn("Live speech recognition not supported or failed:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      if (timerRef.current) clearInterval(timerRef.current);
      if (pauseCheckIntervalRef.current) clearInterval(pauseCheckIntervalRef.current);
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (e) {}
        recognitionRef.current = null;
      }
      releaseWakeLock();
      clearMediaSession();
      document.title = "AbookScan IA - Scanner Pro";
    }
  };

  const resetAudio = () => {
    if (isRecording) {
      stopRecording();
    }
    if (pauseCheckIntervalRef.current) {
      clearInterval(pauseCheckIntervalRef.current);
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (e) {}
      recognitionRef.current = null;
    }
    setLiveMeetingParagraphs([]);
    setSoloLiveSentences([]);
    setCurrentInterimTranscript("");
    currentInterimTranscriptRef.current = "";
    setEditableSoloText("");
    setIsEditingSoloText(false);
    setAudioBlob(null);
    setUploadedFileName(null);
    setUploadedFileSize(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setRecordingTime(0);
    setAudioError(null);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processAudioFile(file);
    }
  };

  // Convert Blob to Base64 with client-side 16kHz mono audio optimization and trigger transcription
  const handleTranscribeClick = async () => {
    if (!audioBlob || isProcessing || isCompressing) return;

    setAudioError(null);
    setIsCompressing(true);
    setCompressStatus("Optimisation de la qualité audio en cours...");

    try {
      const optimized = await optimizeAudioBlob(audioBlob, (status) => {
        setCompressStatus(status);
      });
      onAudioCaptured(optimized.base64, optimized.mimeType, promptMode);
    } catch (err) {
      console.error("Error optimizing audio blob:", err);
      setAudioError("Erreur lors de la préparation du fichier audio. Veuillez réessayer.");
    } finally {
      setIsCompressing(false);
      setCompressStatus("");
    }
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
    };
  }, [audioUrl]);

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      <div className="bg-slate-900/90 backdrop-blur-md rounded-3xl p-6 sm:p-8 border border-indigo-500/30 shadow-2xl space-y-6">
        
        {/* Source Toggle Tabs: 1. Dictée Solo, 2. Téléverser Audio, 3. Mode Réunion */}
        <div className="space-y-4 border-b border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white shadow-xl shadow-indigo-500/20">
              {activeSourceMode === "record" ? <Mic className="w-6 h-6" /> : activeSourceMode === "upload" ? <Upload className="w-6 h-6" /> : <Users className="w-6 h-6" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                {activeSourceMode === "record" && "1. Enregistrement Direct (Dictée Solo)"}
                {activeSourceMode === "upload" && "2. Téléversement de Fichiers Audio HD"}
                {activeSourceMode === "meeting" && "3. Mode Réunion & Conférence (Échanges & Paragraphes)"}
                <span className="px-2 py-0.5 text-[10px] uppercase font-bold bg-indigo-500/20 text-indigo-300 rounded-full border border-indigo-500/30">
                  Gemini IA
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                {activeSourceMode === "record" && `Dictée en direct individuelle avec capture sonore haute fidélité en ${selectedLanguage}.`}
                {activeSourceMode === "upload" && `Importation de fichiers enregistrés (MP3, WAV, M4A, AAC, OGG...) jusqu'à 100 Mo.`}
                {activeSourceMode === "meeting" && `Transcription en direct avec création automatique de paragraphes à chaque pause et échange entre intervenants.`}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 p-1.5 bg-slate-950/90 rounded-2xl border border-white/10 gap-1.5 w-full">
            <button
              type="button"
              onClick={() => {
                if (isRecording) stopRecording();
                setActiveSourceMode("record");
              }}
              className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
                activeSourceMode === "record"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                  : "text-slate-400 hover:text-white hover:bg-slate-900/60"
              }`}
            >
              <Mic className="w-4 h-4 text-indigo-300" />
              <span>1. Dictée Solo</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (isRecording) stopRecording();
                setActiveSourceMode("upload");
              }}
              className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
                activeSourceMode === "upload"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                  : "text-slate-400 hover:text-white hover:bg-slate-900/60"
              }`}
            >
              <Upload className="w-4 h-4 text-indigo-300" />
              <span>2. Téléverser Audio</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (isRecording) stopRecording();
                setActiveSourceMode("meeting");
              }}
              className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
                activeSourceMode === "meeting"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                  : "text-slate-400 hover:text-white hover:bg-slate-900/60"
              }`}
            >
              <Users className="w-4 h-4 text-indigo-300" />
              <span>3. Mode Réunion</span>
            </button>
          </div>
        </div>

        {/* Error message banner */}
        {audioError && (
          <div className="p-4 bg-red-950/60 border border-red-800/60 text-red-300 text-xs rounded-2xl flex items-center gap-3">
            <span className="text-base">⚠️</span>
            <span className="flex-1 font-medium">{audioError}</span>
            <button onClick={() => setAudioError(null)} className="text-red-400 hover:text-white font-bold">×</button>
          </div>
        )}

        {/* MODE 1: Direct Microphone Dictation */}
        {activeSourceMode === "record" && (
          <div className="flex flex-col items-center justify-center py-8 space-y-6 bg-slate-950/60 rounded-2xl border border-slate-800 p-6 relative overflow-hidden">
            {isRecording && !isPaused && (
              <div className="absolute inset-0 bg-indigo-600/10 animate-pulse pointer-events-none" />
            )}

            {/* Background Recording Active Notification Badge */}
            {isRecording && (
              <div className="w-full bg-emerald-950/70 border border-emerald-500/40 rounded-2xl p-3.5 flex items-center justify-between gap-3 text-xs text-emerald-300 shadow-xl shadow-emerald-500/10 z-10">
                <div className="flex items-center gap-3">
                  <span className="relative flex h-3.5 w-3.5 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
                  </span>
                  <div>
                    <p className="font-bold text-white text-xs flex items-center gap-2">
                      Mode Arrière-Plan Multi-Tâches Actif
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[9px] uppercase font-mono border border-emerald-500/30">
                        PWA / Web Mobile
                      </span>
                    </p>
                    <p className="text-[11px] text-emerald-200/80 mt-0.5">
                      Vous pouvez minimiser le navigateur ou basculer vers d'autres applications. L'enregistrement vocal reste 100% actif.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="text-center space-y-1 z-10">
              <div className="text-4xl font-mono font-bold tracking-wider text-white">
                {formatTime(recordingTime)}
              </div>
              <div className="text-xs text-slate-400 flex items-center justify-center gap-2">
                {isRecording ? (
                  <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                    {isPaused ? "En pause" : "Enregistrement vocal en cours (Actif en arrière-plan)..."}
                  </span>
                ) : audioBlob && !uploadedFileName ? (
                  <span className="text-indigo-400 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    Dictée enregistrée et prête
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <span>Cliquez sur le microphone pour commencer la dictée</span>
                    <span className="hidden sm:inline-block px-2 py-0.5 bg-slate-800 text-indigo-300 rounded-md text-[10px] font-semibold border border-indigo-500/20">
                      ⚡ Supporte l'arrière-plan
                    </span>
                  </span>
                )}
              </div>
            </div>

            {/* Audio Wave Visualizer */}
            {isRecording && (
              <div className="flex items-center justify-center gap-1.5 h-12 my-2">
                {[...Array(14)].map((_, i) => {
                  const heightPercent = Math.max(15, Math.min(100, (micVolume * (1 + (i % 5) * 0.35)) / 2));
                  return (
                    <motion.div
                      key={i}
                      className="w-1.5 bg-gradient-to-t from-indigo-500 to-violet-400 rounded-full"
                      animate={{ height: `${isPaused ? 10 : heightPercent}%` }}
                      transition={{ duration: 0.1 }}
                    />
                  );
                })}
              </div>
            )}

            {/* Recording Action Controls */}
            <div className="flex items-center justify-center gap-4 z-10">
              {!isRecording && (!audioBlob || uploadedFileName) && (
                <button
                  onClick={startRecording}
                  className="group relative p-7 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-full shadow-2xl shadow-indigo-600/40 hover:scale-105 active:scale-95 transition-all flex items-center justify-center"
                  title="Démarrer la dictée vocale"
                >
                  <div className="absolute -inset-1 rounded-full bg-indigo-500/30 blur-md group-hover:bg-indigo-400/40 transition-all" />
                  <Mic className="w-8 h-8 relative z-10" />
                </button>
              )}

              {isRecording && (
                <>
                  <button
                    onClick={pauseRecording}
                    className="p-4 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-full border border-slate-700 shadow-lg transition-all"
                    title={isPaused ? "Reprendre" : "Mettre en pause"}
                  >
                    {isPaused ? <Play className="w-6 h-6 fill-current" /> : <Pause className="w-6 h-6" />}
                  </button>

                  <button
                    onClick={stopRecording}
                    className="p-5 bg-red-600 hover:bg-red-500 text-white rounded-full shadow-lg shadow-red-600/30 animate-pulse transition-all"
                    title="Arrêter l'enregistrement"
                  >
                    <Square className="w-6 h-6 fill-current" />
                  </button>
                </>
              )}

              {audioBlob && !isRecording && !uploadedFileName && (
                <button
                  onClick={resetAudio}
                  className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 flex items-center gap-2 text-xs transition-all"
                >
                  <RefreshCw className="w-4 h-4 text-slate-400" />
                  <span>Nouvelle dictée</span>
                </button>
              )}
            </div>

            {/* LIVE & INSTANT TRANSCRIPTION PREVIEW (Appears in real-time as user speaks & displays result before saving) */}
            {(isRecording || soloLiveSentences.length > 0 || currentInterimTranscript || (audioBlob && !uploadedFileName)) && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full bg-slate-900/90 rounded-2xl p-4 border border-indigo-500/30 shadow-xl space-y-3 z-10 text-left"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400">
                      <AlignLeft className="w-4 h-4" />
                    </span>
                    <span className="text-xs font-bold text-white flex items-center gap-2">
                      {isRecording ? "Transcription vocale en direct (Temps réel)" : "Résultat de la transcription (Reconnaissance directe)"}
                      {isRecording && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[9px] font-mono border border-emerald-500/30 flex items-center gap-1 animate-pulse">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                          Écoute active
                        </span>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Copy button */}
                    {(soloLiveSentences.length > 0 || currentInterimTranscript || editableSoloText) && (
                      <button
                        type="button"
                        onClick={() => {
                          const raw = editableSoloText || [...soloLiveSentences, currentInterimTranscript].filter(Boolean).join(" ");
                          const fullText = autoFormatAndPunctuateText(raw, selectedLanguage);
                          navigator.clipboard.writeText(fullText);
                          setCopiedTranscript(true);
                          setTimeout(() => setCopiedTranscript(false), 2000);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium border border-slate-700 flex items-center gap-1 transition-all"
                        title="Copier le texte reconnu avec mise en forme et ponctuation automatiques"
                      >
                        {copiedTranscript ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedTranscript ? "Copié !" : "Copier"}</span>
                      </button>
                    )}

                    {/* Direct Use / Open in ResultView Button */}
                    {(soloLiveSentences.length > 0 || currentInterimTranscript || editableSoloText) && onDirectTextCaptured && !isRecording && (
                      <button
                        type="button"
                        onClick={() => {
                          const raw = editableSoloText || [...soloLiveSentences, currentInterimTranscript].filter(Boolean).join(" ");
                          const formatted = autoFormatAndPunctuateText(raw, selectedLanguage);
                          if (formatted.trim()) {
                            onDirectTextCaptured(formatted.trim());
                          }
                        }}
                        className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold shadow-md shadow-emerald-600/20 flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95"
                        title="Ouvrir directement ce texte avec mise en forme et ponctuation automatiques"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-emerald-200" />
                        <span>Valider et ouvrir le résultat</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Text Display / Editable Area */}
                <div className="bg-slate-950/90 rounded-xl p-3.5 border border-slate-800/80 min-h-[70px] max-h-48 overflow-y-auto">
                  {soloLiveSentences.length === 0 && !currentInterimTranscript && !editableSoloText ? (
                    <p className="text-xs text-slate-500 italic flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-slate-600 animate-pulse" />
                      {isRecording 
                        ? "Parlez dans le micro, les mots s'affichent instantanément ici..." 
                        : "Le texte reconnu apparaîtra ici dès le début de votre dictée."}
                    </p>
                  ) : (
                    <div className="text-xs text-slate-200 leading-relaxed font-sans space-y-1.5">
                      {soloLiveSentences.length > 0 && (
                        <p className="text-slate-100 font-medium whitespace-pre-wrap">
                          {soloLiveSentences.join(" ")}
                        </p>
                      )}
                      {currentInterimTranscript && (
                        <p className="text-indigo-300 font-medium italic animate-pulse">
                          {currentInterimTranscript} <span className="inline-block w-1 h-3 bg-indigo-400 animate-pulse" />
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </div>
        )}

        {/* MODE 2: Dedicated Audio File Upload Drag & Drop Zone */}
        {activeSourceMode === "upload" && (
          <div className="space-y-4">
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  processAudioFile(e.dataTransfer.files[0]);
                }
              }}
              className="border-2 border-dashed border-indigo-500/30 hover:border-indigo-500 bg-slate-950/60 hover:bg-slate-900/50 rounded-2xl p-8 sm:p-10 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-4"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,video/*,image/*,.mp3,.wav,.m4a,.aac,.ogg,.webm,.flac,.amr,.wma,.mp4,.pdf,.doc,.docx,.txt"
                className="hidden"
                onChange={handleFileInputChange}
              />

              <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-xl shadow-indigo-500/10">
                <FileAudio className="w-8 h-8 animate-bounce" />
              </div>

              <div className="space-y-1">
                <h4 className="text-sm font-bold text-white">
                  Glissez-déposez votre fichier audio ici
                </h4>
                <p className="text-xs text-slate-400">
                  ou <span className="text-indigo-400 font-semibold underline">parcourez vos fichiers</span> depuis votre appareil
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                {["MP3", "WAV", "M4A", "AAC", "OGG", "WEBM", "FLAC"].map((fmt) => (
                  <span
                    key={fmt}
                    className="px-2.5 py-1 bg-slate-900 border border-slate-800 text-[10px] font-mono font-bold text-slate-300 rounded-lg"
                  >
                    .{fmt}
                  </span>
                ))}
                <span className="text-[10px] text-slate-500">Jusqu'à 100 Mo</span>
              </div>
            </div>
          </div>
        )}

        {/* MODE 3: Meeting / Conference Recording with Live Paragraph Separation */}
        {activeSourceMode === "meeting" && (
          <div className="flex flex-col space-y-6 bg-slate-950/60 rounded-2xl border border-slate-800 p-6 relative overflow-hidden">
            {isRecording && !isPaused && (
              <div className="absolute inset-0 bg-indigo-600/10 animate-pulse pointer-events-none" />
            )}

            {/* Background Notification Badge */}
            {isRecording && (
              <div className="w-full bg-emerald-950/70 border border-emerald-500/40 rounded-2xl p-3.5 flex items-center justify-between gap-3 text-xs text-emerald-300 shadow-xl shadow-emerald-500/10 z-10">
                <div className="flex items-center gap-3">
                  <span className="relative flex h-3.5 w-3.5 shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
                  </span>
                  <div>
                    <p className="font-bold text-white text-xs flex items-center gap-2">
                      Enregistrement Réunion Actif
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[9px] uppercase font-mono border border-emerald-500/30">
                        Échanges en direct
                      </span>
                    </p>
                    <p className="text-[11px] text-emerald-200/80 mt-0.5">
                      Découpage dynamique des paragraphes à chaque pause vocale et enregistrement global de la réunion.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 z-10 border-b border-slate-800/80 pb-4">
              <div className="space-y-1 text-center sm:text-left">
                <div className="text-3xl font-mono font-bold tracking-wider text-white">
                  {formatTime(recordingTime)}
                </div>
                <div className="text-xs text-slate-400 flex items-center gap-2 justify-center sm:justify-start">
                  {isRecording ? (
                    <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                      {isPaused ? "Réunion en pause" : "Capture de la réunion & échanges en cours..."}
                    </span>
                  ) : audioBlob && !uploadedFileName ? (
                    <span className="text-indigo-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Réunion enregistrée et prête
                    </span>
                  ) : (
                    <span>Cliquez sur le micro pour lancer l'enregistrement de la réunion</span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3">
                {!isRecording && (!audioBlob || uploadedFileName) && (
                  <button
                    onClick={startRecording}
                    className="px-6 py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-2xl font-bold text-xs shadow-xl shadow-indigo-600/30 flex items-center gap-2.5 transition-all hover:scale-105 active:scale-95"
                  >
                    <Users className="w-4 h-4 text-indigo-200" />
                    <span>Démarrer la Réunion</span>
                  </button>
                )}

                {isRecording && (
                  <>
                    <button
                      onClick={pauseRecording}
                      className="p-3.5 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-xl border border-slate-700 transition-all"
                      title={isPaused ? "Reprendre" : "Mettre en pause"}
                    >
                      {isPaused ? <Play className="w-5 h-5 fill-current" /> : <Pause className="w-5 h-5" />}
                    </button>

                    <button
                      onClick={stopRecording}
                      className="px-5 py-3.5 bg-red-600 hover:bg-red-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-red-600/30 flex items-center gap-2 transition-all animate-pulse"
                    >
                      <Square className="w-4 h-4 fill-current" />
                      <span>Terminer la Réunion</span>
                    </button>
                  </>
                )}

                {audioBlob && !isRecording && !uploadedFileName && (
                  <button
                    onClick={resetAudio}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 flex items-center gap-2 text-xs transition-all"
                  >
                    <RefreshCw className="w-4 h-4 text-slate-400" />
                    <span>Nouvelle Réunion</span>
                  </button>
                )}
              </div>
            </div>

            {/* Audio Wave Visualizer */}
            {isRecording && (
              <div className="flex items-center justify-center gap-1.5 h-10 my-1 z-10">
                {[...Array(18)].map((_, i) => {
                  const heightPercent = Math.max(15, Math.min(100, (micVolume * (1 + (i % 6) * 0.3)) / 2));
                  return (
                    <motion.div
                      key={i}
                      className="w-1.5 bg-gradient-to-t from-emerald-500 to-teal-400 rounded-full"
                      animate={{ height: `${isPaused ? 10 : heightPercent}%` }}
                      transition={{ duration: 0.1 }}
                    />
                  );
                })}
              </div>
            )}

            {/* Pause Sensitivity & Auto Paragraph Split Controls */}
            <div className="bg-slate-900/90 rounded-2xl p-3.5 border border-indigo-500/30 space-y-2 z-10">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
                  <span className="font-bold text-slate-200">Saut de Ligne Automatique sur Pause Vocale</span>
                </div>
                <span className="text-[11px] text-slate-400">
                  Insère un paragraphe dès qu'un silence est détecté
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {[
                  { value: 1.0, label: "1.0s (Rapide)" },
                  { value: 1.5, label: "1.5s (Standard • Recommandé)" },
                  { value: 2.0, label: "2.0s (Incrémenté)" },
                  { value: 3.0, label: "3.0s (Pauses longues)" },
                ].map((threshold) => (
                  <button
                    key={threshold.value}
                    type="button"
                    onClick={() => setPauseThresholdSec(threshold.value)}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all flex items-center gap-1.5 ${
                      pauseThresholdSec === threshold.value
                        ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 border border-indigo-400"
                        : "bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800"
                    }`}
                  >
                    <span>{threshold.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Live Toast Notice on Automatic Paragraph Break */}
            <AnimatePresence>
              {showPauseBreakAlert && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.95 }}
                  className="bg-gradient-to-r from-indigo-900/90 to-purple-900/90 border border-indigo-400/50 rounded-2xl p-3 text-xs text-indigo-100 flex items-center justify-between shadow-2xl z-20"
                >
                  <div className="flex items-center gap-2 font-medium">
                    <Sparkles className="w-4 h-4 text-amber-300 animate-spin" />
                    <span>
                      Pause de silence de <strong className="text-white">{pauseThresholdSec}s</strong> détectée ➔ <strong>Nouveau paragraphe & saut de ligne insérés !</strong>
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-indigo-500/30 font-mono text-[10px] text-indigo-200">
                    Saut auto
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Live Paragraph Breakdown Display Box */}
            <div className="space-y-3 z-10">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <AlignLeft className="w-4 h-4 text-indigo-400" />
                  <span>Transcription Instantanée Live ({liveMeetingParagraphs.length} paragraphe{liveMeetingParagraphs.length > 1 ? "s" : ""})</span>
                  {isRecording && (
                    <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-mono border border-indigo-500/30 flex items-center gap-1.5 animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                      ⚡ Direct Mot à Mot
                    </span>
                  )}
                </span>

                <div className="flex items-center gap-2">
                  {(liveMeetingParagraphs.length > 0 || currentInterimTranscript) && (
                    <button
                      type="button"
                      onClick={() => {
                        const raw = [...liveMeetingParagraphs, currentInterimTranscript ? `[En cours] ${currentInterimTranscript}` : ""].filter(Boolean).join("\n\n");
                        const fullText = autoFormatAndPunctuateText(raw, selectedLanguage);
                        navigator.clipboard.writeText(fullText);
                        setCopiedTranscript(true);
                        setTimeout(() => setCopiedTranscript(false), 2000);
                      }}
                      className="text-[11px] font-bold text-indigo-300 hover:text-white flex items-center gap-1 bg-indigo-500/20 px-2.5 py-1 rounded-lg border border-indigo-500/30 transition-all"
                    >
                      {copiedTranscript ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedTranscript ? "Copié !" : "Copier"}</span>
                    </button>
                  )}

                  {(liveMeetingParagraphs.length > 0 || currentInterimTranscript) && onDirectTextCaptured && !isRecording && (
                    <button
                      type="button"
                      onClick={() => {
                        const raw = [...liveMeetingParagraphs, currentInterimTranscript ? `[En cours] ${currentInterimTranscript}` : ""].filter(Boolean).join("\n\n");
                        const formatted = autoFormatAndPunctuateText(raw, selectedLanguage);
                        if (formatted.trim()) {
                          onDirectTextCaptured(formatted.trim());
                        }
                      }}
                      className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold shadow-md shadow-emerald-600/20 flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95"
                      title="Ouvrir directement la réunion dans l'éditeur avec mise en forme et ponctuation automatiques"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-emerald-200" />
                      <span>Valider et ouvrir le résultat</span>
                    </button>
                  )}
                </div>
              </div>

              <div
                ref={transcriptScrollRef}
                className="max-h-64 overflow-y-auto space-y-2.5 bg-slate-900/90 rounded-2xl p-4 border border-slate-800 text-xs scroll-smooth"
              >
                {liveMeetingParagraphs.length === 0 && !currentInterimTranscript ? (
                  <div className="text-center py-6 text-slate-500 space-y-1">
                    <MessageSquare className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                    <p className="font-semibold text-slate-400">Aucun échange détecté pour le moment</p>
                    <p className="text-[11px] text-slate-500">
                      Lancez la réunion et commencez à parler : la parole se transforme instantanément en texte sur votre écran mot à mot.
                    </p>
                  </div>
                ) : (
                  <>
                    {liveMeetingParagraphs.map((para, index) => (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-3 bg-slate-950/80 rounded-xl border border-indigo-500/20 space-y-1"
                      >
                        <div className="flex items-center gap-2 text-[10px] text-indigo-400 font-mono font-bold">
                          <Clock className="w-3 h-3 text-indigo-400" />
                          <span>Paragraphe #{index + 1}</span>
                        </div>
                        <p className="text-slate-200 leading-relaxed font-sans">{para}</p>
                      </motion.div>
                    ))}

                    {/* Instant Real-Time Streaming Word-by-Word Active Paragraph */}
                    {currentInterimTranscript && (
                      <motion.div
                        initial={{ opacity: 0, y: 3 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-3 bg-indigo-950/50 border border-indigo-500/50 rounded-xl space-y-1 text-indigo-200 animate-pulse shadow-lg shadow-indigo-500/10"
                      >
                        <div className="flex items-center justify-between text-[10px] text-indigo-300 font-mono font-bold">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                            [Échange en direct live...]
                          </span>
                          <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-indigo-500/30 border border-indigo-400/30">
                            Instant de parole
                          </span>
                        </div>
                        <p className="text-white font-medium text-xs leading-relaxed italic">
                          "{currentInterimTranscript}" <span className="inline-block w-1.5 h-3 bg-indigo-400 animate-pulse ml-0.5" />
                        </p>
                      </motion.div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Audio Player Preview (Visible whenever an audio file or recording exists) */}
        {audioUrl && !isRecording && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-4 bg-slate-950 rounded-2xl border border-indigo-500/30 space-y-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-xl border border-indigo-500/30 shrink-0">
                  <Music className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h5 className="text-xs font-bold text-white truncate">
                    {uploadedFileName || "Enregistrement_Vocal_HD.webm"}
                  </h5>
                  <p className="text-[10px] text-slate-400 flex items-center gap-2">
                    {uploadedFileSize && <span>Taille : {uploadedFileSize}</span>}
                    <span className="text-emerald-400 font-semibold">● Fichier prêt pour l'IA</span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={resetAudio}
                className="p-2 text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-white/10 rounded-xl text-xs flex items-center gap-1.5 transition-all shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Changer</span>
              </button>
            </div>

            <audio
              ref={audioPlayerRef}
              src={audioUrl}
              controls
              className="w-full h-10 accent-indigo-500 rounded-xl"
            />
          </motion.div>
        )}

        {/* Transcription Style Options */}
        <div className="space-y-3 pt-2">
          <label className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <Radio className="w-4 h-4 text-indigo-400" />
            <span>{t.voice.modeStandard}</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setPromptMode("formatted")}
              className={`p-3.5 rounded-2xl border text-left text-xs transition-all ${
                promptMode === "formatted"
                  ? "bg-indigo-600/25 border-indigo-500 text-white font-medium shadow-lg shadow-indigo-600/15"
                  : "bg-slate-950/60 border-slate-800 text-slate-400 hover:bg-slate-900"
              }`}
            >
              <div className="font-bold text-slate-200 mb-1">⚡ {t.voice.modeStandard}</div>
              <div className="text-[11px] text-slate-400 leading-snug">{t.voice.recordingInstruction}</div>
            </button>

            <button
              type="button"
              onClick={() => setPromptMode("verbatim")}
              className={`p-3.5 rounded-2xl border text-left text-xs transition-all ${
                promptMode === "verbatim"
                  ? "bg-indigo-600/25 border-indigo-500 text-white font-medium shadow-lg shadow-indigo-600/15"
                  : "bg-slate-950/60 border-slate-800 text-slate-400 hover:bg-slate-900"
              }`}
            >
              <div className="font-bold text-slate-200 mb-1">📝 {t.voice.modeVerbatim}</div>
              <div className="text-[11px] text-slate-400 leading-snug">{t.voice.modeVerbatim}</div>
            </button>

            <button
              type="button"
              onClick={() => setPromptMode("meeting_notes")}
              className={`p-3.5 rounded-2xl border text-left text-xs transition-all ${
                promptMode === "meeting_notes"
                  ? "bg-indigo-600/25 border-indigo-500 text-white font-medium shadow-lg shadow-indigo-600/15"
                  : "bg-slate-950/60 border-slate-800 text-slate-400 hover:bg-slate-900"
              }`}
            >
              <div className="font-bold text-slate-200 mb-1">📊 {t.voice.modeSummary}</div>
              <div className="text-[11px] text-slate-400 leading-snug">{t.voice.modeSummary}</div>
            </button>
          </div>
        </div>

        {/* Submit Audio Transcription CTA Button */}
        {audioBlob && !isRecording && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="pt-3"
          >
            <button
              onClick={handleTranscribeClick}
              disabled={isProcessing || isCompressing}
              className="w-full py-4 bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-sm rounded-2xl shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-2.5 transition-all disabled:opacity-50 hover:scale-[1.01]"
            >
              {isCompressing || isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 text-indigo-200 animate-spin" />
                  <span>{compressStatus || t.scanner.processBtn}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 text-indigo-200 animate-spin-slow" />
                  <span>{t.voice.stopRecord}</span>
                </>
              )}
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}

