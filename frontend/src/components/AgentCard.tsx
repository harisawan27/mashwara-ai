/**
 * AgentCard — Animated card shown on the loading screen.
 * Displays agent name, role icon, and thinking/complete status.
 */

import type { AgentInfo } from "../types/meeting";

interface AgentCardProps {
  agent: AgentInfo;
  isComplete: boolean;
  delay: number;
}

export default function AgentCard({ agent, isComplete, delay }: AgentCardProps) {
  return (
    <div
      className="glass rounded-xl p-5 animate-scale-in opacity-0 transition-all duration-500"
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="flex items-center gap-4">
        {/* Agent icon */}
        <div
          className={`
            w-12 h-12 rounded-xl bg-gradient-to-br ${agent.color}
            flex items-center justify-center text-2xl
            ${!isComplete ? "animate-pulse" : ""}
          `}
        >
          {agent.icon}
        </div>

        {/* Agent info */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white text-sm">{agent.role}</h3>
          <p className="text-xs text-slate-400 truncate">{agent.title}</p>
        </div>

        {/* Status indicator */}
        <div className="flex-shrink-0">
          {isComplete ? (
            <div className="flex items-center gap-1.5 text-emerald-400 animate-bounce-in">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-xs font-medium">Done</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-slate-400">
              <svg className="w-4 h-4 animate-spin-slow" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-xs">Thinking...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
