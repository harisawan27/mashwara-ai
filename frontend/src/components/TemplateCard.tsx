/**
 * TemplateCard — Premium glassmorphism card with accent glow and micro-animations.
 */

import { useNavigate } from "react-router-dom";
import type { TemplateType, TemplateMetadata } from "../types/meeting";

interface TemplateCardProps {
  templateType: TemplateType;
  metadata: TemplateMetadata;
  index: number;
}

const accentMap: Record<string, { border: string; glow: string; bg: string; text: string }> = {
  blue: {
    border: "group-hover:border-blue-500/30",
    glow: "group-hover:shadow-[0_0_40px_rgba(99,102,241,0.08)]",
    bg: "bg-blue-500/10",
    text: "text-blue-400",
  },
  emerald: {
    border: "group-hover:border-emerald-500/30",
    glow: "group-hover:shadow-[0_0_40px_rgba(16,185,129,0.08)]",
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
  },
  amber: {
    border: "group-hover:border-amber-500/30",
    glow: "group-hover:shadow-[0_0_40px_rgba(245,158,11,0.08)]",
    bg: "bg-amber-500/10",
    text: "text-amber-400",
  },
  sky: {
    border: "group-hover:border-sky-500/30",
    glow: "group-hover:shadow-[0_0_40px_rgba(14,165,233,0.08)]",
    bg: "bg-sky-500/10",
    text: "text-sky-400",
  },
  rose: {
    border: "group-hover:border-rose-500/30",
    glow: "group-hover:shadow-[0_0_40px_rgba(244,63,94,0.08)]",
    bg: "bg-rose-500/10",
    text: "text-rose-400",
  },
};

export default function TemplateCard({ templateType, metadata, index }: TemplateCardProps) {
  const navigate = useNavigate();
  const accent = accentMap[metadata.accentColor] || accentMap.blue;

  return (
    <button
      id={`template-card-${templateType.toLowerCase()}`}
      onClick={() => navigate(`/meeting/${templateType}`)}
      className={`
        group glass-elevated w-full text-left rounded-2xl p-6
        transition-all duration-300 ease-out cursor-pointer
        hover:translate-y-[-2px] ${accent.border} ${accent.glow}
        animate-slide-up opacity-0
      `}
      style={{ animationDelay: `${index * 0.06}s` }}
    >
      {/* Top row: icon + arrow */}
      <div className="flex items-start justify-between mb-5">
        <div className={`w-12 h-12 rounded-2xl ${accent.bg} flex items-center justify-center text-2xl transition-transform duration-300 group-hover:scale-110`}>
          {metadata.icon}
        </div>
        <div className="w-8 h-8 rounded-full bg-white/[0.03] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:translate-x-0.5">
          <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
          </svg>
        </div>
      </div>

      {/* Title */}
      <h3 className="text-lg font-semibold text-white mb-1.5 group-hover:text-white/90 transition-colors">
        {metadata.name}
      </h3>

      {/* Description */}
      <p className="text-sm text-slate-500 mb-5 leading-relaxed">
        {metadata.description}
      </p>

      {/* Example pill */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-slate-600 font-medium">Example</span>
        <span className={`text-xs ${accent.text} opacity-70`}>"{metadata.exampleDecision}"</span>
      </div>
    </button>
  );
}
