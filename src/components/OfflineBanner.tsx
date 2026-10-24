import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { WifiOff, Wifi, RefreshCw, AlertCircle } from "lucide-react";
import { getTranslations } from "../lib/translations";

interface OfflineBannerProps {
  theme?: "dark" | "light";
  selectedLanguage?: string;
}

export default function OfflineBanner({ theme = "dark", selectedLanguage }: OfflineBannerProps) {
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== "undefined" ? !navigator.onLine : false);
  const [justReconnected, setJustReconnected] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const t = getTranslations(selectedLanguage);
  const offlineT = t.offline || {
    title: "Connexion Internet Absente",
    message: "AbookScan nécessite une connexion réseau pour l'analyse IA et les transcriptions. Vérifiez votre Wi-Fi ou vos données mobiles.",
    reconnect: "Réessayer la connexion",
    onlineNotice: "Connexion rétablie ! Les services IA sont de nouveau opérationnels.",
  };

  useEffect(() => {
    const handleOffline = () => {
      setIsOffline(true);
      setJustReconnected(false);
    };

    const handleOnline = () => {
      setIsOffline(false);
      setJustReconnected(true);
      const timer = setTimeout(() => {
        setJustReconnected(false);
      }, 4000);
      return () => clearTimeout(timer);
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  const checkConnection = async () => {
    setIsChecking(true);
    try {
      // Try fetching a lightweight endpoint or head request
      const res = await fetch("/api/health", { method: "HEAD", cache: "no-store" });
      if (res.ok || res.status < 500) {
        setIsOffline(false);
        setJustReconnected(true);
        setTimeout(() => setJustReconnected(false), 4000);
      } else {
        setIsOffline(!navigator.onLine);
      }
    } catch {
      setIsOffline(true);
    } finally {
      setIsChecking(false);
    }
  };

  const isLight = theme === "light";

  return (
    <AnimatePresence>
      {isOffline && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.98 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="fixed top-3 left-3 right-3 sm:left-1/2 sm:-translate-x-1/2 sm:max-w-xl z-50 pointer-events-auto"
          id="offline-connection-banner"
        >
          <div className={`p-3.5 sm:p-4 rounded-2xl shadow-2xl border backdrop-blur-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
            isLight
              ? "bg-rose-50/95 border-rose-200 text-slate-800 shadow-rose-500/10"
              : "bg-slate-900/95 border-rose-500/40 text-slate-100 shadow-rose-950/50"
          }`}>
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-500 shrink-0 mt-0.5 sm:mt-0">
                <WifiOff className="w-5 h-5 animate-pulse" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs sm:text-sm font-bold font-display text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 inline" />
                    {offlineT.title}
                  </h4>
                  <span className="px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-widest font-bold rounded bg-rose-500/20 text-rose-500 border border-rose-500/30">
                    Hors-Ligne
                  </span>
                </div>
                <p className={`text-xs leading-relaxed ${isLight ? "text-slate-600" : "text-slate-300"}`}>
                  {offlineT.message}
                </p>
              </div>
            </div>

            <button
              onClick={checkConnection}
              disabled={isChecking}
              className={`w-full sm:w-auto px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 shrink-0 transition-all border ${
                isLight
                  ? "bg-white hover:bg-rose-100/50 text-rose-700 border-rose-300 shadow-sm"
                  : "bg-slate-800 hover:bg-slate-750 text-rose-300 border-rose-500/30"
              } active:scale-95 disabled:opacity-50`}
              title={offlineT.reconnect}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? "animate-spin text-rose-500" : ""}`} />
              <span className="whitespace-nowrap">{offlineT.reconnect}</span>
            </button>
          </div>
        </motion.div>
      )}

      {!isOffline && justReconnected && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.98 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="fixed top-3 left-3 right-3 sm:left-1/2 sm:-translate-x-1/2 sm:max-w-md z-50 pointer-events-auto"
          id="online-restored-banner"
        >
          <div className={`p-3.5 rounded-2xl shadow-2xl border backdrop-blur-xl flex items-center gap-3 ${
            isLight
              ? "bg-emerald-50/95 border-emerald-300 text-emerald-950 shadow-emerald-500/10"
              : "bg-slate-900/95 border-emerald-500/40 text-emerald-100 shadow-emerald-950/50"
          }`}>
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-500 shrink-0">
              <Wifi className="w-5 h-5 animate-bounce" />
            </div>
            <p className="text-xs sm:text-sm font-semibold leading-tight">
              {offlineT.onlineNotice}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
