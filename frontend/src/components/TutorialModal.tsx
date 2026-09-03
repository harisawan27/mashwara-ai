import { useState, useEffect } from "react";

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TutorialModal({ isOpen, onClose }: TutorialModalProps) {
  const [currentSlide, setCurrentSlide] = useState(0);

  // Reset to first slide when opened
  useEffect(() => {
    if (isOpen) setCurrentSlide(0);
  }, [isOpen]);

  if (!isOpen) return null;

  const slides = [
    {
      title: "Welcome to Boardroom AI",
      description: "Your personal Chief of Staff and Executive Board in one place. Make better decisions with AI-driven perspectives.",
      icon: "🏛️",
      color: "from-blue-600 to-blue-800",
    },
    {
      title: "Brainstorm with Chief of Staff",
      description: "Type a message and hit send to chat instantly with your Chief of Staff. Perfect for quick queries and brainstorming.",
      icon: "💼",
      color: "from-emerald-400 to-teal-500",
    },
    {
      title: "Convene the Board",
      description: "For major decisions, toggle the 'Convene Board' switch. We'll summon specialized agents (like a CFO or CMO) to debate your problem from all angles.",
      icon: "⚖️",
      color: "from-blue-500 to-blue-700",
    },
    {
      title: "Review the Board Report",
      description: "Once the board concludes, you'll receive a comprehensive report summarizing all perspectives and giving a final recommendation.",
      icon: "📊",
      color: "from-orange-400 to-red-500",
    }
  ];

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
        className="absolute inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-slide-up flex flex-col">
        
        {/* Progress Bar */}
        <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 flex">
          {slides.map((_, i) => (
            <div 
              key={i} 
              className={`h-full flex-1 transition-all duration-500 ${i <= currentSlide ? 'bg-blue-500' : 'bg-transparent'}`}
            />
          ))}
        </div>

        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors rounded-full hover:bg-slate-100 dark:hover:bg-white/10 z-10"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Slides Container */}
        <div className="p-8 sm:p-10 flex flex-col items-center text-center min-h-[360px] justify-center relative overflow-hidden">
          
          {slides.map((slide, idx) => (
            <div 
              key={idx}
              className={`absolute inset-0 p-8 sm:p-10 flex flex-col items-center justify-center transition-all duration-500 ease-in-out ${
                idx === currentSlide ? 'opacity-100 translate-x-0' : 
                idx < currentSlide ? 'opacity-0 -translate-x-12 pointer-events-none' : 
                'opacity-0 translate-x-12 pointer-events-none'
              }`}
            >
              <div className={`w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-gradient-to-br ${slide.color} flex items-center justify-center text-4xl sm:text-5xl shadow-xl shadow-blue-500/20 mb-8 animate-bounce-slight`}>
                {slide.icon}
              </div>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-4">
                {slide.title}
              </h3>
              <p className="text-slate-600 dark:text-slate-400 text-sm sm:text-base leading-relaxed max-w-sm">
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
            Back
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
            {currentSlide === slides.length - 1 ? "Get Started" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
