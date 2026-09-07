import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "../i18n";
import { SLIDE_VISUALS, SLIDE_VISUALS_BY_ID } from "./tutorial/TutorialVisuals";

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TutorialModal({ isOpen, onClose }: TutorialModalProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const { t, language, isRTL } = useTranslation();

  // Reset to first slide whenever the modal is opened
  useEffect(() => {
    if (isOpen) {
      setCurrentSlide(0);
    }
  }, [isOpen]);

  const slides = t.tutorial.slides || [];
  const totalSlides = slides.length;
  const slide = slides[currentSlide] || slides[0];

  const handleNext = useCallback(() => {
    if (currentSlide < totalSlides - 1) {
      setCurrentSlide((prev) => prev + 1);
    } else {
      onClose();
    }
  }, [currentSlide, totalSlides, onClose]);

  const handlePrev = useCallback(() => {
    if (currentSlide > 0) {
      setCurrentSlide((prev) => prev - 1);
    }
  }, [currentSlide]);

  // Keyboard navigation (Left / Right arrows & Escape)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowRight") {
        if (isRTL) handlePrev();
        else handleNext();
      } else if (e.key === "ArrowLeft") {
        if (isRTL) handleNext();
        else handlePrev();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isRTL, handleNext, handlePrev, onClose]);

  if (!isOpen || !slide) return null;

  const VisualComponent =
    (slide.id && SLIDE_VISUALS_BY_ID[slide.id]) ||
    SLIDE_VISUALS[currentSlide] ||
    SLIDE_VISUALS[0];
  const isLastSlide = currentSlide === totalSlides - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6"
      dir={isRTL ? "rtl" : "ltr"}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-md transition-opacity animate-fade-in"
        onClick={onClose}
      />

      {/* Modal Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-headline"
        className="relative w-full max-w-2xl bg-white dark:bg-[#0c1020] border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] animate-scale-in"
      >
        {/* Top Bar: Progress Pills & Close */}
        <div className="p-3.5 sm:p-4 border-b border-slate-100 dark:border-white/5 flex items-center justify-between gap-3 flex-shrink-0 bg-slate-50/70 dark:bg-slate-900/40">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base sm:text-lg flex-shrink-0">{slide.icon || "🏛️"}</span>
            <div className="min-w-0">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 block truncate">
                {slide.tag || `Step ${currentSlide + 1}`}
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                {t.tutorial.stepOf
                  ? t.tutorial.stepOf.replace("{current}", String(currentSlide + 1)).replace("{total}", String(totalSlides))
                  : `${currentSlide + 1} / ${totalSlides}`}
              </span>
            </div>
          </div>

          {/* Clickable Step Pills (Compact 13-step track) */}
          <div className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-slate-200/50 dark:bg-white/5 max-w-[260px]">
            {slides.map((s, idx) => {
              const isActive = idx === currentSlide;
              const isPassed = idx < currentSlide;
              return (
                <button
                  key={s.id || idx}
                  type="button"
                  onClick={() => setCurrentSlide(idx)}
                  aria-label={`Jump to slide ${idx + 1}: ${s.headline || s.title || ""}`}
                  title={`${idx + 1}. ${s.headline || s.title || ""}`}
                  className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                    isActive
                      ? "w-5 bg-blue-600 shadow-xs"
                      : isPassed
                      ? "w-1.5 bg-blue-400/60 dark:bg-blue-500/40 hover:w-3 hover:bg-blue-500"
                      : "w-1.5 bg-slate-300 dark:bg-slate-700 hover:w-3 hover:bg-slate-400 dark:hover:bg-slate-500"
                  }`}
                />
              );
            })}
          </div>

          {/* Actions: Skip / Close */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-2.5 py-1 text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-200/50 dark:hover:bg-white/5 transition-colors"
            >
              {t.tutorial.skip || "Skip"}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close guide"
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg hover:bg-slate-200/50 dark:hover:bg-white/5 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 space-y-4">
          {/* Miniature Live Product Representation */}
          <div className="w-full rounded-2xl bg-slate-50/80 dark:bg-[#11162b] border border-slate-200/80 dark:border-white/10 p-3 sm:p-4 shadow-inner flex items-center justify-center min-h-[190px] sm:min-h-[210px]">
            {VisualComponent && <VisualComponent language={language} isRTL={isRTL} />}
          </div>

          {/* Text Content: Headline, Body, Key Points */}
          <div className="space-y-2.5 text-start">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                {slide.tag || `Step ${currentSlide + 1}`}
              </span>
              <h3
                id="tutorial-headline"
                className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-snug"
              >
                {slide.headline || slide.title}
              </h3>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
              {slide.body || slide.description}
            </p>

            {/* Key Points / Tips List */}
            {slide.tips && slide.tips.length > 0 && (
              <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {slide.tips.map((tip, tIdx) => (
                  <div
                    key={tIdx}
                    className="flex items-start gap-2 p-2 rounded-xl bg-slate-100/70 dark:bg-white/[0.03] border border-slate-200/50 dark:border-white/5 text-[11px] text-slate-700 dark:text-slate-300"
                  >
                    <span className="text-emerald-500 font-bold flex-shrink-0 mt-0.5">✓</span>
                    <span className="leading-snug">{tip}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Navigation Bar */}
        <div className="p-3.5 sm:p-4 bg-slate-50/80 dark:bg-slate-900/60 border-t border-slate-100 dark:border-white/5 flex items-center justify-between gap-3 flex-shrink-0">
          {/* Back Button */}
          <button
            type="button"
            onClick={handlePrev}
            disabled={currentSlide === 0}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl transition-all ${
              currentSlide === 0
                ? "text-slate-300 dark:text-slate-700 cursor-not-allowed"
                : "text-slate-700 dark:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-white/10"
            }`}
          >
            <span className={isRTL ? "rotate-180" : ""}>←</span>
            <span>{t.tutorial.back || "Back"}</span>
          </button>

          {/* Mobile Progress Dots (Compact 13-dot track) */}
          <div className="flex sm:hidden items-center gap-1 px-1">
            {slides.map((_, i) => (
              <div
                key={i}
                className={`h-1 rounded-full transition-all duration-300 ${
                  i === currentSlide
                    ? "w-3 bg-blue-600 shadow-xs"
                    : i < currentSlide
                    ? "w-1 bg-blue-400/60 dark:bg-blue-500/40"
                    : "w-1 bg-slate-300 dark:bg-slate-700"
                }`}
              />
            ))}
          </div>

          {/* Next / Get Started Button */}
          <button
            type="button"
            onClick={handleNext}
            className={`flex items-center gap-2 px-5 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all shadow-md active:scale-95 cursor-pointer ${
              isLastSlide
                ? "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-500/25"
                : "bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900"
            }`}
          >
            <span>{isLastSlide ? (t.tutorial.getStarted || "Get Started") : (t.tutorial.next || "Next")}</span>
            <span className={isRTL ? "rotate-180" : ""}>→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
