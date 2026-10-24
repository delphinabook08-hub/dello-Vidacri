import { motion, AnimatePresence } from "motion/react";
import { X, Globe, History, Phone, Mail, Trash2, ShieldCheck, ExternalLink, Sun, Moon, Palette, RefreshCw, CheckCircle2, ArrowUpCircle, BarChart3, Users } from "lucide-react";
import { useState } from "react";
import { getTranslations } from "../lib/translations";
import { CURRENT_APP_VERSION, checkAppVersion, forceUpdateAndReload } from "../lib/versionManager";
import { AppLogo } from "./AppLogo";

export type ColorPalette = "emerald" | "amethyst" | "sunset" | "sapphire";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLanguage: string;
  onLanguageChange: (lang: string) => void;
  languages: { code: string; label: string }[];
  history: any[];
  onClearHistory: () => void;
  onSelectHistoryItem: (item: any) => void;
  isPrivateMode: boolean;
  onPrivateModeChange: (val: boolean) => void;
  isScreenProtect: boolean;
  onScreenProtectChange: (val: boolean) => void;
  theme?: "dark" | "light";
  onThemeChange?: (theme: "dark" | "light") => void;
  colorPalette?: ColorPalette;
  onColorPaletteChange?: (palette: ColorPalette) => void;
  onOpenAdminStats?: () => void;
  onOpenTwaGuide?: () => void;
}

export default function SettingsModal({
  isOpen,
  onClose,
  selectedLanguage,
  onLanguageChange,
  languages,
  history,
  onClearHistory,
  onSelectHistoryItem,
  isPrivateMode,
  onPrivateModeChange,
  isScreenProtect,
  onScreenProtectChange,
  theme = "dark",
  onThemeChange,
  colorPalette = "emerald",
  onColorPaletteChange,
  onOpenAdminStats,
  onOpenTwaGuide
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<"general" | "history">("general");
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateStatusMsg, setUpdateStatusMsg] = useState<string | null>(null);

  const handleManualUpdateCheck = async () => {
    setIsCheckingUpdate(true);
    setUpdateStatusMsg(null);
    try {
      const result = await checkAppVersion();
      if (result.isOutdated && result.remoteInfo) {
        setUpdateStatusMsg(`Nouvelle version v${result.remoteInfo.version} détectée !`);
        await forceUpdateAndReload();
      } else {
        setUpdateStatusMsg(`Votre application est à jour (v${CURRENT_APP_VERSION}).`);
        setTimeout(() => setUpdateStatusMsg(null), 4000);
      }
    } catch (e) {
      setUpdateStatusMsg("Impossible de joindre le serveur de mise à jour.");
      setTimeout(() => setUpdateStatusMsg(null), 4000);
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const t = getTranslations(selectedLanguage);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className={`w-full max-w-lg rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col max-h-[85vh] transition-colors duration-200 border ${
              theme === "light"
                ? "bg-white border-slate-200 text-slate-900"
                : "bg-zinc-900 border-white/10 text-white"
            }`}
          >
            {/* Header */}
            <div className={`p-6 border-b flex items-center justify-between ${
              theme === "light" ? "border-slate-200 bg-slate-50" : "border-white/5 bg-white/5"
            }`}>
              <div className="flex items-center gap-3">
                <AppLogo size="md" />
                <h2 className="text-sm font-display font-medium flex items-center gap-2">
                  {t.settings.title} <span className="text-[10px] text-teal-500 font-mono uppercase tracking-widest font-bold">v{CURRENT_APP_VERSION}</span>
                </h2>
              </div>
              <button 
                onClick={() => {
                  onClose();
                  setIsConfirmingClear(false);
                }} 
                className={`p-2 rounded-full transition-colors ${
                  theme === "light" ? "hover:bg-slate-200 text-slate-600" : "hover:bg-white/10 text-slate-400"
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className={`flex p-2 gap-2 ${theme === "light" ? "bg-slate-100" : "bg-black/20"}`}>
              <button 
                onClick={() => {
                  setActiveTab("general");
                  setIsConfirmingClear(false);
                }}
                className={`flex-1 py-3 rounded-2xl text-[10px] uppercase font-bold tracking-widest transition-all flex items-center justify-center gap-2 ${
                  activeTab === "general"
                    ? theme === "light"
                      ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                      : "bg-white/10 text-white"
                    : theme === "light"
                      ? "text-slate-600 hover:text-slate-900"
                      : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <ShieldCheck className="w-4 h-4 text-teal-500" /> {t.settings.tabGeneral}
              </button>
              <button 
                onClick={() => {
                  setActiveTab("history");
                  setIsConfirmingClear(false);
                }}
                className={`flex-1 py-3 rounded-2xl text-[10px] uppercase font-bold tracking-widest transition-all flex items-center justify-center gap-2 ${
                  activeTab === "history"
                    ? theme === "light"
                      ? "bg-white text-slate-900 shadow-sm border border-slate-200"
                      : "bg-white/10 text-white"
                    : theme === "light"
                      ? "text-slate-600 hover:text-slate-900"
                      : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <History className="w-4 h-4 text-teal-500" /> {t.settings.tabHistory} ({history.length})
              </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              {activeTab === "general" ? (
                <>
                  {/* Theme Switcher / Mode Visuel & Color Palettes */}
                  <div className="space-y-4">
                    <label className="text-[10px] uppercase tracking-widest text-teal-600 dark:text-teal-400 font-bold block flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Palette className="w-3.5 h-3.5" /> Thème & Palette de Couleurs
                      </span>
                      <span className="text-[9px] font-mono font-semibold px-2 py-0.5 rounded-full bg-white/5 border border-white/10 uppercase">
                        {colorPalette}
                      </span>
                    </label>

                    {/* Dark vs Light Mode Toggle */}
                    <div className={`grid grid-cols-2 gap-2.5 p-1.5 rounded-2xl border ${
                      theme === "light"
                        ? "bg-slate-100 border-slate-200/80"
                        : "bg-black/40 border-white/5"
                    }`}>
                      <button
                        type="button"
                        onClick={() => onThemeChange && onThemeChange("dark")}
                        className={`flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl text-xs font-bold transition-all ${
                          theme === "dark"
                            ? "bg-zinc-800 text-white shadow-md border border-teal-500/40 ring-1 ring-teal-500/20"
                            : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
                        }`}
                      >
                        <Moon className={`w-4 h-4 ${theme === "dark" ? "text-teal-400 fill-teal-400/20" : "text-slate-400"}`} />
                        <span>{t.settings.darkTheme}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onThemeChange && onThemeChange("light")}
                        className={`flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl text-xs font-bold transition-all ${
                          theme === "light"
                            ? "bg-white text-slate-900 shadow-md border border-slate-300 ring-1 ring-slate-200"
                            : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
                        }`}
                      >
                        <Sun className={`w-4 h-4 ${theme === "light" ? "text-amber-500 fill-amber-500/20" : "text-slate-400"}`} />
                        <span>{t.settings.lightTheme}</span>
                      </button>
                    </div>

                    {/* 4 Color Palette Cards */}
                    <div className="grid grid-cols-2 gap-2.5 pt-1">
                      {[
                        {
                          id: "emerald" as const,
                          name: "Émeraude & Cyan",
                          tag: "Laser Tech",
                          gradient: "from-emerald-400 via-teal-400 to-cyan-400",
                          dotBg: "bg-teal-400",
                          borderAccent: "border-teal-500 ring-teal-500/25",
                        },
                        {
                          id: "amethyst" as const,
                          name: "Cyber Améthyste",
                          tag: "Néon & Violet",
                          gradient: "from-violet-400 via-purple-400 to-pink-500",
                          dotBg: "bg-purple-400",
                          borderAccent: "border-purple-500 ring-purple-500/25",
                        },
                        {
                          id: "sunset" as const,
                          name: "Sunset Impérial",
                          tag: "Or & Ambre",
                          gradient: "from-amber-400 via-orange-400 to-rose-500",
                          dotBg: "bg-amber-400",
                          borderAccent: "border-amber-500 ring-amber-500/25",
                        },
                        {
                          id: "sapphire" as const,
                          name: "Saphir Royal",
                          tag: "Azur Cobalt",
                          gradient: "from-blue-500 via-indigo-500 to-cyan-400",
                          dotBg: "bg-blue-400",
                          borderAccent: "border-blue-500 ring-blue-500/25",
                        },
                      ].map((item) => {
                        const isSelected = colorPalette === item.id;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => onColorPaletteChange && onColorPaletteChange(item.id)}
                            className={`p-3 rounded-2xl border text-left transition-all relative overflow-hidden group flex flex-col justify-between h-20 ${
                              isSelected
                                ? theme === "light"
                                  ? `bg-white shadow-lg ${item.borderAccent} border-2 ring-2`
                                  : `bg-white/10 shadow-lg ${item.borderAccent} border-2 ring-2`
                                : theme === "light"
                                  ? "bg-slate-50 border-slate-200 hover:border-slate-300"
                                  : "bg-black/30 border-white/5 hover:border-white/15"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[8px] font-mono uppercase tracking-widest text-slate-400 font-semibold">
                                {item.tag}
                              </span>
                              {isSelected ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-teal-500 dark:text-teal-400" />
                              ) : (
                                <div className={`w-2.5 h-2.5 rounded-full ${item.dotBg} opacity-60 group-hover:opacity-100 transition-opacity`} />
                              )}
                            </div>

                            <div className="space-y-1">
                              <span className={`text-[11px] font-bold block truncate ${
                                theme === "light" ? "text-slate-900" : "text-white"
                              }`}>
                                {item.name}
                              </span>
                              {/* Vivid color gradient preview bar */}
                              <div className={`h-1.5 w-full rounded-full bg-gradient-to-r ${item.gradient} shadow-sm`} />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Language Selection */}
                  <div className={`pt-6 border-t ${theme === "light" ? "border-slate-200" : "border-white/5"} space-y-3`}>
                    <label className="text-[10px] uppercase tracking-widest text-teal-600 dark:text-teal-400 font-bold block">
                      {t.settings.systemLanguage}
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {languages.map((lang) => (
                        <button
                          key={lang.code}
                          onClick={() => onLanguageChange(lang.code)}
                          className={`p-2.5 rounded-xl border text-[10px] font-mono uppercase tracking-widest transition-all text-left ${
                            selectedLanguage === lang.code 
                            ? theme === "light"
                              ? "bg-teal-500/10 border-teal-500 text-teal-800 font-bold shadow-sm"
                              : "bg-teal-500/20 border-teal-500 text-teal-400 font-bold" 
                            : theme === "light"
                              ? "bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300"
                              : "bg-white/5 border-white/5 text-slate-400 hover:border-white/10"
                          }`}
                        >
                          {lang.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Free & Unlimited Access Status */}
                  <div className={`pt-6 border-t ${theme === "light" ? "border-slate-200" : "border-white/5"} space-y-3 font-sans`}>
                    <label className="text-[10px] uppercase tracking-widest text-teal-600 dark:text-teal-400 font-bold block">
                      Licence & Accès
                    </label>
                    <div className={`p-4 rounded-2xl border flex flex-col gap-2.5 ${
                      theme === "light"
                        ? "bg-slate-50 border-slate-200"
                        : "bg-white/5 border-white/5"
                    }`}>
                      <div className="flex justify-between items-center bg-transparent">
                        <span className={`text-xs ${theme === "light" ? "text-slate-600" : "text-slate-400"}`}>Statut d'accès</span>
                        <span className="px-2.5 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-widest font-bold bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/30 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse"></span>
                          100% Gratuit & Illimité
                        </span>
                      </div>
                      <div className="flex justify-between items-center bg-transparent">
                        <span className={`text-xs ${theme === "light" ? "text-slate-600" : "text-slate-400"}`}>Fonctionnalités</span>
                        <span className={`text-xs font-medium ${theme === "light" ? "text-slate-800" : "text-slate-200"}`}>
                          OCR, Audio, Multimodal & Exports complets
                        </span>
                      </div>
                      <p className={`text-[10px] leading-relaxed border-t pt-2 mt-0.5 ${theme === "light" ? "border-slate-200 text-slate-500" : "border-white/5 text-slate-400"}`}>
                        Aucun paiement ni abonnement requis. Toutes les capacités d'intelligence artificielle Gemini sont ouvertes sans quota.
                      </p>
                    </div>
                  </div>

                  {/* Security & Confidentiality */}
                  <div className={`pt-6 border-t ${theme === "light" ? "border-slate-200" : "border-white/5"} space-y-4`}>
                    <label className="text-[10px] uppercase tracking-widest text-teal-600 dark:text-teal-400 font-bold block">
                      {t.settings.zeroRetention} & {t.settings.screenProtect}
                    </label>
                    <div className="space-y-3">
                      {/* Zero retention toggle */}
                      <div className={`flex items-center justify-between p-3.5 rounded-2xl border ${
                        theme === "light"
                          ? "bg-slate-50 border-slate-200"
                          : "bg-white/5 border-white/5"
                      }`}>
                        <div className="space-y-0.5 text-left pr-4">
                          <span className={`block text-xs font-semibold ${theme === "light" ? "text-slate-900" : "text-white"}`}>
                            {t.settings.zeroRetention}
                          </span>
                          <span className={`block text-[8px] leading-relaxed font-light ${theme === "light" ? "text-slate-600" : "text-slate-400"}`}>
                            {t.settings.zeroRetentionDesc}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => onPrivateModeChange(!isPrivateMode)}
                          className={`w-11 h-6 rounded-full p-0.5 transition-all shrink-0 cursor-pointer ${
                            isPrivateMode 
                              ? "bg-teal-500" 
                              : theme === "light" ? "bg-slate-300" : "bg-zinc-800"
                          }`}
                        >
                          <div
                            className={`w-5 h-5 rounded-full shadow-md transition-all ${
                              theme === "light" ? "bg-white" : "bg-zinc-950"
                            } ${isPrivateMode ? "translate-x-5" : "translate-x-0"}`}
                          />
                        </button>
                      </div>

                      {/* Screen protect toggle */}
                      <div className={`flex items-center justify-between p-3.5 rounded-2xl border ${
                        theme === "light"
                          ? "bg-slate-50 border-slate-200"
                          : "bg-white/5 border-white/5"
                      }`}>
                        <div className="space-y-0.5 text-left pr-4">
                          <span className={`block text-xs font-semibold ${theme === "light" ? "text-slate-900" : "text-white"}`}>
                            {t.settings.screenProtect}
                          </span>
                          <span className={`block text-[8px] leading-relaxed font-light ${theme === "light" ? "text-slate-600" : "text-slate-400"}`}>
                            {t.settings.screenProtectDesc}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => onScreenProtectChange(!isScreenProtect)}
                          className={`w-11 h-6 rounded-full p-0.5 transition-all shrink-0 cursor-pointer ${
                            isScreenProtect 
                              ? "bg-teal-500" 
                              : theme === "light" ? "bg-slate-300" : "bg-zinc-800"
                          }`}
                        >
                          <div
                            className={`w-5 h-5 rounded-full shadow-md transition-all ${
                              theme === "light" ? "bg-white" : "bg-zinc-950"
                            } ${isScreenProtect ? "translate-x-5" : "translate-x-0"}`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Version & Netlify Updates */}
                  <div className={`pt-6 border-t ${theme === "light" ? "border-slate-200" : "border-white/5"} space-y-3`}>
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] uppercase tracking-widest text-teal-600 dark:text-teal-400 font-bold block">
                        {t.settings.versionUpdates}
                      </label>
                      <span className="text-[9px] font-mono text-slate-400">
                        {t.settings.netlifySync}
                      </span>
                    </div>

                    <div className={`p-3.5 rounded-2xl border flex flex-col gap-3 ${
                      theme === "light" ? "bg-slate-50 border-slate-200" : "bg-white/5 border-white/5"
                    }`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-xl bg-teal-500/10 text-teal-500">
                            <ArrowUpCircle className="w-4 h-4" />
                          </div>
                          <div>
                            <span className={`block text-xs font-semibold ${theme === "light" ? "text-slate-900" : "text-white"}`}>
                              AbookScan IA v{CURRENT_APP_VERSION}
                            </span>
                            <span className={`block text-[9px] font-light ${theme === "light" ? "text-slate-500" : "text-slate-400"}`}>
                              {t.settings.autoVerifyDesc}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={isCheckingUpdate}
                          onClick={handleManualUpdateCheck}
                          className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
                            theme === "light"
                              ? "bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200"
                              : "bg-teal-500/15 text-teal-300 hover:bg-teal-500/30 border border-teal-500/30"
                          } disabled:opacity-60`}
                        >
                          <RefreshCw className={`w-3 h-3 ${isCheckingUpdate ? "animate-spin" : ""}`} />
                          <span>{isCheckingUpdate ? t.settings.checkingBtn : t.settings.checkBtn}</span>
                        </button>
                      </div>

                      {updateStatusMsg && (
                        <div className={`text-[10px] p-2 rounded-lg flex items-center gap-1.5 ${
                          updateStatusMsg.includes("à jour") || updateStatusMsg.includes("Up to date") || updateStatusMsg.includes("Aktuell")
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : "bg-teal-500/10 text-teal-300 border border-teal-500/20"
                        }`}>
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>{updateStatusMsg}</span>
                        </div>
                      )}

                      {onOpenTwaGuide && (
                        <div className={`mt-3 p-3.5 rounded-2xl border ${theme === "light" ? "bg-slate-50 border-slate-200" : "bg-white/5 border-white/5"} flex items-center justify-between`}>
                          <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-teal-500/10 text-teal-500">
                              <ShieldCheck className="w-4 h-4" />
                            </div>
                            <div>
                              <span className={`block text-xs font-semibold ${theme === "light" ? "text-slate-900" : "text-white"}`}>
                                Google Play Console (TWA)
                              </span>
                              <span className={`block text-[9px] font-light ${theme === "light" ? "text-slate-500" : "text-slate-400"}`}>
                                Fichiers TWA & package AAB/APK prêts
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onOpenTwaGuide();
                            }}
                            className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer ${
                              theme === "light"
                                ? "bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200"
                                : "bg-teal-500/15 text-teal-300 hover:bg-teal-500/30 border border-teal-500/30"
                            }`}
                          >
                            <span>Voir TWA</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Support Channels */}
                  <div className={`pt-6 border-t ${theme === "light" ? "border-slate-200" : "border-white/5"} space-y-4`}>
                    <label className="text-[10px] uppercase tracking-widest text-teal-600 dark:text-teal-400 font-bold block">
                      {t.settings.support}
                    </label>
                    <div className="space-y-2">
                      <a 
                        href="tel:+243811339303" 
                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all group ${
                          theme === "light"
                            ? "bg-slate-50 border-slate-200 hover:bg-slate-100"
                            : "bg-white/5 border-white/5 hover:bg-white/10"
                        }`}
                      >
                        <div className="p-2.5 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-500">
                          <Phone className="w-4 h-4" />
                        </div>
                        <div>
                          <span className={`block text-[8px] uppercase tracking-widest mb-0.5 ${theme === "light" ? "text-slate-500" : "text-slate-400"}`}>
                            {t.settings.directPhone}
                          </span>
                          <span className={`text-xs font-mono font-medium ${theme === "light" ? "text-slate-900" : "text-white"}`}>
                            +243 811 339 303
                          </span>
                        </div>
                        <ExternalLink className={`w-3.5 h-3.5 ml-auto transition-colors ${
                          theme === "light" ? "text-slate-400 group-hover:text-teal-600" : "text-slate-600 group-hover:text-teal-400"
                        }`} />
                      </a>

                      <a 
                        href="mailto:supportabookscan@gmail.com" 
                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all group ${
                          theme === "light"
                            ? "bg-slate-50 border-slate-200 hover:bg-slate-100"
                            : "bg-white/5 border-white/5 hover:bg-white/10"
                        }`}
                      >
                        <div className="p-2.5 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-500">
                          <Mail className="w-4 h-4" />
                        </div>
                        <div>
                          <span className={`block text-[8px] uppercase tracking-widest mb-0.5 ${theme === "light" ? "text-slate-500" : "text-slate-400"}`}>
                            {t.settings.emailSupport}
                          </span>
                          <span className={`text-xs font-mono font-medium ${theme === "light" ? "text-slate-900" : "text-white"}`}>
                            supportabookscan@gmail.com
                          </span>
                        </div>
                        <ExternalLink className={`w-3.5 h-3.5 ml-auto transition-colors ${
                          theme === "light" ? "text-slate-400 group-hover:text-teal-600" : "text-slate-600 group-hover:text-teal-400"
                        }`} />
                      </a>
                    </div>
                  </div>

                  {/* Founder / Administrator Console */}
                  {onOpenAdminStats && (
                    <div className={`pt-6 border-t ${theme === "light" ? "border-slate-200" : "border-white/5"} space-y-3`}>
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] uppercase tracking-widest text-teal-600 dark:text-teal-400 font-bold flex items-center gap-1.5">
                          <BarChart3 className="w-3.5 h-3.5 text-teal-500" />
                          <span>Console Fondateur & Statistiques</span>
                        </label>
                        <span className="text-[9px] font-mono text-slate-500 uppercase">PIN : 2026</span>
                      </div>
                      
                      <button
                        onClick={() => {
                          onClose();
                          onOpenAdminStats();
                        }}
                        className={`w-full p-3.5 rounded-xl border transition-all flex items-center justify-between group text-left ${
                          theme === "light"
                            ? "bg-teal-50/70 border-teal-200 hover:bg-teal-100/80 text-teal-950"
                            : "bg-teal-500/10 border-teal-500/20 hover:bg-teal-500/20 text-white"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-teal-500 text-black">
                            <Users className="w-4 h-4" />
                          </div>
                          <div>
                            <span className="block text-xs font-bold font-sans">
                              Voir le Nombre d'Utilisateurs & Scans
                            </span>
                            <span className="block text-[9px] font-mono text-slate-500 dark:text-slate-400">
                              Données temps réel en direct de Firestore
                            </span>
                          </div>
                        </div>
                        <ExternalLink className="w-4 h-4 text-teal-500" />
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] uppercase tracking-widest text-teal-600 dark:text-teal-400 font-bold">
                      {t.settings.localArchives}
                    </label>
                    {isConfirmingClear ? (
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => setIsConfirmingClear(false)}
                          className={`text-[8px] uppercase tracking-widest transition-colors ${
                            theme === "light" ? "text-slate-500 hover:text-slate-900" : "text-slate-400 hover:text-white"
                          }`}
                        >
                          {t.settings.cancel}
                        </button>
                        <button 
                          onClick={() => {
                            onClearHistory();
                            setIsConfirmingClear(false);
                          }}
                          className="text-[8px] uppercase tracking-widest text-red-500 font-bold hover:text-red-600 transition-colors bg-red-500/10 px-2 py-1 rounded"
                        >
                          {t.settings.confirmClear}
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => setIsConfirmingClear(true)}
                        disabled={history.length === 0}
                        className="text-[8px] uppercase tracking-widest text-red-500 hover:text-red-600 transition-colors disabled:opacity-20 flex items-center gap-1 group font-bold"
                      >
                        <Trash2 className="w-3 h-3 group-hover:animate-shake" /> {t.settings.clearHistory}
                      </button>
                    )}
                  </div>

                  {history.length === 0 ? (
                    <div className="py-20 flex flex-col items-center justify-center text-center space-y-4">
                      <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                        theme === "light" ? "bg-slate-100 text-slate-400" : "bg-white/5 text-slate-600"
                      }`}>
                        <History className="w-8 h-8" />
                      </div>
                      <p className={`text-[10px] uppercase tracking-widest ${theme === "light" ? "text-slate-500" : "text-slate-400"}`}>
                        {t.settings.noArchives}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-3">
                      {history.map((item, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            onSelectHistoryItem(item);
                            onClose();
                          }}
                          className={`flex items-center gap-4 p-4 rounded-2xl border transition-all text-left group ${
                            theme === "light"
                              ? "bg-slate-50 border-slate-200 hover:bg-slate-100"
                              : "bg-white/5 border-white/5 hover:bg-white/10"
                          }`}
                        >
                          <div className={`w-12 h-16 rounded-lg overflow-hidden flex-shrink-0 border transition-all ${
                            theme === "light" ? "bg-slate-200 border-slate-300 group-hover:border-teal-500" : "bg-black border-white/10 group-hover:border-teal-500/50"
                          }`}>
                            <img src={item.preview} className="w-full h-full object-cover opacity-80" />
                          </div>
                          <div className="flex-1 overflow-hidden">
                            <span className="block text-[8px] text-teal-600 dark:text-teal-400 font-mono uppercase tracking-widest mb-1 font-bold">
                              {item.date}
                            </span>
                            <span className={`block text-xs truncate ${theme === "light" ? "text-slate-800 font-medium" : "text-white"}`}>
                              {item.text.substring(0, 40)}...
                            </span>
                          </div>
                          <div className={`p-2 rounded-full transition-all ${
                            theme === "light"
                              ? "bg-slate-200 group-hover:bg-teal-500 group-hover:text-black"
                              : "bg-white/5 group-hover:bg-teal-500 group-hover:text-black"
                          }`}>
                            <ExternalLink className="w-4 h-4" />
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className={`p-5 border-t text-center ${
              theme === "light" ? "bg-slate-100 border-slate-200" : "bg-black/40 border-white/5"
            }`}>
              <p className={`text-[8px] font-mono uppercase tracking-[0.3em] ${
                theme === "light" ? "text-slate-500 font-semibold" : "text-slate-500"
              }`}>
                {t.settings.poweredBy}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
