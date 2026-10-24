import { motion } from "motion/react";
import { Search } from "lucide-react";
import { getTranslations } from "../lib/translations";

interface LoadingOverlayProps {
  selectedLanguage?: string;
}

export default function LoadingOverlay({ selectedLanguage }: LoadingOverlayProps) {
  const t = getTranslations(selectedLanguage);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-zinc-950/90 backdrop-blur-md">
      <div className="relative w-64 h-72 border border-white/5 bg-zinc-900 overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] flex items-center justify-center">
        <motion.div
           className="absolute inset-x-0 w-full bg-teal-500/10"
           initial={{ top: "-100%", height: "20%" }}
           animate={{ top: "100%" }}
           transition={{
             duration: 2.5,
             repeat: Infinity,
             ease: "linear",
           }}
        />
        <motion.div
          className="absolute left-0 right-0 h-[2px] bg-teal-400 shadow-[0_0_20px_rgba(45,212,191,1)] z-10"
          initial={{ top: 0 }}
          animate={{ top: "100%" }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            ease: "linear",
          }}
        />
        <div className="flex flex-col items-center gap-4 text-slate-500">
           <Search className="w-10 h-10 text-teal-500/30 animate-pulse" />
           <div className="text-[7px] font-mono uppercase tracking-[0.4em] opacity-40">
             {t.loading?.scanningBeam || (t.scanner?.autoCropHd ? `${t.scanner.autoCropHd} • IA` : "Faisceau de Scan d'Analyse")}
           </div>
        </div>
      </div>
      <div className="mt-8 flex flex-col items-center gap-3">
        <motion.p
          className="text-white font-display text-lg tracking-tight"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {t.loading?.analyzingManuscript || t.scanner?.processBtn || "Analyse en cours..."}
        </motion.p>
        <div className="flex gap-1.5">
           {[0, 1, 2].map(i => (
             <motion.div 
               key={i}
               initial={{ opacity: 0 }}
               animate={{ opacity: [0, 1, 0] }}
               transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
               className="w-1.5 h-1.5 rounded-full bg-teal-500"
             />
           ))}
        </div>
      </div>
    </div>
  );
}

