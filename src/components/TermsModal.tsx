import { motion, AnimatePresence } from "motion/react";
import { X, ShieldCheck, FileText, Scale, Mic, Lock, Cpu, Sparkles, Languages, Eye, RefreshCw } from "lucide-react";
import { getTranslations } from "../lib/translations";

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme?: "dark" | "light";
  selectedLanguage?: string;
}

export default function TermsModal({ isOpen, onClose, theme = "dark", selectedLanguage }: TermsModalProps) {
  const isLight = theme === "light";
  const t = getTranslations(selectedLanguage);
  const terms = t.terms;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-zinc-950/85 backdrop-blur-2xl"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 30 }}
            className={`w-full max-w-3xl rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col max-h-[88vh] border transition-colors duration-200 ${
              isLight
                ? "bg-white border-slate-200 text-slate-900"
                : "bg-zinc-900 border-white/10 text-white"
            }`}
          >
            {/* Header */}
            <div className={`p-6 sm:p-8 border-b flex items-center justify-between ${
              isLight ? "bg-slate-50 border-slate-200" : "bg-white/5 border-white/10"
            }`}>
              <div className="flex items-center gap-3.5">
                <div className="p-3 bg-teal-500/20 rounded-2xl text-teal-500 border border-teal-500/30">
                  <Scale className="w-6 h-6" />
                </div>
                <div>
                  <h2 className={`text-xl sm:text-2xl font-display font-semibold flex items-center gap-2 ${
                    isLight ? "text-slate-900" : "text-white"
                  }`}>
                    {terms.title}
                    <span className="px-2.5 py-0.5 text-[10px] font-mono font-bold bg-teal-500/20 text-teal-600 dark:text-teal-300 border border-teal-500/30 rounded-full">
                      v2.6
                    </span>
                  </h2>
                  <p className={`text-[10px] uppercase tracking-widest font-mono mt-0.5 ${
                    isLight ? "text-slate-500" : "text-slate-400"
                  }`}>
                    {terms.subtitle}
                  </p>
                </div>
              </div>
              <button 
                onClick={onClose} 
                className={`p-2.5 rounded-full transition-colors ${
                  isLight ? "hover:bg-slate-200 text-slate-600" : "hover:bg-white/10 text-slate-400 hover:text-white"
                }`}
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-8 no-scrollbar">
              
              {/* Feature update banner */}
              <div className={`p-4 rounded-2xl border flex items-start gap-3 ${
                isLight
                  ? "bg-teal-50/80 border-teal-200 text-teal-950"
                  : "bg-gradient-to-r from-teal-950/60 via-slate-900 to-indigo-950/60 border-teal-500/30"
              }`}>
                <Sparkles className="w-5 h-5 text-teal-500 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className={`font-bold ${isLight ? "text-teal-900" : "text-white"}`}>
                    {terms.whatsNewTitle}
                  </p>
                  <p className={`${isLight ? "text-slate-700" : "text-slate-300"} leading-relaxed`}>
                    {terms.whatsNewDesc}
                  </p>
                </div>
              </div>

              {/* Section 1 */}
              <section className="space-y-3">
                <div className="flex items-center gap-2.5 text-teal-500 font-semibold">
                  <ShieldCheck className="w-5 h-5" />
                  <h3 className={`text-xs uppercase font-bold tracking-widest ${isLight ? "text-slate-900" : "text-white"}`}>
                    {terms.sec1Title}
                  </h3>
                </div>
                <div className={`text-xs sm:text-sm leading-relaxed space-y-2 pl-7 border-l-2 border-teal-500/30 ${
                  isLight ? "text-slate-700" : "text-slate-300"
                }`}>
                  <p>{terms.sec1Desc1}</p>
                  <p>{terms.sec1Desc2}</p>
                </div>
              </section>

              {/* Section 2 */}
              <section className="space-y-3">
                <div className="flex items-center gap-2.5 text-indigo-500 font-semibold">
                  <Languages className="w-5 h-5" />
                  <h3 className={`text-xs uppercase font-bold tracking-widest ${isLight ? "text-slate-900" : "text-white"}`}>
                    {terms.sec2Title}
                  </h3>
                </div>
                <div className={`text-xs sm:text-sm leading-relaxed space-y-2 pl-7 border-l-2 border-indigo-500/30 ${
                  isLight ? "text-slate-700" : "text-slate-300"
                }`}>
                  <p>{terms.sec2Desc1}</p>
                  <p>{terms.sec2Desc2}</p>
                </div>
              </section>

              {/* Section 3 */}
              <section className="space-y-3">
                <div className="flex items-center gap-2.5 text-sky-500 font-semibold">
                  <Mic className="w-5 h-5" />
                  <h3 className={`text-xs uppercase font-bold tracking-widest ${isLight ? "text-slate-900" : "text-white"}`}>
                    {terms.sec3Title}
                  </h3>
                </div>
                <div className={`text-xs sm:text-sm leading-relaxed space-y-2 pl-7 border-l-2 border-sky-500/30 ${
                  isLight ? "text-slate-700" : "text-slate-300"
                }`}>
                  <p>{terms.sec3Desc1}</p>
                  <p>{terms.sec3Desc2}</p>
                </div>
              </section>

              {/* Section 4 */}
              <section className="space-y-3">
                <div className="flex items-center gap-2.5 text-amber-500 font-semibold">
                  <Eye className="w-5 h-5" />
                  <h3 className={`text-xs uppercase font-bold tracking-widest ${isLight ? "text-slate-900" : "text-white"}`}>
                    {terms.sec4Title}
                  </h3>
                </div>
                <div className={`text-xs sm:text-sm leading-relaxed space-y-2 pl-7 border-l-2 border-amber-500/30 ${
                  isLight ? "text-slate-700" : "text-slate-300"
                }`}>
                  <p>{terms.sec4Desc1}</p>
                  <p>{terms.sec4Desc2}</p>
                </div>
              </section>

              {/* Section 5 */}
              <section className="space-y-3">
                <div className="flex items-center gap-2.5 text-emerald-500 font-semibold">
                  <FileText className="w-5 h-5" />
                  <h3 className={`text-xs uppercase font-bold tracking-widest ${isLight ? "text-slate-900" : "text-white"}`}>
                    {terms.sec5Title}
                  </h3>
                </div>
                <div className={`text-xs sm:text-sm leading-relaxed space-y-2 pl-7 border-l-2 border-emerald-500/30 ${
                  isLight ? "text-slate-700" : "text-slate-300"
                }`}>
                  <p>{terms.sec5Desc1}</p>
                  <p>{terms.sec5Desc2}</p>
                </div>
              </section>

              {/* Section 6 */}
              <section className="space-y-3">
                <div className="flex items-center gap-2.5 text-violet-500 font-semibold">
                  <Cpu className="w-5 h-5" />
                  <h3 className={`text-xs uppercase font-bold tracking-widest ${isLight ? "text-slate-900" : "text-white"}`}>
                    {terms.sec6Title}
                  </h3>
                </div>
                <div className={`text-xs sm:text-sm leading-relaxed space-y-2 pl-7 border-l-2 border-violet-500/30 ${
                  isLight ? "text-slate-700" : "text-slate-300"
                }`}>
                  <p>{terms.sec6Desc1}</p>
                </div>
              </section>

              {/* Section 7 - Continuous Deployment & Updates */}
              <section className="space-y-3">
                <div className="flex items-center gap-2.5 text-teal-400 font-semibold">
                  <RefreshCw className="w-5 h-5" />
                  <h3 className={`text-xs uppercase font-bold tracking-widest ${isLight ? "text-slate-900" : "text-white"}`}>
                    {terms.sec7Title || "7. Mises à Jour Logicielles & Déploiement Continu"}
                  </h3>
                </div>
                <div className={`text-xs sm:text-sm leading-relaxed space-y-2 pl-7 border-l-2 border-teal-500/30 ${
                  isLight ? "text-slate-700" : "text-slate-300"
                }`}>
                  <p>{terms.sec7Desc1 || "Pour garantir la sécurité des échanges, la compatibilité des modèles d'IA et la stabilité de l'application, des mises à jour obligatoires sont régulièrement déployées via Netlify."}</p>
                  <p>{terms.sec7Desc2 || "L'application vérifie automatiquement l'existence d'une nouvelle version et peut exiger le rechargement immédiat des fichiers mis à jour afin d'assurer l'intégrité de vos traitements."}</p>
                </div>
              </section>

              {/* Support Banner */}
              <section className={`p-5 rounded-2xl border space-y-2 ${
                isLight ? "bg-slate-100 border-slate-200" : "bg-zinc-950 border-white/10"
              }`}>
                <h4 className="text-[11px] uppercase font-bold text-teal-500 tracking-wider flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5" />
                  <span>{terms.supportTitle}</span>
                </h4>
                <p className={`text-xs leading-relaxed ${isLight ? "text-slate-600" : "text-slate-400"}`}>
                  {terms.supportDesc}{" "}
                  <a href="mailto:supportabookscan@gmail.com" className="text-teal-500 font-semibold hover:underline">
                    supportabookscan@gmail.com
                  </a>{" "}
                  •{" "}
                  <a href="tel:+243811339303" className="text-teal-500 font-semibold hover:underline">
                    +243 811 339 303
                  </a>
                </p>
              </section>
            </div>

            {/* Footer */}
            <div className={`p-6 border-t flex flex-col sm:flex-row items-center justify-between gap-4 ${
              isLight ? "bg-slate-100 border-slate-200" : "bg-black/60 border-white/10"
            }`}>
              <p className={`text-[10px] font-mono uppercase tracking-widest text-center sm:text-left ${
                isLight ? "text-slate-500 font-medium" : "text-slate-500"
              }`}>
                {terms.footerText}
              </p>
              <button 
                onClick={onClose}
                className="w-full sm:w-auto px-8 py-3 bg-teal-500 hover:bg-teal-400 text-black text-xs uppercase font-bold tracking-widest rounded-full transition-all shadow-lg shadow-teal-500/20 cursor-pointer"
              >
                {terms.acceptBtn}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}


