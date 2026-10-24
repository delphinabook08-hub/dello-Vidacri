import { motion, AnimatePresence } from "motion/react";
import { Globe, Check, Sparkles } from "lucide-react";
import { useState } from "react";
import { getTranslations } from "../lib/translations";

interface LanguageSelectionModalProps {
  isOpen: boolean;
  onSelectLanguage: (langCode: string) => void;
  languages: { code: string; label: string }[];
  selectedLanguage?: string;
  currentLanguage?: string;
}

export default function LanguageSelectionModal({
  isOpen,
  onSelectLanguage,
  languages,
  selectedLanguage,
  currentLanguage,
}: LanguageSelectionModalProps) {
  const [tempLang, setTempLang] = useState(selectedLanguage || currentLanguage || "French");

  const t = getTranslations(tempLang);

  const handleConfirm = () => {
    onSelectLanguage(tempLang);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-zinc-950/95 backdrop-blur-2xl"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="w-full max-w-lg bg-zinc-900 border border-teal-500/30 rounded-[2.5rem] overflow-hidden shadow-2xl relative flex flex-col max-h-[90vh]"
          >
            {/* Header */}
            <div className="p-6 border-b border-white/10 bg-white/5 text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-teal-500/20 border border-teal-500/40 text-teal-400 flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(20,184,166,0.3)]">
                <Globe className="w-6 h-6 animate-spin-slow" />
              </div>
              <h2 className="text-2xl font-display font-light text-white tracking-tight">
                {t.firstTime.welcome}
              </h2>
              <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                {t.firstTime.subtitle}
              </p>
            </div>

            {/* Language Options Grid */}
            <div className="p-6 overflow-y-auto space-y-2.5 max-h-[50vh] custom-scrollbar">
              <label className="text-[10px] font-mono uppercase tracking-[0.2em] text-teal-400 font-bold block mb-3 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> {t.firstTime.title}
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {languages.map((lang) => {
                  const isSelected = tempLang === lang.code;
                  return (
                    <button
                      key={lang.code}
                      onClick={() => setTempLang(lang.code)}
                      className={`p-3.5 rounded-2xl border text-xs font-semibold text-left transition-all flex items-center justify-between gap-2 group ${
                        isSelected
                          ? "bg-teal-500/20 border-teal-500 text-teal-300 font-bold shadow-md shadow-teal-500/10"
                          : "bg-white/5 border-white/5 text-slate-300 hover:bg-white/10 hover:border-white/20"
                      }`}
                    >
                      <span className="truncate">{lang.label}</span>
                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-teal-500 text-black flex items-center justify-center shrink-0">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Footer / Confirm Action */}
            <div className="p-6 border-t border-white/10 bg-black/40 space-y-3 text-center">
              <button
                onClick={handleConfirm}
                className="w-full py-4 bg-teal-500 text-black font-bold rounded-2xl shadow-[0_0_30px_rgba(20,184,166,0.3)] hover:bg-teal-400 transition-all text-xs font-mono uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>{t.firstTime.confirm}</span>
              </button>
              <p className="text-[9px] text-slate-500 font-mono italic">
                {t.firstTime.changeLater}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
