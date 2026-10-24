import React, { useState } from "react";
import { motion } from "motion/react";
import { 
  ArrowUpCircle, 
  Sparkles, 
  RefreshCw, 
  ShieldCheck, 
  Zap, 
  AlertTriangle,
  Layers,
  Cpu
} from "lucide-react";
import { RemoteVersionInfo, forceUpdateAndReload } from "../lib/versionManager";
import { Translations } from "../lib/translations";

interface ForceUpdateModalProps {
  currentVersion: string;
  remoteInfo: RemoteVersionInfo | null;
  t: Translations;
  isMandatory?: boolean;
}

export const ForceUpdateModal: React.FC<ForceUpdateModalProps> = ({
  currentVersion,
  remoteInfo,
  t,
  isMandatory = true,
}) => {
  const [isUpdating, setIsUpdating] = useState(false);

  const handleUpdate = async () => {
    setIsUpdating(true);
    await forceUpdateAndReload();
  };

  const newVersion = remoteInfo?.version || "2.4.0";
  const releaseDate = remoteInfo?.releaseDate || "2026-08-13";
  const featuresList = remoteInfo?.features && remoteInfo.features.length > 0 
    ? remoteInfo.features 
    : [
        "Mise à niveau des modèles d'analyse multimodale Gemini",
        "Optimisation de la transcription vocale et vitesse de traitement",
        "Amélioration de la sécurité locale et de la compatibilité hors-ligne",
      ];

  return (
    <div 
      id="force-update-modal-container"
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 bg-black/90 backdrop-blur-xl select-none"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-zinc-950 border border-teal-500/30 shadow-[0_0_60px_rgba(20,184,166,0.25)] flex flex-col"
      >
        {/* Top Glowing Ambient Accents */}
        <div className="absolute -top-24 -left-24 w-56 h-56 bg-teal-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -top-24 -right-24 w-56 h-56 bg-cyan-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="relative px-6 pt-7 pb-4 text-center border-b border-white/10 flex flex-col items-center">
          <div className="relative mb-3">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-teal-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-teal-500/30">
              <ArrowUpCircle className="w-9 h-9 text-white animate-bounce" />
            </div>
            <div className="absolute -bottom-1 -right-1 p-1 bg-zinc-900 rounded-full border border-teal-400/40">
              <Sparkles className="w-3.5 h-3.5 text-teal-400 animate-spin" />
            </div>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-500/15 border border-teal-500/30 text-teal-300 text-[11px] font-bold tracking-wider uppercase mb-2">
            <Zap className="w-3 h-3 text-teal-400" />
            <span>{t.update?.badge || "Mise à Jour Requise"}</span>
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            {remoteInfo?.title || t.update?.title || "Nouvelle version AbookScan IA"}
          </h2>

          <p className="text-xs sm:text-sm text-slate-300 font-light mt-1.5 max-w-md">
            {remoteInfo?.message || t.update?.description || "Une nouvelle version d'AbookScan IA a été publiée sur Netlify. Pour continuer, veuillez recharger l'application."}
          </p>
        </div>

        {/* Version Comparison Pill */}
        <div className="px-6 py-4 bg-white/[0.02]">
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-zinc-900/90 border border-white/10 shadow-inner">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                {t.update?.currentVersion || "Version actuelle"}
              </span>
              <span className="text-sm font-mono font-bold text-slate-300 line-through decoration-red-400/80">
                v{currentVersion}
              </span>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-teal-500/20 border border-teal-500/40 text-teal-300 text-xs font-mono font-bold shadow-sm">
              <span>→</span>
              <span>v{newVersion}</span>
            </div>

            <div className="flex flex-col text-right">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Date de sortie
              </span>
              <span className="text-xs font-mono font-medium text-slate-300">
                {releaseDate}
              </span>
            </div>
          </div>
        </div>

        {/* Features & Release Notes */}
        <div className="px-6 py-3 space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-bold text-teal-300">
            <Cpu className="w-4 h-4 text-teal-400" />
            <span>{t.update?.featuresTitle || "Améliorations incluses :"}</span>
          </div>

          <div className="space-y-2">
            {featuresList.map((feature, idx) => (
              <div 
                key={idx} 
                className="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/[0.03] border border-white/5 text-xs text-slate-200"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0 mt-1.5" />
                <span className="leading-relaxed">{feature}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-200/90">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="leading-tight">
              {t.update?.whyRequired || "L'ancienne version a été désactivée sur le serveur pour éviter toute erreur de synchronisation."}
            </span>
          </div>
        </div>

        {/* Action Button Area */}
        <div className="p-6 pt-3 border-t border-white/10 mt-2">
          <button
            id="btn-force-update-app"
            type="button"
            disabled={isUpdating}
            onClick={handleUpdate}
            className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-teal-500 via-teal-400 to-cyan-400 hover:from-teal-400 hover:to-cyan-300 text-black font-black text-sm tracking-wide uppercase shadow-xl shadow-teal-500/30 flex items-center justify-center gap-3 transition-all transform active:scale-95 disabled:opacity-75 cursor-pointer"
          >
            {isUpdating ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>{t.update?.updating || "Mise à jour en cours..."}</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-5 h-5" />
                <span>{t.update?.updateBtn || "Mettre à jour & Recharger"}</span>
              </>
            )}
          </button>

          <div className="mt-3 flex items-center justify-center gap-2 text-[10px] text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
            <span>Netlify Edge Network • Déploiement sécurisé et instantané</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
