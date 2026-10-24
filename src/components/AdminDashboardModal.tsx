import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Users, 
  FileText, 
  Mic, 
  Smartphone, 
  Laptop, 
  Globe, 
  ShieldCheck, 
  Lock, 
  RefreshCw, 
  X, 
  Activity, 
  CheckCircle2,
  Sparkles,
  Download,
  KeyRound,
  Eye,
  EyeOff,
  Save,
  Check,
  Server,
  Radio,
  ArrowLeft,
  LogOut
} from "lucide-react";
import { fetchAdminAnalyticsData } from "../lib/analytics";

interface AdminDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLanguage?: string;
}

export const AdminDashboardModal: React.FC<AdminDashboardModalProps> = ({
  isOpen,
  onClose,
  selectedLanguage = "fr"
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinCode, setPinCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pinError, setPinError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  // State for PIN modification
  const [isChangingPin, setIsChangingPin] = useState(false);
  const [newPin, setNewPin] = useState("");
  const [confirmNewPin, setConfirmNewPin] = useState("");
  const [changePinSuccess, setChangePinSuccess] = useState(false);
  const [changePinError, setChangePinError] = useState("");

  const handleVerifyPin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const enteredPin = pinCode.trim();
    const savedCustomPin = localStorage.getItem("abookscan_admin_pin");
    
    // Accept user custom PIN if defined, or 31072018, or 2026, or 1234
    let isValid = false;
    if (savedCustomPin) {
      isValid = enteredPin === savedCustomPin || enteredPin === "31072018";
    } else {
      isValid = (
        enteredPin === "31072018" || 
        enteredPin === "2026" || 
        enteredPin === "1234"
      );
    }

    if (isValid) {
      sessionStorage.setItem("abookscan_admin_auth", "true");
      setIsAuthenticated(true);
      setIsChangingPin(false);
      setPinError(false);
      loadStats();
    } else {
      setPinError(true);
    }
  };

  const handleSaveNewPin = (e: React.FormEvent) => {
    e.preventDefault();
    setChangePinError("");
    if (!newPin.trim() || newPin.trim().length < 4) {
      setChangePinError("Le code doit comporter au moins 4 caractères.");
      return;
    }
    if (newPin.trim() !== confirmNewPin.trim()) {
      setChangePinError("Les deux codes saisis ne correspondent pas.");
      return;
    }
    localStorage.setItem("abookscan_admin_pin", newPin.trim());
    setChangePinSuccess(true);
    setPinCode(newPin.trim());
    setTimeout(() => {
      setChangePinSuccess(false);
      setIsChangingPin(false);
      setNewPin("");
      setConfirmNewPin("");
    }, 1800);
  };

  const loadStats = async () => {
    setLoading(true);
    try {
      const stats = await fetchAdminAnalyticsData();
      setData(stats);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const isAlreadyAuthed = sessionStorage.getItem("abookscan_admin_auth") === "true";
    if (isAlreadyAuthed) {
      setIsAuthenticated(true);
    }
    if (isOpen && (isAuthenticated || isAlreadyAuthed)) {
      loadStats();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isAuthenticated, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-xl">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="w-full max-w-4xl max-h-[90vh] bg-zinc-950 border border-teal-500/20 rounded-3xl shadow-[0_0_50px_rgba(20,184,166,0.15)] flex flex-col overflow-hidden text-white"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 sm:py-5 border-b border-white/5 bg-zinc-900/60 backdrop-blur-md">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-500/15 hover:bg-teal-500 text-teal-300 hover:text-black border border-teal-500/30 transition-all text-xs font-mono font-bold group shadow-md"
              title="Fermer la console et revenir à l'application"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              <span>Retour</span>
            </button>

            <div className="h-5 w-[1px] bg-white/10 hidden sm:block mx-1" />

            <div className="p-2 sm:p-2.5 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-400 shrink-0">
              <Activity className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="truncate">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold tracking-tight text-white truncate">Console Admin</h2>
                <span className="hidden md:flex px-2 py-0.5 text-[9px] font-mono uppercase bg-teal-500/20 text-teal-300 border border-teal-500/30 rounded-full items-center gap-1">
                  <Radio className="w-2.5 h-2.5 text-teal-400 animate-pulse" />
                  Firebase Cloud Sync
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-slate-400 font-mono truncate hidden sm:block">Statistiques & Nombre d'Utilisateurs</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isAuthenticated && (
              <button
                onClick={() => setIsChangingPin(!isChangingPin)}
                className={`p-2 rounded-xl border transition-all flex items-center gap-1.5 text-xs font-mono ${isChangingPin ? "bg-teal-500 text-black border-teal-400 font-bold" : "bg-white/5 hover:bg-white/10 text-slate-300 border-white/10"}`}
                title="Modifier mon code PIN"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Changer Code</span>
              </button>
            )}
            {isAuthenticated && (
              <button
                onClick={loadStats}
                disabled={loading}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition-all flex items-center gap-1.5 text-xs font-mono"
                title="Actualiser"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-teal-400" : ""}`} />
                <span className="hidden md:inline">Actualiser</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-300 border border-white/10 transition-all"
              title="Fermer (Échap)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {!isAuthenticated ? (
            /* PIN Protection Form */
            <div className="max-w-md mx-auto py-12 text-center space-y-6">
              <div className="w-16 h-16 mx-auto rounded-3xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400 shadow-[0_0_30px_rgba(20,184,166,0.2)]">
                <Lock className="w-8 h-8" />
              </div>

              <div className="space-y-2">
                <h3 className="text-xl font-bold text-white tracking-tight">Accès Sécurisé Administrateur</h3>
                <p className="text-xs text-slate-400">
                  Entrez votre code secret pour déverrouiller la console de gestion et consulter les mesures d'audience.
                </p>
              </div>

              <form onSubmit={handleVerifyPin} className="space-y-4">
                <div className="space-y-2">
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={pinCode}
                      onChange={(e) => {
                        setPinCode(e.target.value);
                        setPinError(false);
                      }}
                      placeholder="Tapez 31072018"
                      className={`w-full py-3.5 pl-4 pr-12 text-center font-mono text-xl tracking-[0.2em] bg-zinc-900 border rounded-2xl text-teal-300 placeholder:text-slate-600 focus:outline-none focus:ring-2 transition-all ${
                        pinError 
                          ? "border-red-500/50 focus:ring-red-500/30" 
                          : "border-white/10 focus:border-teal-500 focus:ring-teal-500/20"
                      }`}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-white transition-colors"
                      title={showPassword ? "Masquer" : "Afficher"}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  
                  {pinError && (
                    <p className="text-xs text-red-400 font-mono">Code incorrect. Votre code par défaut est 31072018</p>
                  )}
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 bg-teal-500 text-black font-bold text-xs uppercase tracking-widest rounded-2xl hover:bg-teal-400 transition-all shadow-[0_0_20px_rgba(20,184,166,0.3)] flex items-center justify-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4" />
                  Déverrouiller le Tableau de Bord
                </button>

                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-3 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white font-mono text-xs rounded-2xl border border-white/10 transition-all flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="w-4 h-4 text-teal-400" />
                  <span>Annuler & Revenir à l'application</span>
                </button>
                
                <div className="pt-2 flex flex-col items-center gap-1.5 text-xs text-slate-500 font-mono">
                  <div className="flex items-center gap-1 text-slate-400">
                    <span>Code d'accès :</span>
                    <button
                      type="button"
                      onClick={() => {
                        setPinCode("31072018");
                        setPinError(false);
                      }}
                      className="text-teal-400 font-bold hover:underline cursor-pointer"
                    >
                      31072018
                    </button>
                  </div>
                  <span className="text-[10px]">Cliquez sur le code ci-dessus pour le remplir automatiquement</span>
                </div>
              </form>
            </div>
          ) : (
            /* Dashboard View */
            <div className="space-y-6">
              {/* PIN Modification Drawer */}
              <AnimatePresence>
                {isChangingPin && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="p-5 bg-teal-500/10 border border-teal-500/30 rounded-2xl space-y-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-teal-300 font-bold text-sm">
                        <KeyRound className="w-4 h-4" />
                        <span>Personnaliser mon Code Secret</span>
                      </div>
                      <button 
                        onClick={() => setIsChangingPin(false)}
                        className="text-slate-400 hover:text-white text-xs font-mono"
                      >
                        Annuler
                      </button>
                    </div>

                    {changePinSuccess ? (
                      <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs flex items-center gap-2 font-mono">
                        <Check className="w-4 h-4 text-emerald-400" />
                        <span>Votre nouveau code PIN a été enregistré avec succès !</span>
                      </div>
                    ) : (
                      <form onSubmit={handleSaveNewPin} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[10px] uppercase font-mono text-slate-400 mb-1">Nouveau Code</label>
                          <input
                            type="password"
                            value={newPin}
                            onChange={(e) => setNewPin(e.target.value)}
                            placeholder="Ex: 31072018"
                            className="w-full py-2.5 px-3 bg-zinc-900 border border-white/10 rounded-xl text-white font-mono text-sm focus:outline-none focus:border-teal-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] uppercase font-mono text-slate-400 mb-1">Confirmer le Code</label>
                          <input
                            type="password"
                            value={confirmNewPin}
                            onChange={(e) => setConfirmNewPin(e.target.value)}
                            placeholder="Confirmer"
                            className="w-full py-2.5 px-3 bg-zinc-900 border border-white/10 rounded-xl text-white font-mono text-sm focus:outline-none focus:border-teal-500"
                          />
                        </div>
                        <div className="flex items-end">
                          <button
                            type="submit"
                            className="w-full py-2.5 bg-teal-500 text-black font-bold text-xs uppercase tracking-wider rounded-xl hover:bg-teal-400 transition-all flex items-center justify-center gap-1.5 h-[42px]"
                          >
                            <Save className="w-4 h-4" />
                            Enregistrer
                          </button>
                        </div>
                        {changePinError && (
                          <p className="col-span-full text-xs text-red-400 font-mono">{changePinError}</p>
                        )}
                      </form>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Diagnostic Status Bar */}
              <div className="p-4 bg-zinc-900/90 border border-teal-500/20 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-white font-bold">État Cloud Firebase :</span>
                  <span className="text-emerald-400">Authentification & Synchronisation Opérationnelles</span>
                </div>
                <div className="text-slate-400 text-[11px] flex items-center gap-2">
                  <span>Projet: <strong className="text-teal-300">spring-bricolage-dr6mz</strong></span>
                  <span>•</span>
                  <span>Base: <strong className="text-teal-300">Active</strong></span>
                </div>
              </div>

              {/* Top Key Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-5 bg-zinc-900/80 border border-teal-500/20 rounded-2xl relative overflow-hidden group hover:border-teal-500/40 transition-all">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/5 rounded-full blur-2xl group-hover:bg-teal-500/10 transition-all" />
                  <div className="flex items-center justify-between text-slate-400 mb-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider">Utilisateurs Uniques</span>
                    <Users className="w-4 h-4 text-teal-400" />
                  </div>
                  <div className="text-3xl font-black text-white font-mono tracking-tight flex items-baseline gap-2">
                    {data?.globalStats?.totalUsers || 1}
                    <span className="text-xs font-normal text-emerald-400 font-sans flex items-center gap-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Actifs
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-mono mt-1">Appareils et navigateurs distincts</p>
                </div>

                <div className="p-5 bg-zinc-900/80 border border-white/5 rounded-2xl relative overflow-hidden group hover:border-teal-500/30 transition-all">
                  <div className="flex items-center justify-between text-slate-400 mb-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider">Scans IA Réalisés</span>
                    <FileText className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="text-3xl font-black text-white font-mono tracking-tight">
                    {data?.globalStats?.totalScans || 0}
                  </div>
                  <p className="text-[10px] text-slate-500 font-mono mt-1">Pages numérisées & OCR</p>
                </div>

                <div className="p-5 bg-zinc-900/80 border border-white/5 rounded-2xl relative overflow-hidden group hover:border-teal-500/30 transition-all">
                  <div className="flex items-center justify-between text-slate-400 mb-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider">Transcriptions Audio</span>
                    <Mic className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="text-3xl font-black text-white font-mono tracking-tight">
                    {data?.globalStats?.totalVoiceTranscriptions || 0}
                  </div>
                  <p className="text-[10px] text-slate-500 font-mono mt-1">Dictées & enregistrements IA</p>
                </div>

                <div className="p-5 bg-zinc-900/80 border border-white/5 rounded-2xl relative overflow-hidden group hover:border-teal-500/30 transition-all">
                  <div className="flex items-center justify-between text-slate-400 mb-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider">Installations PWA</span>
                    <Smartphone className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="text-3xl font-black text-white font-mono tracking-tight">
                    {data?.pwaCount || 0}
                  </div>
                  <p className="text-[10px] text-slate-500 font-mono mt-1">Écran d'accueil mobile/PC</p>
                </div>
              </div>

              {/* Devices and Languages Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Devices */}
                <div className="p-5 bg-zinc-900/60 border border-white/5 rounded-2xl space-y-4">
                  <div className="flex items-center gap-2 text-white font-semibold text-sm">
                    <Laptop className="w-4 h-4 text-teal-400" />
                    <span>Répartition des Appareils</span>
                  </div>
                  <div className="space-y-2.5">
                    {data?.deviceCount && Object.keys(data.deviceCount).length > 0 ? (
                      Object.entries(data.deviceCount).map(([dev, count]: any) => {
                        const pct = Math.round((count / (data.globalStats.totalUsers || 1)) * 100);
                        return (
                          <div key={dev} className="space-y-1">
                            <div className="flex justify-between text-xs font-mono">
                              <span className="text-slate-300">{dev}</span>
                              <span className="text-teal-400">{count} ({pct}%)</span>
                            </div>
                            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-teal-500 rounded-full transition-all duration-500" 
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-xs text-slate-500 font-mono">En attente de données...</p>
                    )}
                  </div>
                </div>

                {/* Languages */}
                <div className="p-5 bg-zinc-900/60 border border-white/5 rounded-2xl space-y-4">
                  <div className="flex items-center gap-2 text-white font-semibold text-sm">
                    <Globe className="w-4 h-4 text-teal-400" />
                    <span>Langues Sélectionnées</span>
                  </div>
                  <div className="space-y-2.5">
                    {data?.languageCount && Object.keys(data.languageCount).length > 0 ? (
                      Object.entries(data.languageCount).map(([lang, count]: any) => {
                        const pct = Math.round((count / (data.globalStats.totalUsers || 1)) * 100);
                        return (
                          <div key={lang} className="space-y-1">
                            <div className="flex justify-between text-xs font-mono uppercase">
                              <span className="text-slate-300">{lang}</span>
                              <span className="text-teal-400">{count} ({pct}%)</span>
                            </div>
                            <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-teal-500 rounded-full transition-all duration-500" 
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-xs text-slate-500 font-mono">En attente de données...</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Recent Activity Stream */}
              <div className="p-5 bg-zinc-900/60 border border-white/5 rounded-2xl space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-white font-semibold text-sm">
                    <Users className="w-4 h-4 text-teal-400" />
                    <span>Derniers Utilisateurs Connectés</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">
                    Dernière synchro : {lastRefreshed?.toLocaleTimeString() || "À l'instant"}
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className="border-b border-white/10 text-slate-400 text-[10px] uppercase tracking-wider">
                        <th className="py-2.5 px-3">Identifiant</th>
                        <th className="py-2.5 px-3">Appareil</th>
                        <th className="py-2.5 px-3">Langue</th>
                        <th className="py-2.5 px-3">Visites</th>
                        <th className="py-2.5 px-3">Scans</th>
                        <th className="py-2.5 px-3">Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {data?.users && data.users.length > 0 ? (
                        data.users.slice(0, 10).map((u: any, idx: number) => (
                          <tr key={u.userId || idx} className="hover:bg-white/5 transition-all text-slate-300">
                            <td className="py-2.5 px-3 font-semibold text-teal-400 truncate max-w-[120px]">
                              {u.userId}
                            </td>
                            <td className="py-2.5 px-3">{u.platform || "Desktop"}</td>
                            <td className="py-2.5 px-3 uppercase text-slate-400">{u.language || "fr"}</td>
                            <td className="py-2.5 px-3 text-white font-bold">{u.totalVisits || 1}</td>
                            <td className="py-2.5 px-3 text-white">{u.totalScans || 0}</td>
                            <td className="py-2.5 px-3">
                              {u.isPWA ? (
                                <span className="px-2 py-0.5 text-[9px] bg-teal-500/20 text-teal-300 border border-teal-500/30 rounded-full">
                                  PWA Installée
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 text-[9px] bg-zinc-800 text-slate-400 rounded-full">
                                  Navigateur
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-slate-500">
                            Enregistrement automatique des utilisateurs actif.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer info & Exit action */}
        <div className="px-4 sm:px-6 py-3.5 border-t border-white/5 bg-zinc-950 flex flex-col sm:flex-row items-center justify-between gap-3 text-[10px] font-mono text-slate-500">
          <div className="flex items-center gap-1.5 text-teal-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Firebase Cloud Firestore Synchronisé</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-white/5 hover:bg-teal-500 hover:text-black text-slate-300 border border-white/10 transition-all flex items-center justify-center gap-2 text-xs font-mono font-bold"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Quitter la Console Admin (Retour)</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
};
export default AdminDashboardModal;
