/**
 * AnalysisCard — Collapsible card for displaying an agent's full analysis.
 * Features smooth expand/collapse animation with agent icon header.
 */

import { useState } from "react";
import type { AgentRole, AGENT_INFO } from "../types/meeting";

interface AnalysisCardProps {
  role: AgentRole;
  agentInfo: (typeof AGENT_INFO)[AgentRole];
  analysis: string;
  delay: number;
}

export default function AnalysisCard({ role, agentInfo, analysis, delay }: AnalysisCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className="glass-elevated rounded-2xl overflow-hidden animate-slide-up opacity-0"
      style={{ animationDelay: `${delay}s` }}
    >
      {/* Header (click to toggle) */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-5 hover:bg-white/[0.02] transition-colors duration-200"
        id={`analysis-${role.toLowerCase()}`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg bg-gradient-to-br ${agentInfo.color} flex items-center justify-center text-xl`}
          >
            {agentInfo.icon}
          </div>
          <div className="text-left">
            <p className="font-semibold text-white text-sm">{role} Analysis</p>
            <p className="text-xs text-slate-500">{agentInfo.title}</p>
          </div>
        </div>

        {/* Expand/collapse chevron */}
        <svg
          className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${
            isExpanded ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expandable content */}
      <div
        className={`transition-all duration-300 ease-in-out overflow-hidden ${
          isExpanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-5 pb-5 border-t border-white/5">
          <div className="pt-4 text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
            {analysis}
          </div>
        </div>
      </div>
    </div>
  );
}
