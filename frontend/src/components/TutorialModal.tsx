import { useState } from "react";
import { useTranslation } from "../i18n";

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SLIDE_COLORS = [
  "from-blue-600 to-blue-800",
  "from-emerald-400 to-teal-500",
  "from-blue-500 to-blue-700",
  "from-orange-400 to-red-500",
];

export default function TutorialModal({ isOpen, onClose }: TutorialModalProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const { t } = useTranslation();

  if (!isOpen) return null;

  const slides = t.tutorial.slides.map((s, idx) => ({
    ...s,
    color: SLIDE_COLORS[idx] || "from-blue-500 to-blue-700",
  }));

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setCurrentSlide(prev => prev + 1);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentSlide > 0) {
      setCurrentSlide(prev => prev - 1);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-scale-in">
        
        {/* Header with Close */}
        <div className="p-4 flex justify-between items-center border-b border-slate-100 dark:border-white/5">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            {t.brand.name} • {currentSlide + 1} / {slides.length}
          </span>
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Slide Content */}
        <div className="p-6 sm:p-8 flex-1 flex flex-col items-center text-center">
          
          {slides.map((slide, i) => (
            <div 
              key={i} 
              className={`flex-col items-center transition-all duration-300 ${i === currentSlide ? 'flex' : 'hidden'}`}
            >
              {/* Icon Container with glowing background */}
              <div className="relative mb-6">
                <div className={`absolute inset-0 rounded-3xl bg-gradient-to-tr ${slide.color} blur-xl opacity-40 animate-pulse`} />
                <div className={`relative w-20 h-20 rounded-3xl bg-gradient-to-tr ${slide.color} flex items-center justify-center text-4xl shadow-xl`}>
                  {slide.icon}
                </div>
              </div>

              <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">
                {slide.title}
              </h3>
              
              <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed max-w-sm">
                {slide.description}
              </p>
            </div>
          ))}

        </div>

        {/* Footer Controls */}
        <div className="p-4 sm:p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-white/5 flex items-center justify-between">
          <button 
            onClick={handlePrev}
            className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors ${
              currentSlide === 0 
                ? 'text-slate-300 dark:text-slate-600 cursor-not-allowed' 
                : 'text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-white/10'
            }`}
            disabled={currentSlide === 0}
          >
            {t.tutorial.back}
          </button>
          
          <div className="flex gap-2">
            {slides.map((_, i) => (
              <div 
                key={i} 
                className={`w-2 h-2 rounded-full transition-all duration-300 ${i === currentSlide ? 'bg-blue-500 w-4' : 'bg-slate-300 dark:bg-slate-600'}`}
              />
            ))}
          </div>

          <button 
            onClick={handleNext}
            className="px-5 py-2 text-sm font-medium bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 text-white rounded-xl transition-all shadow-md active:scale-95"
          >
            {currentSlide === slides.length - 1 ? t.tutorial.getStarted : t.tutorial.next}
          </button>
        </div>
      </div>
    </div>
  );
}
