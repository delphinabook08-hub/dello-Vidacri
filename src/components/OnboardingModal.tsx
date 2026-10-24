import { motion, AnimatePresence } from "motion/react";
import { X, Camera, Upload, Settings, FileText, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { getTranslations } from "../lib/translations";

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLanguage?: string;
}

export default function OnboardingModal({ isOpen, onClose, selectedLanguage }: OnboardingModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const t = getTranslations(selectedLanguage || "French");
  const onb = t.onboarding;

  const STEPS = [
    {
      title: onb.step1Title,
      description: onb.step1Desc,
      icon: <Camera className="w-8 h-8" />,
      color: "text-teal-400"
    },
    {
      title: onb.step2Title,
      description: onb.step2Desc,
      icon: <Upload className="w-8 h-8" />,
      color: "text-white"
    },
    {
      title: onb.step3Title,
      description: onb.step3Desc,
      icon: <Settings className="w-8 h-8" />,
      color: "text-slate-400"
    },
    {
      title: onb.step4Title,
      description: onb.step4Desc,
      icon: <FileText className="w-8 h-8" />,
      color: "text-teal-500"
    }
  ];

  const nextStep = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-zinc-950/98 backdrop-blur-3xl"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 30 }}
            className="w-full max-w-xl bg-zinc-900 border border-white/5 rounded-[4rem] overflow-hidden shadow-2xl relative tech-grid"
          >
            <div className="absolute top-0 right-0 p-8">
              <button 
                onClick={onClose}
                className="p-3 rounded-full bg-white/5 text-slate-500 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-12 space-y-12">
              <div className="space-y-4 text-center">
                <div className="flex justify-center items-center gap-3">
                   <img 
                     src="/icon.png" 
                     alt="AbookScan Icon" 
                     className="w-10 h-10 rounded-2xl object-cover shadow-[0_0_20px_rgba(20,184,166,0.5)] border border-teal-500/30"
                     referrerPolicy="no-referrer"
                   />
                   <div className="w-16 h-1 bg-teal-500/20 rounded-full flex overflow-hidden">
                      <motion.div 
                        className="bg-teal-500 h-full"
                        animate={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
                      />
                   </div>
                </div>
                <h2 className="text-4xl font-display font-light text-white tracking-tight">{onb.welcome} <span className="text-teal-500">AbookScan IA</span></h2>
                <p className="text-[10px] uppercase tracking-[0.4em] text-slate-500 font-mono">{onb.guide}</p>
              </div>

              <div className="min-h-[220px] flex flex-col items-center text-center space-y-6">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`p-8 rounded-[2.5rem] bg-zinc-950 border border-white/5 ${STEPS[currentStep].color} shadow-2xl`}
                >
                  {STEPS[currentStep].icon}
                </motion.div>
                <div className="space-y-3">
                  <h3 className="text-xl font-display text-white">{STEPS[currentStep].title}</h3>
                  <p className="text-slate-400 leading-relaxed max-w-sm mx-auto italic">{STEPS[currentStep].description}</p>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <button
                  onClick={nextStep}
                  className="w-full py-5 bg-teal-500 text-black font-bold rounded-[2rem] shadow-[0_0_30px_rgba(20,184,166,0.3)] hover:bg-teal-400 transition-all flex items-center justify-center gap-2 group"
                >
                  <span className="uppercase tracking-widest text-xs">
                    {currentStep === STEPS.length - 1 ? onb.startNow : onb.nextStep}
                  </span>
                  <CheckCircle2 className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
                
                <div className="flex justify-center gap-2">
                  {STEPS.map((_, idx) => (
                    <div 
                      key={idx}
                      className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${
                        idx === currentStep ? "bg-teal-500 w-6" : "bg-white/10"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6 bg-black/40 text-center border-t border-white/5">
               <p className="text-[9px] font-mono text-slate-600 uppercase tracking-widest">AbookScan Systems • AI Powered</p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
