import { motion, AnimatePresence } from "motion/react";
import { 
  X, Download, Share2, Copy, Check, Smartphone, Monitor, Laptop, 
  HelpCircle, QrCode, Sparkles, AlertCircle, ChevronRight, ExternalLink,
  ShieldCheck, Terminal, PackageCheck, FileCode2, Layers
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState, useEffect } from "react";
import { getTranslations } from "../lib/translations";

import { AppLogo } from "./AppLogo";

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  onInstall?: () => void;
  showInstallBtn?: boolean;
  initialTab?: "share" | "install" | "twa";
  selectedLanguage?: string;
}

export default function QRCodeModal({ 
  isOpen, 
  onClose, 
  url,
  onInstall,
  showInstallBtn = false,
  initialTab = "share",
  selectedLanguage
}: QRCodeModalProps) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"share" | "install" | "twa">(initialTab);
  const [installPlatform, setInstallPlatform] = useState<"android" | "ios" | "pc">("android");

  const t = getTranslations(selectedLanguage || "French");
  const qr = t.qrModal;

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      
      // Auto-detect user platform for a personalized guide!
      const userAgent = navigator.userAgent.toLowerCase();
      if (/iphone|ipad|ipod/.test(userAgent)) {
        setInstallPlatform("ios");
      } else if (/android/.test(userAgent)) {
        setInstallPlatform("android");
      } else {
        setInstallPlatform("pc");
      }
    }
  }, [isOpen, initialTab]);

  const copyLink = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadQR = () => {
    const svg = document.getElementById("abookscan-qr");
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      const pngFile = canvas.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      downloadLink.download = "AbookScan_QR.png";
      downloadLink.href = pngFile;
      downloadLink.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(svgData);
  };

  const downloadTwaManifest = () => {
    const link = document.createElement("a");
    link.href = "/twa-manifest.json";
    link.download = "twa-manifest.json";
    link.click();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-xl"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="w-full max-w-lg max-h-[90vh] bg-zinc-900 border border-white/10 rounded-[3rem] overflow-hidden shadow-2xl p-6 md:p-8 flex flex-col space-y-5 relative overflow-y-auto no-scrollbar"
          >
            {/* Header */}
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2.5">
                <AppLogo size="md" />
                <span className="text-[10px] font-mono uppercase tracking-widest text-teal-400 font-bold">
                  {activeTab === "twa" ? "Google Play TWA & Android" : qr.title}
                </span>
              </div>
              <button 
                onClick={onClose} 
                className="p-2 rounded-full hover:bg-white/5 text-slate-500 hover:text-white transition-colors"
                id="close-qr-modal-btn"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Custom Interactive Tabs: 3 Tabs (Partager, Installer PWA, Google Play TWA) */}
            <div className="flex p-1 bg-black/40 border border-white/5 rounded-2xl gap-1">
              <button
                onClick={() => setActiveTab("share")}
                className={`flex-1 py-2.5 rounded-xl text-[9px] uppercase font-bold tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                  activeTab === "share" 
                    ? "bg-white/10 text-white shadow-inner" 
                    : "text-slate-500 hover:text-slate-300"
                }`}
                id="tab-share-link"
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>Partager</span>
              </button>
              <button
                onClick={() => setActiveTab("install")}
                className={`flex-1 py-2.5 rounded-xl text-[9px] uppercase font-bold tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                  activeTab === "install" 
                    ? "bg-white/10 text-white shadow-inner" 
                    : "text-slate-500 hover:text-slate-300"
                }`}
                id="tab-install-guide"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Installer PWA</span>
              </button>
              <button
                onClick={() => setActiveTab("twa")}
                className={`flex-1 py-2.5 rounded-xl text-[9px] uppercase font-bold tracking-wider transition-all flex items-center justify-center gap-1.5 ${
                  activeTab === "twa" 
                    ? "bg-teal-500/20 text-teal-300 border border-teal-500/30 shadow-inner" 
                    : "text-slate-500 hover:text-teal-400"
                }`}
                id="tab-twa-guide"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                <span>TWA Play Store</span>
              </button>
            </div>

            {/* Tab: Share / QR Code */}
            {activeTab === "share" && (
              <div className="flex flex-col items-center text-center space-y-6">
                <div className="space-y-1">
                  <h2 className="text-xl font-display font-light text-white">{qr.scanToInstall}</h2>
                  <p className="text-[10px] uppercase tracking-widest text-slate-500 px-4">
                    {qr.scanDesc}
                  </p>
                </div>

                <div className="p-5 bg-white rounded-[2rem] shadow-2xl relative group">
                  <QRCodeSVG
                    id="abookscan-qr"
                    value={url}
                    size={160}
                    level="H"
                    includeMargin={false}
                  />
                </div>

                <div className="w-full space-y-3">
                  <button
                    onClick={copyLink}
                    className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center gap-3 hover:bg-white/10 transition-all group"
                    id="copy-link-btn"
                  >
                    {copied ? <Check className="w-4 h-4 text-teal-500" /> : <Copy className="w-4 h-4 text-slate-400 group-hover:text-white" />}
                    <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400 group-hover:text-white">
                      {copied ? qr.linkCopied : qr.copyLink}
                    </span>
                  </button>

                  <button
                    onClick={downloadQR}
                    className="w-full py-4 bg-teal-500/10 border border-teal-500/20 rounded-2xl flex items-center justify-center gap-3 hover:bg-teal-500/20 transition-all"
                    id="download-qr-btn"
                  >
                    <Download className="w-4 h-4 text-teal-500" />
                    <span className="text-[10px] uppercase font-bold tracking-widest text-teal-500 font-bold">
                      {qr.downloadQR}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* Tab: Installation Guide (PWA) */}
            {activeTab === "install" && (
              <div className="flex flex-col space-y-5">
                <div className="text-center space-y-1">
                  <h2 className="text-xl font-display font-light text-white">{qr.installGuideTitle}</h2>
                  <p className="text-[10px] uppercase tracking-widest text-teal-400 font-mono">
                    Application Autonome Plein Écran (PWA)
                  </p>
                </div>

                {/* Notice if running inside an iframe (e.g. AI Studio development preview) */}
                {typeof window !== "undefined" && window.self !== window.top && (
                  <div className="p-3.5 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-teal-500/10 border border-amber-500/30 rounded-2xl text-left space-y-2">
                    <div className="flex items-center gap-2 text-amber-300 text-xs font-bold font-mono">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Installation Native sur votre appareil</span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed font-light">
                      Les navigateurs bloquent l'installation directe depuis les fenêtres d'aperçu intégrées. Ouvrez l'application dans son propre onglet ou sur votre téléphone pour activer l'installation officielle.
                    </p>
                    <button
                      onClick={() => window.open(url || window.location.href, "_blank")}
                      className="w-full py-2.5 bg-amber-400 hover:bg-amber-300 text-black font-bold text-[10px] uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 shadow-md"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Ouvrir en plein écran pour installer</span>
                    </button>
                  </div>
                )}

                {/* Platform Selector buttons */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setInstallPlatform("android")}
                    className={`py-2 rounded-xl text-[9px] uppercase font-bold tracking-wider transition-all flex flex-col items-center gap-1.5 border ${
                      installPlatform === "android"
                        ? "bg-teal-500/10 border-teal-500/30 text-teal-400"
                        : "bg-white/2 border-transparent text-slate-500 hover:text-slate-300"
                    }`}
                    id="platform-android-btn"
                  >
                    <Smartphone className="w-4 h-4 text-green-400" />
                    Android
                  </button>
                  <button
                    onClick={() => setInstallPlatform("ios")}
                    className={`py-2 rounded-xl text-[9px] uppercase font-bold tracking-wider transition-all flex flex-col items-center gap-1.5 border ${
                      installPlatform === "ios"
                        ? "bg-teal-500/10 border-teal-500/30 text-teal-400"
                        : "bg-white/2 border-transparent text-slate-500 hover:text-slate-300"
                    }`}
                    id="platform-ios-btn"
                  >
                    <Smartphone className="w-4 h-4 text-amber-500" />
                    iPhone
                  </button>
                  <button
                    onClick={() => setInstallPlatform("pc")}
                    className={`py-2 rounded-xl text-[9px] uppercase font-bold tracking-wider transition-all flex flex-col items-center gap-1.5 border ${
                      installPlatform === "pc"
                        ? "bg-teal-500/10 border-teal-500/30 text-teal-400"
                        : "bg-white/2 border-transparent text-slate-500 hover:text-slate-300"
                    }`}
                    id="platform-pc-btn"
                  >
                    <Monitor className="w-4 h-4 text-blue-400" />
                    PC / Mac
                  </button>
                </div>

                {/* Direct Prompt Installation (if available) */}
                {showInstallBtn && onInstall && (
                  <motion.div 
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="p-4 bg-teal-500/10 border border-teal-500/20 rounded-2xl text-center space-y-3"
                  >
                    <p className="text-xs text-teal-300 leading-relaxed font-light">
                      Votre navigateur est prêt pour l'installation instantanée en un clic :
                    </p>
                    <button
                      onClick={onInstall}
                      className="w-full py-3 bg-teal-500 text-black font-bold uppercase tracking-widest text-[10px] rounded-xl hover:bg-teal-400 transition-all shadow-[0_0_20px_rgba(20,184,166,0.3)] flex items-center justify-center gap-2"
                      id="direct-install-btn"
                    >
                      <Smartphone className="w-4 h-4" />
                      <span>{qr.installBtn}</span>
                    </button>
                  </motion.div>
                )}

                {/* Custom Step List based on Platform */}
                <div className="bg-black/30 border border-white/5 rounded-2xl p-4 md:p-5 space-y-4 text-left">
                  {installPlatform === "android" && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 pb-2 border-b border-white/10">
                        <div className="w-2 h-2 rounded-full bg-green-400" />
                        <span className="text-[10px] uppercase font-bold tracking-widest text-slate-300">Procédure Android (Chrome, Samsung Internet, Edge)</span>
                      </div>
                      <ol className="text-xs text-slate-300 space-y-2 list-decimal list-inside font-light">
                        <li>Ouvrez l'application dans votre navigateur Chrome.</li>
                        <li>Touchez le menu <strong>(3 petits points ⋮)</strong> en haut à droite.</li>
                        <li>Sélectionnez <strong>« Installer l'application »</strong> ou <strong>« Ajouter à l'écran d'accueil »</strong>.</li>
                        <li>Validez en appuyant sur <strong>Installer</strong>. L'icône AbookScan s'ajoute à vos applications et s'ouvre en plein écran sans bordure de navigateur.</li>
                      </ol>
                    </div>
                  )}

                  {installPlatform === "ios" && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 pb-2 border-b border-white/10">
                        <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                        <span className="text-[10px] uppercase font-bold tracking-widest text-amber-300">Procédure iPhone / iPad (Safari)</span>
                      </div>
                      <ol className="text-xs text-slate-300 space-y-2 list-decimal list-inside font-light">
                        <li>Ouvrez le lien dans le navigateur <strong>Safari</strong>.</li>
                        <li>Touchez le bouton <strong>Partager ⎋</strong> (carré avec la flèche vers le haut en bas de l'écran).</li>
                        <li>Faites défiler vers le bas et touchez <strong>« Sur l'écran d'accueil » (+)</strong>.</li>
                        <li>Touchez <strong>« Ajouter »</strong> en haut à droite. L'application devient une vraie appli mobile autonome !</li>
                      </ol>
                    </div>
                  )}

                  {installPlatform === "pc" && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 pb-2 border-b border-white/10">
                        <div className="w-2 h-2 rounded-full bg-blue-400" />
                        <span className="text-[10px] uppercase font-bold tracking-widest text-slate-300">Procédure PC / Mac (Chrome, Edge, Brave)</span>
                      </div>
                      <ol className="text-xs text-slate-300 space-y-2 list-decimal list-inside font-light">
                        <li>Ouvrez l'application dans Chrome ou Edge.</li>
                        <li>Cliquez sur l'icône <strong>Installer AbookScan (📥)</strong> située à droite dans la barre d'adresse.</li>
                        <li>Cliquez sur <strong>Installer</strong> : l'application s'ouvre immédiatement dans sa propre fenêtre de bureau.</li>
                      </ol>
                    </div>
                  )}
                </div>

                <div className="text-center font-mono text-[8px] text-slate-600 py-2 uppercase tracking-wider flex items-center justify-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-slate-600" />
                  AbookScan IA • PWA Autonome
                </div>
              </div>
            )}

            {/* Tab: TWA & Google Play Console */}
            {activeTab === "twa" && (
              <div className="flex flex-col space-y-5 text-left">
                <div className="text-center space-y-1">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-teal-500/10 border border-teal-500/30 rounded-full text-[9px] text-teal-300 font-bold uppercase tracking-widest mb-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-teal-400" />
                    <span>Trusted Web Activity (TWA) Actif</span>
                  </div>
                  <h2 className="text-xl font-display font-light text-white">Google Play Store & TWA</h2>
                  <p className="text-[10px] uppercase tracking-widest text-slate-400 font-mono">
                    Package Android (.aab / .apk) prêt pour la Google Play Console
                  </p>
                </div>

                {/* Status & Compliance Checklist */}
                <div className="p-4 bg-black/40 border border-white/10 rounded-2xl space-y-2.5">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-teal-400 flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-teal-400" />
                    <span>Conformité Google Play Console validée</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300 font-light">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span>Package ID: <code className="text-teal-300 font-mono text-[10px]">com.abookscan.dello.it</code></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span>AssetLinks: <code className="text-teal-300 font-mono text-[10px]">.well-known</code></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span>Icônes Maskable: 512x512</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span>Service Worker & HTTPS</span>
                    </div>
                  </div>
                </div>

                {/* 1-Click Action Buttons for TWA */}
                <div className="space-y-2.5">
                  <a
                    href={`https://www.pwabuilder.com?url=${encodeURIComponent(url || window.location.origin)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-3.5 px-4 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-black font-bold uppercase tracking-wider text-[10px] rounded-2xl transition-all shadow-[0_0_20px_rgba(20,184,166,0.3)] flex items-center justify-center gap-2"
                  >
                    <PackageCheck className="w-4 h-4 text-black" />
                    <span>Générer le package AAB / APK (PWABuilder)</span>
                    <ExternalLink className="w-3.5 h-3.5 ml-1" />
                  </a>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={downloadTwaManifest}
                      className="py-3 px-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-2xl text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
                    >
                      <FileCode2 className="w-3.5 h-3.5 text-teal-400" />
                      <span>twa-manifest.json</span>
                    </button>
                    <a
                      href="/.well-known/assetlinks.json"
                      target="_blank"
                      rel="noreferrer"
                      className="py-3 px-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-2xl text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Tester AssetLinks</span>
                    </a>
                  </div>
                </div>

                {/* Steps to deploy on Google Play Console */}
                <div className="p-4 bg-black/30 border border-white/5 rounded-2xl space-y-3">
                  <div className="flex items-center gap-2 pb-2 border-b border-white/10">
                    <Terminal className="w-3.5 h-3.5 text-teal-400" />
                    <span className="text-[10px] uppercase font-bold tracking-widest text-slate-300">Étapes pour envoyer chez Google Play Console</span>
                  </div>
                  <ol className="text-xs text-slate-300 space-y-2.5 list-decimal list-inside font-light">
                    <li>
                      <strong>Générer le fichier .AAB</strong> en cliquant sur le bouton <em>Générer le package (PWABuilder)</em> ou via Google Bubblewrap (<code className="text-teal-300 font-mono text-[10px]">npx @bubblewrap/cli build</code>).
                    </li>
                    <li>
                      Connectez-vous à votre compte <strong>Google Play Console</strong> et cliquez sur <strong>Créer une application</strong>.
                    </li>
                    <li>
                      Allez dans l'onglet <strong>Production</strong> ou <strong>Test interne</strong> et téléversez le fichier <code className="text-teal-300 font-mono text-[10px]">app-release.aab</code>.
                    </li>
                    <li>
                      Remplissez la fiche du Play Store (titre, description, captures d'écran) puis soumettez votre application pour examen Google !
                    </li>
                  </ol>
                </div>
              </div>
            )}

            <p className="text-[8px] text-slate-600 text-center font-mono uppercase tracking-[0.2em] pt-2 border-t border-white/5">
              AbookScan IA • Fast & Secure
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

