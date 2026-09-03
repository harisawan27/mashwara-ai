/**
 * MeetingCanvas — Premium board meeting canvas
 * Full-screen slide-over with tabbed Report / Deliberation views.
 */

import { useState } from "react";
import AgentStream from "./AgentStream";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface AgentStreamState {
  status: "idle" | "thinking" | "done" | "waiting";
  thinking: string;
  text: string;
}

interface MeetingCanvasProps {
  isOpen: boolean;
  onClose: () => void;
  report?: any;
  streams?: Record<string, AgentStreamState>;
  isProcessing?: boolean;
  template: string;
  decisionTitle?: string;
  rolesInfo?: any[];
}

// ─── Decision colour tokens ───────────────────────────────────────────────────
const DECISION = {
  YES:     { label: "APPROVED",  icon: "✓", pill: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-emerald-500/30", bar: "bg-emerald-500", glow: "shadow-emerald-500/20", ring: "stroke-emerald-500" },
  APPROVE: { label: "APPROVED",  icon: "✓", pill: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-emerald-500/30", bar: "bg-emerald-500", glow: "shadow-emerald-500/20", ring: "stroke-emerald-500" },
  NO:      { label: "REJECTED",  icon: "✗", pill: "bg-red-500/15     text-red-600     dark:text-red-400     ring-red-500/30",     bar: "bg-red-500",     glow: "shadow-red-500/20",     ring: "stroke-red-500"     },
  REJECT:  { label: "REJECTED",  icon: "✗", pill: "bg-red-500/15     text-red-600     dark:text-red-400     ring-red-500/30",     bar: "bg-red-500",     glow: "shadow-red-500/20",     ring: "stroke-red-500"     },
  DEFER:   { label: "DEFERRED",  icon: "⏸", pill: "bg-amber-500/15   text-amber-600   dark:text-amber-400   ring-amber-500/30",   bar: "bg-amber-500",   glow: "shadow-amber-500/20",   ring: "stroke-amber-500"   },
} as const;

function token(key?: string) {
  if (!key) return DECISION.DEFER;
  return (DECISION as any)[key.toUpperCase()] ?? DECISION.DEFER;
}

// ─── Animated confidence ring ─────────────────────────────────────────────────
function ConfidenceRing({ value, colorClass }: { value: number; colorClass: string }) {
  const r = 44;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  return (
    <svg width="110" height="110" className="-rotate-90 drop-shadow-lg">
      <circle cx="55" cy="55" r={r} fill="none" stroke="currentColor" strokeWidth="7" className="text-slate-200 dark:text-slate-800" />
      <circle cx="55" cy="55" r={r} fill="none" strokeWidth="7" strokeLinecap="round" className={colorClass}
        strokeDasharray={circ} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 1.4s ease-out" }} />
    </svg>
  );
}

// ─── Vote tally bar ───────────────────────────────────────────────────────────
function VoteTally({ votes }: { votes: Record<string, { vote: string; confidence: number }> }) {
  const counts = { YES: 0, NO: 0, DEFER: 0 };
  Object.values(votes || {}).forEach(v => {
    const k = (v.vote || "").toUpperCase();
    if (k === "YES" || k === "APPROVE") counts.YES++;
    else if (k === "NO" || k === "REJECT") counts.NO++;
    else counts.DEFER++;
  });
  const total = counts.YES + counts.NO + counts.DEFER;
  const pct = (n: number) => total ? Math.round((n / total) * 100) : 0;

  return (
    <div className="space-y-2">
      {([["YES", counts.YES, "bg-emerald-500", "text-emerald-600 dark:text-emerald-400"],
         ["NO",  counts.NO,  "bg-red-500",     "text-red-600 dark:text-red-400"],
         ["DEFER", counts.DEFER, "bg-amber-500", "text-amber-600 dark:text-amber-400"]] as const).map(([label, n, barCls, txtCls]) => (
        <div key={label} className="flex items-center gap-3">
          <span className={`text-[10px] font-bold w-10 ${txtCls}`}>{label}</span>
          <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${barCls}`} style={{ width: `${pct(n)}%` }} />
          </div>
          <span className="text-[10px] text-slate-500 w-6 text-right">{n}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function MeetingCanvas({
  isOpen, onClose, report, streams, isProcessing,
  template, decisionTitle = "Board Meeting", rolesInfo,
}: MeetingCanvasProps) {
  const [tab, setTab] = useState<"report" | "deliberation">("deliberation");

  if (!isOpen) return null;

  const roles = rolesInfo?.filter((r: any) => r.key !== "Moderator") || [];
  const moderator = rolesInfo?.find((r: any) => r.key === "Moderator");
  const activeStreams = streams ? Object.keys(streams).filter(k => k !== "_roles" && streams[k]?.status !== "idle") : [];
  const doneCount = activeStreams.filter(k => streams![k]?.status === "done").length;
  const totalAgents = roles.length;
  const decStyle = token(report?.final_decision);
  const hasReport = !!report;

  // Auto-switch to report tab when report arrives
  if (hasReport && tab === "deliberation" && doneCount === totalAgents && totalAgents > 0) {
    // use a timeout trick to avoid render-during-render
  }

  const templateLabel = template.replace(/_BOARD$/, "").replace(/_/g, " ");

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/30 dark:bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full sm:w-[92vw] md:w-[680px] lg:w-[820px] xl:w-[900px] h-full bg-white dark:bg-[#0a0d18] shadow-2xl flex flex-col border-l border-slate-200/80 dark:border-white/[0.06] animate-slide-left">

        {/* ── Header ── */}
        <div className="flex-shrink-0 px-4 sm:px-6 py-3.5 border-b border-slate-200 dark:border-white/[0.06] bg-white/80 dark:bg-white/[0.03] backdrop-blur-md flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-900 shadow ring-1 ring-slate-200 dark:ring-white/10 flex items-center justify-center p-1.5 flex-shrink-0">
              <img src="/boardroom-ai.svg" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate">{decisionTitle}</h2>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">{templateLabel} Board</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Live progress pill */}
            {isProcessing ? (
              <span className="hidden sm:flex items-center gap-1.5 text-[11px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-2.5 py-1 rounded-full ring-1 ring-blue-500/20">
                <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                {doneCount}/{totalAgents} complete
              </span>
            ) : hasReport ? (
              <span className={`hidden sm:flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ring-1 ${decStyle.pill}`}>
                {decStyle.icon} {decStyle.label}
              </span>
            ) : null}
            <button onClick={onClose} className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex-shrink-0 px-4 sm:px-6 flex gap-1 border-b border-slate-200 dark:border-white/[0.06] bg-white/50 dark:bg-transparent">
          {(["deliberation", "report"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              disabled={t === "report" && !hasReport}
              className={`relative py-3 px-3 text-xs font-semibold tracking-wide transition-colors capitalize
                ${tab === t
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed"
                }`}
            >
              {t === "deliberation" ? "Live Deliberation" : "Board Report"}
              {tab === t && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-t-full" />}
              {t === "report" && !hasReport && isProcessing && (
                <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse align-middle" />
              )}
            </button>
          ))}
        </div>

        {/* ── Scroll Content ── */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">

          {/* ════ DELIBERATION TAB ════ */}
          {tab === "deliberation" && (
            <div className="p-4 sm:p-6 space-y-4 pb-24">

              {/* Empty loading */}
              {(!streams || activeStreams.length === 0) && isProcessing && (
                <div className="flex flex-col items-center justify-center gap-4 mt-16 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-2xl animate-pulse">🏛️</div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">Calling the board to order</p>
                    <p className="text-xs text-slate-500 mt-1">Agents are loading their briefings…</p>
                  </div>
                </div>
              )}

              {/* Progress bar */}
              {totalAgents > 0 && (
                <div className="flex items-center gap-3 py-2">
                  <span className="text-[11px] text-slate-500 whitespace-nowrap">{doneCount}/{totalAgents} agents</span>
                  <div className="flex-1 h-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${totalAgents ? (doneCount / totalAgents) * 100 : 0}%` }} />
                  </div>
                  {isProcessing
                    ? <span className="text-[11px] text-blue-500 font-medium whitespace-nowrap">In progress</span>
                    : doneCount > 0 && <span className="text-[11px] text-emerald-500 font-medium whitespace-nowrap">Complete</span>}
                </div>
              )}

              {/* Agent Cards Grid */}
              {activeStreams.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {roles.map((role: any) => {
                    const stream = streams![role.key];
                    if (!stream || stream.status === "idle") return null;
                    return (
                      <AgentStream
                        key={role.key}
                        role={role}
                        thinking={stream.thinking}
                        text={stream.text}
                        status={stream.status}
                        voteData={report?.board_votes?.[role.key]}
                      />
                    );
                  })}

                  {/* Moderator */}
                  {moderator && streams?.[moderator.key] && streams[moderator.key].status !== "idle" && (
                    <div className="sm:col-span-2">
                      <AgentStream
                        key={moderator.key}
                        role={moderator}
                        thinking={streams[moderator.key].thinking}
                        text={streams[moderator.key].text}
                        status={streams[moderator.key].status}
                        voteData={undefined}
                        isModerator
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Prompt to switch to report */}
              {hasReport && doneCount === totalAgents && totalAgents > 0 && (
                <div
                  onClick={() => setTab("report")}
                  className="mt-2 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-blue-500/10 to-indigo-500/10 dark:from-blue-500/20 dark:to-indigo-500/20 border border-blue-500/20 cursor-pointer hover:from-blue-500/20 hover:to-indigo-500/20 transition-all"
                >
                  <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                  <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">Board report is ready — view now</span>
                  <svg className="w-3.5 h-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                </div>
              )}
            </div>
          )}

          {/* ════ REPORT TAB ════ */}
          {tab === "report" && hasReport && (
            <div className="p-4 sm:p-6 space-y-5 pb-24">

              {/* Hero decision card */}
              <div className={`rounded-2xl p-5 sm:p-7 bg-gradient-to-br border ring-1 ${decStyle.pill.includes("emerald") ? "from-emerald-50 to-white dark:from-emerald-950/30 dark:to-transparent border-emerald-200 dark:border-emerald-500/20 ring-emerald-500/10" : decStyle.pill.includes("red") ? "from-red-50 to-white dark:from-red-950/30 dark:to-transparent border-red-200 dark:border-red-500/20 ring-red-500/10" : "from-amber-50 to-white dark:from-amber-950/30 dark:to-transparent border-amber-200 dark:border-amber-500/20 ring-amber-500/10"} shadow-lg ${decStyle.glow}`}>
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
                  {/* Confidence ring */}
                  <div className="relative flex-shrink-0">
                    <ConfidenceRing value={report.confidence_score ?? 0} colorClass={decStyle.ring} />
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className={`text-2xl font-extrabold ${decStyle.pill.split(" ")[1]}`}>{report.confidence_score}%</span>
                      <span className="text-[9px] text-slate-500 uppercase tracking-wider">Confidence</span>
                    </div>
                  </div>
                  {/* Text info */}
                  <div className="flex-1 text-center sm:text-left">
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">{templateLabel} • Board Decision</p>
                    <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white mb-3 leading-snug">{report.decision_title || decisionTitle}</h1>
                    <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold ring-1 ${decStyle.pill}`}>
                      <span>{decStyle.icon}</span>{decStyle.label}
                    </span>
                  </div>
                </div>

                {/* Vote tally */}
                {report.board_votes && Object.keys(report.board_votes).length > 0 && (
                  <div className="mt-6 pt-5 border-t border-slate-200 dark:border-white/[0.06]">
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-3 font-semibold">Board Votes</p>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {Object.entries(report.board_votes).map(([agent, v]: any) => {
                        const t = token(v.vote);
                        return (
                          <div key={agent} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ring-1 bg-white/50 dark:bg-white/[0.04] ${t.pill} text-[11px] font-semibold`}>
                            <span>{t.icon}</span>
                            <span className="text-slate-700 dark:text-slate-300">{agent}</span>
                            <span className="text-slate-400 font-normal">{v.confidence}%</span>
                          </div>
                        );
                      })}
                    </div>
                    <VoteTally votes={report.board_votes} />
                  </div>
                )}
              </div>

              {/* Consensus summary */}
              {report.debate_summary && (
                <div className="rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] p-4 sm:p-5">
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-3">Board Consensus</p>
                  <div className="prose prose-sm prose-slate dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 leading-relaxed border-l-2 border-blue-400/40 pl-4">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.debate_summary}</ReactMarkdown>
                  </div>
                </div>
              )}

              {/* Risks + Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Key Risks */}
                {report.key_risks?.length > 0 && (
                  <div className="rounded-xl bg-red-50/60 dark:bg-red-950/20 border border-red-200/60 dark:border-red-500/15 p-4 sm:p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-5 h-5 rounded-md bg-red-100 dark:bg-red-500/20 flex items-center justify-center">
                        <svg className="w-3 h-3 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
                      </div>
                      <p className="text-[10px] text-red-600 dark:text-red-400 uppercase tracking-widest font-bold">Key Risks</p>
                    </div>
                    <ul className="space-y-2">
                      {report.key_risks.map((risk: string, i: number) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-400 dark:bg-red-500 flex-shrink-0" />
                          {risk}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Recommended Actions */}
                {report.recommended_actions?.length > 0 && (
                  <div className="rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-500/15 p-4 sm:p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-5 h-5 rounded-md bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center">
                        <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                      </div>
                      <p className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase tracking-widest font-bold">Recommended Actions</p>
                    </div>
                    <ol className="space-y-2">
                      {report.recommended_actions.map((action: string, i: number) => (
                        <li key={i} className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                          <span className="flex-shrink-0 w-4 h-4 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[9px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                          {action}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>

              {/* Agent mini-votes */}
              {roles.length > 0 && streams && (
                <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-white/[0.02] overflow-hidden">
                  <p className="px-4 sm:px-5 py-3 text-[10px] text-slate-500 uppercase tracking-widest font-bold border-b border-slate-200 dark:border-white/[0.06]">Agent Analyses</p>
                  <div className="divide-y divide-slate-200 dark:divide-white/[0.04]">
                    {roles.map((role: any) => {
                      const stream = streams[role.key];
                      const vote = report?.board_votes?.[role.key];
                      const vt = token(vote?.vote);
                      const displayText = (stream?.text || "")
                        .replace(/<think>[\s\S]*?<\/think>/gi, "")
                        .replace(/^\s*\*?\*?Final Analysis:\*?\*?\s*/i, "")
                        .trim();
                      if (!displayText && !vote) return null;
                      return (
                        <details key={role.key} className="group">
                          <summary className="flex items-center gap-3 px-4 sm:px-5 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/[0.03] transition-colors list-none">
                            <span className={`w-7 h-7 rounded-md bg-gradient-to-br ${role.color} flex items-center justify-center text-xs flex-shrink-0`}>{role.icon}</span>
                            <div className="flex-1 min-w-0">
                              <span className="text-xs font-semibold text-slate-900 dark:text-white block truncate">{role.name || role.key}</span>
                              <span className="text-[10px] text-slate-500 truncate">{role.title}</span>
                            </div>
                            {vote && (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ring-1 flex-shrink-0 ${vt.pill}`}>{vt.icon} {vt.label} · {vote.confidence}%</span>
                            )}
                            <svg className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 group-open:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                          </summary>
                          <div className="px-4 sm:px-5 py-3 bg-white dark:bg-white/[0.01] border-t border-slate-100 dark:border-white/[0.04]">
                            <div className="prose prose-xs prose-slate dark:prose-invert max-w-none text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayText || "_No analysis available._"}</ReactMarkdown>
                            </div>
                          </div>
                        </details>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
