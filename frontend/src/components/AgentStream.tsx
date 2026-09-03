/**
 * AgentStream — Single agent card in the board canvas.
 * Shows live-streaming text, a collapsible thinking dropdown,
 * vote badge, confidence bar, and status indicator.
 */

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { RoleInfo } from "../api/client";

interface AgentStreamProps {
  role: RoleInfo;
  thinking: string;
  text: string;
  status: "idle" | "thinking" | "done" | "waiting";
  voteData?: { vote: string; confidence: number };
  isModerator?: boolean;
}

const VOTE_STYLES: Record<string, { pill: string; icon: string; label: string }> = {
  YES:     { pill: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/30", icon: "✓", label: "YES" },
  APPROVE: { pill: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-emerald-500/30", icon: "✓", label: "YES" },
  NO:      { pill: "bg-red-500/10     text-red-600     dark:text-red-400     ring-red-500/30",     icon: "✗", label: "NO"  },
  REJECT:  { pill: "bg-red-500/10     text-red-600     dark:text-red-400     ring-red-500/30",     icon: "✗", label: "NO"  },
  DEFER:   { pill: "bg-amber-500/10   text-amber-600   dark:text-amber-400   ring-amber-500/30",   icon: "⏸", label: "DEFER" },
};

function voteStyle(vote?: string) {
  if (!vote) return null;
  return VOTE_STYLES[vote.toUpperCase()] ?? VOTE_STYLES.DEFER;
}

export default function AgentStream({
  role, thinking, text, status, voteData, isModerator = false,
}: AgentStreamProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isThinkingOpen, setIsThinkingOpen] = useState(false);

  useEffect(() => {
    if (scrollRef.current && isExpanded) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [text, thinking, isExpanded]);

  // Open thinking while generating, collapse when text arrives
  useEffect(() => {
    if (status === "thinking" && thinking && !text) setIsThinkingOpen(true);
    if (text) setIsThinkingOpen(false);
  }, [status, thinking, text]);

  if (status === "idle") return null;

  const isActive = status === "thinking";
  const isWaiting = status === "waiting";

  // Clean display text — strip think tags and "Final Analysis:" prefix
  const displayText = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^\s*\*?\*?Final Analysis:\*?\*?\s*/i, "")
    .trim();

  // Extract vote/confidence from text as live fallback
  const voteMatch = displayText.match(/VOTE:\s*(YES|NO|DEFER|APPROVE|REJECT)/i);
  const confMatch = displayText.match(/CONFIDENCE:\s*(\d+)/i);
  const currentVote = voteData?.vote ?? (voteMatch ? voteMatch[1] : undefined);
  const currentConf = voteData?.confidence ?? (confMatch ? parseInt(confMatch[1], 10) : undefined);
  const vs = voteStyle(currentVote);

  return (
    <div className={`
      rounded-xl border overflow-hidden transition-all duration-300 bg-white dark:bg-[#0d1020]
      ${isModerator ? "col-span-2 border-blue-200 dark:border-blue-500/20" : ""}
      ${isActive
        ? "border-blue-200 dark:border-blue-500/25 shadow-sm shadow-blue-500/10"
        : isWaiting
        ? "border-amber-200 dark:border-amber-500/20"
        : "border-slate-200 dark:border-white/[0.06]"}
    `}>
      {/* ── Card header ── */}
      <button
        onClick={() => setIsExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors text-left"
      >
        {/* Avatar */}
        <div className={`
          w-8 h-8 rounded-lg bg-gradient-to-br ${role.color}
          flex items-center justify-center text-sm flex-shrink-0 shadow-sm
          ${isActive ? "ring-2 ring-blue-400/50 ring-offset-1 ring-offset-white dark:ring-offset-[#0d1020]" : ""}
        `}>
          {role.icon}
        </div>

        {/* Name + title */}
        <div className="flex-1 min-w-0 text-left">
          <p className="text-xs font-bold text-slate-900 dark:text-white truncate leading-tight">
            {role.name || role.key}
          </p>
          <p className="text-[10px] text-slate-500 truncate">{role.title}</p>
        </div>

        {/* Vote badge */}
        {vs && (
          <span className={`hidden sm:flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded ring-1 flex-shrink-0 ${vs.pill}`}>
            {vs.icon} {vs.label}
            {currentConf !== undefined && <span className="font-normal opacity-70 ml-0.5">· {currentConf}%</span>}
          </span>
        )}

        {/* Status chip */}
        <span className="flex-shrink-0">
          {isActive ? (
            <span className="flex items-center gap-1.5 text-[10px] text-blue-500 font-medium">
              <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
              <span className="hidden sm:inline">Thinking</span>
            </span>
          ) : isWaiting ? (
            <span className="flex items-center gap-1 text-[10px] text-amber-500 font-medium">
              <svg className="w-3 h-3 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              <span className="hidden sm:inline">Waiting</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] text-emerald-500 font-medium">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
              </svg>
              <span className="hidden sm:inline">Done</span>
            </span>
          )}
        </span>

        {/* Expand chevron */}
        <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 flex-shrink-0 ${isExpanded ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
        </svg>
      </button>

      {/* ── Expandable body ── */}
      {isExpanded && (
        <div className="border-t border-slate-100 dark:border-white/[0.04] px-4 pb-4 pt-3">
          
          {/* Confidence mini-bar (mobile fallback for vote) */}
          {vs && currentConf !== undefined && (
            <div className="sm:hidden flex items-center gap-2 mb-3">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ring-1 ${vs.pill}`}>{vs.icon} {vs.label}</span>
              <div className="flex-1 h-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-700 ${
                  (currentVote || "").toUpperCase().includes("YES") || (currentVote || "").toUpperCase().includes("APPROVE")
                    ? "bg-emerald-500"
                    : (currentVote || "").toUpperCase().includes("NO") || (currentVote || "").toUpperCase().includes("REJECT")
                    ? "bg-red-500" : "bg-amber-500"
                }`} style={{ width: `${currentConf}%` }} />
              </div>
              <span className="text-[10px] text-slate-500">{currentConf}%</span>
            </div>
          )}

          {/* Thinking dropdown */}
          {thinking && (
            <div className="mb-3">
              <button
                onClick={() => setIsThinkingOpen(v => !v)}
                className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors group"
              >
                <svg className={`w-3 h-3 transition-transform ${isThinkingOpen ? "rotate-90" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                </svg>
                <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                </svg>
                Thought process
              </button>
              {isThinkingOpen && (
                <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-500 italic leading-relaxed bg-slate-50 dark:bg-white/[0.02] rounded-lg p-3 border border-slate-200 dark:border-white/[0.04] max-h-40 overflow-y-auto custom-scrollbar whitespace-pre-wrap">
                  {thinking}
                </div>
              )}
            </div>
          )}

          {/* Main analysis text */}
          <div
            ref={scrollRef}
            className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed max-h-56 overflow-y-auto custom-scrollbar pr-1 prose prose-xs prose-slate dark:prose-invert max-w-none"
          >
            {displayText ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayText}</ReactMarkdown>
            ) : thinking ? (
              <span className="text-slate-400 italic text-[11px]">Thinking…</span>
            ) : (
              <span className="text-slate-400 italic text-[11px]">Initializing…</span>
            )}
            {isActive && (
              <span className="inline-block animate-pulse font-bold text-blue-500 ml-0.5">|</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
