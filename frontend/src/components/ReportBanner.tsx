/**
 * ReportBanner — Large banner at the top of the report page.
 * Shows APPROVE (green) / REJECT (red) / DEFER (yellow) with
 * overall confidence percentage and circular progress indicator.
 */

import { useEffect, useState } from "react";

interface ReportBannerProps {
  decision: "APPROVE" | "REJECT" | "DEFER";
  confidence: number;
  decisionTitle: string;
  templateName: string;
}

/** Decision color schemes */
const decisionStyles = {
  APPROVE: {
    bg: "from-emerald-500/10 to-emerald-900/10 dark:from-emerald-500/20 dark:to-emerald-900/20",
    border: "border-emerald-500/30",
    text: "text-emerald-700 dark:text-emerald-400",
    glow: "shadow-[0_0_60px_rgba(16,185,129,0.1)] dark:shadow-[0_0_60px_rgba(16,185,129,0.15)]",
    ring: "stroke-emerald-500",
    label: "APPROVED",
    icon: "✓",
  },
  REJECT: {
    bg: "from-red-500/10 to-red-900/10 dark:from-red-500/20 dark:to-red-900/20",
    border: "border-red-500/30",
    text: "text-red-700 dark:text-red-400",
    glow: "shadow-[0_0_60px_rgba(239,68,68,0.1)] dark:shadow-[0_0_60px_rgba(239,68,68,0.15)]",
    ring: "stroke-red-500",
    label: "REJECTED",
    icon: "✗",
  },
  DEFER: {
    bg: "from-amber-500/10 to-amber-900/10 dark:from-amber-500/20 dark:to-amber-900/20",
    border: "border-amber-500/30",
    text: "text-amber-700 dark:text-amber-400",
    glow: "shadow-[0_0_60px_rgba(245,158,11,0.1)] dark:shadow-[0_0_60px_rgba(245,158,11,0.15)]",
    ring: "stroke-amber-500",
    label: "DEFERRED",
    icon: "⏸",
  },
};

export default function ReportBanner({
  decision,
  confidence,
  decisionTitle,
  templateName,
}: ReportBannerProps) {
  const style = decisionStyles[decision];
  const [animatedConfidence, setAnimatedConfidence] = useState(0);

  // Animate confidence counter
  useEffect(() => {
    let start = 0;
    const end = confidence;
    const duration = 1500;
    const increment = end / (duration / 16);

    const timer = setInterval(() => {
      start += increment;
      if (start >= end) {
        setAnimatedConfidence(end);
        clearInterval(timer);
      } else {
        setAnimatedConfidence(Math.floor(start));
      }
    }, 16);

    return () => clearInterval(timer);
  }, [confidence]);

  // SVG circular progress
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (animatedConfidence / 100) * circumference;

  return (
    <div
      className={`
        glass-elevated rounded-2xl border ${style.border} ${style.glow}
        bg-gradient-to-br ${style.bg}
        p-8 animate-scale-in
      `}
    >
      <div className="flex flex-col md:flex-row items-center gap-8">
        {/* Circular confidence indicator */}
        <div className="relative flex-shrink-0">
          <svg width="130" height="130" className="-rotate-90">
            {/* Background ring */}
            <circle
              cx="65"
              cy="65"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              className="text-slate-200 dark:text-slate-800"
            />
            {/* Progress ring */}
            <circle
              cx="65"
              cy="65"
              r={radius}
              fill="none"
              strokeWidth="8"
              strokeLinecap="round"
              className={style.ring}
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{ transition: "stroke-dashoffset 1.5s ease-out" }}
            />
          </svg>
          {/* Confidence percentage */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-3xl font-bold ${style.text}`}>
              {animatedConfidence}%
            </span>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">
              Confidence
            </span>
          </div>
        </div>

        {/* Decision text */}
        <div className="text-center md:text-left flex-1">
          <p className="text-xs text-slate-500 dark:text-slate-500 uppercase tracking-widest mb-1">
            {templateName} • Board Decision
          </p>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white mb-3">
            {decisionTitle}
          </h1>
          <div
            className={`
              inline-flex items-center gap-2 px-5 py-2.5 rounded-full
              text-lg font-bold ${style.text} bg-white/50 dark:bg-white/5 border ${style.border} shadow-sm dark:shadow-none
            `}
          >
            <span className="text-xl">{style.icon}</span>
            {style.label}
          </div>
        </div>
      </div>
    </div>
  );
}
