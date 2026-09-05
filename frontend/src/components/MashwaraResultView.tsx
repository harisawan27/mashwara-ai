/**
 * MashwaraResultView — Universal consultation presentation component.
 * Reused across:
 * 1. Live MeetingCanvas slide-over
 * 2. Standalone SharedMashwaraPage (/m/:shareId)
 * 3. Dedicated Print/PDF export mode (sequential, all sections fully expanded)
 *
 * Implements semantic HTML for accessibility and crawler/AI readability.
 */

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import AgentStream from "./AgentStream";
import { useTranslation } from "../i18n";
import type { RoleInfo, SharedMashwaraExpert } from "../api/client";

export interface MashwaraResultViewProps {
  report?: any;
  streams?: Record<string, { status: "idle" | "thinking" | "done" | "waiting"; thinking: string; text: string }>;
  rolesInfo?: RoleInfo[];
  experts?: SharedMashwaraExpert[];
  template: string;
  decisionTitle?: string;
  isProcessing?: boolean;
  activeTab?: "deliberation" | "report";
  onTabChange?: (tab: "deliberation" | "report") => void;
  mode?: "interactive" | "export";
  customT?: any;
  language?: string;
}

function token(key: string | undefined, t: any) {
  const k = (key || "").toUpperCase();
  if (k === "YES" || k === "APPROVE") {
    return {
      label: t.votes.approve,
      icon: "✓",
      pill: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-emerald-500/30",
      bar: "bg-emerald-500",
      glow: "shadow-emerald-500/20",
      ring: "stroke-emerald-500",
    };
  }
  if (k === "NO" || k === "REJECT") {
    return {
      label: t.votes.reject,
      icon: "✗",
      pill: "bg-red-500/15 text-red-600 dark:text-red-400 ring-red-500/30",
      bar: "bg-red-500",
      glow: "shadow-red-500/20",
      ring: "stroke-red-500",
    };
  }
  return {
    label: t.votes.defer,
    icon: "⏸",
    pill: "bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-amber-500/30",
    bar: "bg-amber-500",
    glow: "shadow-amber-500/20",
    ring: "stroke-amber-500",
  };
}

/**
 * Subdivides long analysis text into smaller semantic blocks
 * to allow natural multi-page pagination before falling back to canvas slicing.
 */
function splitAnalysisIntoBlocks(text: string, maxChunkLen: number = 750): string[] {
  if (!text || text.length <= maxChunkLen) {
    return [text || ""];
  }

  const rawSections = text.split(/(?=\n#{1,4}\s)|\n\n+/);
  const blocks: string[] = [];
  let currentChunk = "";

  for (const part of rawSections) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    if (currentChunk.length + trimmed.length > maxChunkLen && currentChunk.length > 0) {
      blocks.push(currentChunk.trim());
      currentChunk = trimmed;
    } else {
      currentChunk = currentChunk ? `${currentChunk}\n\n${trimmed}` : trimmed;
    }
  }

  if (currentChunk.trim()) {
    blocks.push(currentChunk.trim());
  }

  return blocks.length > 0 ? blocks : [text];
}

function ConfidenceRing({ value, colorClass }: { value: number; colorClass: string }) {
  const r = 44;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  return (
    <svg width="110" height="110" className="-rotate-90 drop-shadow-lg" aria-hidden="true">
      <circle cx="55" cy="55" r={r} fill="none" stroke="currentColor" strokeWidth="7" className="text-slate-200 dark:text-slate-800" />
      <circle
        cx="55"
        cy="55"
        r={r}
        fill="none"
        strokeWidth="7"
        strokeLinecap="round"
        className={colorClass}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 1.4s ease-out" }}
      />
    </svg>
  );
}

function VoteTally({ votes, t }: { votes: Record<string, { vote: string; confidence: number }>; t: any }) {
  const counts = { YES: 0, NO: 0, DEFER: 0 };
  Object.values(votes || {}).forEach((v) => {
    const k = (v.vote || "").toUpperCase();
    if (k === "YES" || k === "APPROVE") counts.YES++;
    else if (k === "NO" || k === "REJECT") counts.NO++;
    else counts.DEFER++;
  });
  const total = counts.YES + counts.NO + counts.DEFER;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  return (
    <div className="space-y-2" aria-label={t.canvas.boardVotes}>
      {(
        [
          [t.votes.approve, counts.YES, "bg-emerald-500", "text-emerald-600 dark:text-emerald-400"],
          [t.votes.reject, counts.NO, "bg-red-500", "text-red-600 dark:text-red-400"],
          [t.votes.defer, counts.DEFER, "bg-amber-500", "text-amber-600 dark:text-amber-400"],
        ] as const
      ).map(([label, n, barCls, txtCls]) => (
        <div key={label} className="flex items-center gap-3">
          <span className={`text-[10px] font-bold w-16 truncate ${txtCls}`}>{label}</span>
          <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${barCls}`} style={{ width: `${pct(n)}%` }} />
          </div>
          <span className="text-[10px] text-slate-500 w-6 text-right">{n}</span>
        </div>
      ))}
    </div>
  );
}

export default function MashwaraResultView({
  report,
  streams,
  rolesInfo,
  experts,
  template,
  decisionTitle,
  isProcessing = false,
  activeTab = "deliberation",
  onTabChange,
  mode = "interactive",
  customT,
  language: propLanguage,
}: MashwaraResultViewProps) {
  const defaultI18n = useTranslation();
  const t = customT || defaultI18n.t;
  const currentLanguage = propLanguage || defaultI18n.language || "roman-ur";

  const isExportMode = mode === "export";

  // Normalize roles: prioritize rolesInfo, fallback to experts array from snapshot
  const roles: any[] =
    rolesInfo && rolesInfo.length > 0
      ? rolesInfo.filter((r: any) => r.key !== "Moderator" && r.key !== "lead_advisor" && !r.is_moderator)
      : (experts || []).map((e) => ({
          key: e.role_id,
          role_id: e.role_id,
          name: e.name,
          title: e.title,
          description: e.description,
          icon: e.icon || "👔",
          color: e.color || "from-blue-500 to-blue-700",
        }));

  const moderator = rolesInfo?.find((r: any) => r.key === "Moderator" || r.key === "lead_advisor" || r.is_moderator);

  // Normalize streams: prioritize streams prop, fallback to experts analysis
  const effectiveStreams: Record<string, { status: "idle" | "thinking" | "done" | "waiting"; thinking: string; text: string }> =
    streams || {};
  if (!streams && experts) {
    experts.forEach((e) => {
      effectiveStreams[e.role_id] = {
        status: "done",
        thinking: "",
        text: e.analysis || "",
      };
    });
  }

  const activeStreams = Object.keys(effectiveStreams).filter(
    (k) => k !== "_roles" && effectiveStreams[k]?.status !== "idle"
  );
  const doneCount = activeStreams.filter((k) => effectiveStreams[k]?.status === "done").length;
  const totalAgents = roles.length;
  const decStyle = token(report?.final_decision, t);
  const hasReport = !!report;

  const templateLabel =
    t.templates[template]?.name || template.replace(/_BOARD$/, "").replace(/_/g, " ");
  const displayDecisionTitle = decisionTitle || t.canvas.boardMeeting;

  // ───────────────────────────────────────────────────────────────────────────
  // Sub-section: Mahireen ki Raaye (Expert Deliberations)
  // ───────────────────────────────────────────────────────────────────────────
  const renderDeliberationSection = () => (
    <section aria-labelledby="section-mahireen-heading" className="space-y-4">
      {isExportMode && (
        <div className="pb-3 mb-2 border-b border-slate-200 dark:border-white/10 flex items-center gap-2">
          <span className="text-xl">👥</span>
          <h2 id="section-mahireen-heading" className="text-lg font-bold text-slate-900 dark:text-white">
            {t.share.mahireenKiRaaye}
          </h2>
        </div>
      )}

      {/* Empty loading state (only for live interactive session) */}
      {!isExportMode && (!effectiveStreams || activeStreams.length === 0) && isProcessing && (
        <div className="flex flex-col items-center justify-center gap-4 mt-16 text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center text-2xl animate-pulse">
            🏛️
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">{t.canvas.callingToOrder}</p>
            <p className="text-xs text-slate-500 mt-1">{t.canvas.agentsBriefing}</p>
          </div>
        </div>
      )}

      {/* Progress bar (only for interactive sessions with processing) */}
      {!isExportMode && totalAgents > 0 && isProcessing && (
        <div className="flex items-center gap-3 py-2">
          <span className="text-[11px] text-slate-500 whitespace-nowrap">
            {doneCount}/{totalAgents} {t.canvas.agentsComplete}
          </span>
          <div className="flex-1 h-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${totalAgents ? (doneCount / totalAgents) * 100 : 0}%` }}
            />
          </div>
          <span className="text-[11px] text-blue-500 font-medium whitespace-nowrap">{t.canvas.inProgress}</span>
        </div>
      )}

      {/* Grid of Expert Cards */}
      {(activeStreams.length > 0 || isExportMode) && (
        <div className={`grid grid-cols-1 ${isExportMode ? "gap-4" : "sm:grid-cols-2 gap-3"}`}>
          {roles.map((role: any) => {
            const stream = effectiveStreams[role.key];
            if (!stream && !isExportMode) return null;

            const vote = report?.board_votes?.[role.key];
            const expertSnapshot = experts?.find((e) => e.role_id === role.key);
            const effectiveVote = vote || (expertSnapshot ? { vote: expertSnapshot.vote, confidence: expertSnapshot.confidence } : undefined);

            // In export mode: render static fully-expanded card with full selectable text
            if (isExportMode) {
              const vs = token(effectiveVote?.vote, t);
              const cleanText = (stream?.text || expertSnapshot?.analysis || "")
                .replace(/<think>[\s\S]*?<\/think>/gi, "")
                .replace(/^\s*\*?\*?Final Analysis:\*?\*?\s*/i, "")
                .trim();

              return (
                <article
                  key={role.key}
                  data-role-id={role.key}
                  className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0d1020] p-4 shadow-sm break-inside-avoid page-break-inside-avoid"
                >
                  <header className="flex items-start justify-between gap-3 pb-3 mb-3 border-b border-slate-100 dark:border-white/5">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${role.color} flex items-center justify-center text-sm flex-shrink-0 shadow-sm mt-0.5`}>
                        {role.icon}
                      </div>
                      <div className="min-w-0 text-start flex flex-col gap-0.5">
                        <h3 className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
                          {t.agents[role.key]?.title || role.name || role.key}
                        </h3>
                        <p className="text-[10px] text-slate-500 leading-tight">
                          {t.agents[role.key]?.role || role.title}
                        </p>
                        {effectiveVote && (
                          <div className="mt-1 flex items-center">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded ring-1 ${vs.pill}`}>
                              {vs.icon} {vs.label} · {effectiveVote.confidence}%
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </header>
                  <div className="prose prose-xs prose-slate dark:prose-invert max-w-none text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanText || `_${t.canvas.noAnalysis}_`}</ReactMarkdown>
                  </div>
                </article>
              );
            }

            // Interactive mode: use AgentStream component
            return (
              <article key={role.key} data-role-id={role.key}>
                <AgentStream
                  role={role}
                  thinking={stream?.thinking || ""}
                  text={stream?.text || expertSnapshot?.analysis || ""}
                  status={stream?.status || "done"}
                  voteData={effectiveVote}
                />
              </article>
            );
          })}

          {/* Moderator (if present in streams) */}
          {moderator && effectiveStreams[moderator.key] && effectiveStreams[moderator.key].status !== "idle" && (
            <div className="sm:col-span-2">
              <AgentStream
                role={moderator}
                thinking={effectiveStreams[moderator.key].thinking}
                text={effectiveStreams[moderator.key].text}
                status={effectiveStreams[moderator.key].status}
                isModerator
              />
            </div>
          )}
        </div>
      )}

      {/* Prompt to switch to report when ready (in live interactive mode) */}
      {!isExportMode && hasReport && doneCount === totalAgents && totalAgents > 0 && onTabChange && (
        <div
          onClick={() => onTabChange("report")}
          className="mt-2 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-blue-500/10 to-indigo-500/10 dark:from-blue-500/20 dark:to-indigo-500/20 border border-blue-500/20 cursor-pointer hover:from-blue-500/20 hover:to-indigo-500/20 transition-all"
        >
          <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">{t.canvas.viewReportReady}</span>
          <svg className="w-3.5 h-3.5 text-blue-500 rtl:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </div>
      )}
    </section>
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Sub-section: Mashwara Report
  // ───────────────────────────────────────────────────────────────────────────
  const renderReportSection = () => {
    if (!hasReport) return null;

    return (
      <section aria-labelledby="section-report-heading" className="space-y-5">
        {isExportMode && (
          <div className="pb-3 mb-2 border-b border-slate-200 dark:border-white/10 flex items-center gap-2">
            <span className="text-xl">⚖️</span>
            <h2 id="section-report-heading" className="text-lg font-bold text-slate-900 dark:text-white">
              {t.share.mashwaraReport}
            </h2>
          </div>
        )}

        {/* Hero decision card */}
        <div
          className={`rounded-2xl p-5 sm:p-7 bg-gradient-to-br border ring-1 ${
            decStyle.pill.includes("emerald")
              ? "from-emerald-50 to-white dark:from-emerald-950/30 dark:to-transparent border-emerald-200 dark:border-emerald-500/20 ring-emerald-500/10"
              : decStyle.pill.includes("red")
              ? "from-red-50 to-white dark:from-red-950/30 dark:to-transparent border-red-200 dark:border-red-500/20 ring-red-500/10"
              : "from-amber-50 to-white dark:from-amber-950/30 dark:to-transparent border-amber-200 dark:border-amber-500/20 ring-amber-500/10"
          } shadow-lg ${decStyle.glow} break-inside-avoid page-break-inside-avoid`}
        >
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
            {/* Confidence ring */}
            <div className="relative flex-shrink-0">
              <ConfidenceRing value={report.confidence_score ?? 0} colorClass={decStyle.ring} />
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className={`text-2xl font-extrabold ${decStyle.pill.split(" ")[1]}`}>
                  {report.confidence_score}%
                </span>
                <span className="text-[9px] text-slate-500 uppercase tracking-wider">{t.canvas.confidence}</span>
              </div>
            </div>
            {/* Text info */}
            <div className="flex-1 text-center sm:text-start">
              <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">
                {templateLabel} • {t.canvas.boardDecision}
              </p>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white mb-3 leading-snug">
                {report.decision_title || displayDecisionTitle}
              </h1>
              <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold ring-1 ${decStyle.pill}`}>
                <span>{decStyle.icon}</span>
                {decStyle.label}
              </span>
            </div>
          </div>

          {/* Vote tally */}
          {report.board_votes && Object.keys(report.board_votes).length > 0 && (
            <div className="mt-6 pt-5 border-t border-slate-200 dark:border-white/[0.06]">
              <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-3 font-semibold">
                {t.canvas.boardVotes}
              </p>
              <div className="flex flex-wrap gap-2 mb-4">
                {Object.entries(report.board_votes).map(([agent, v]: any) => {
                  const vt = token(v.vote, t);
                  return (
                    <div
                      key={agent}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ring-1 bg-white/50 dark:bg-white/[0.04] ${vt.pill} text-[11px] font-semibold`}
                    >
                      <span>{vt.icon}</span>
                      <span className="text-slate-700 dark:text-slate-300">
                        {roles.find((r) => r.key === agent)?.name || t.agents[agent]?.title || agent}
                      </span>
                      <span className="text-slate-400 font-normal">{v.confidence}%</span>
                    </div>
                  );
                })}
              </div>
              <VoteTally votes={report.board_votes} t={t} />
            </div>
          )}
        </div>

        {/* Consensus summary */}
        {report.debate_summary && (
          <article className="rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.06] p-4 sm:p-5 break-inside-avoid page-break-inside-avoid">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-3">
              {t.canvas.consensusSummary}
            </p>
            <div className="prose prose-sm prose-slate dark:prose-invert max-w-none text-slate-700 dark:text-slate-300 leading-relaxed border-l-2 rtl:border-l-0 rtl:border-r-2 border-blue-400/40 pl-4 rtl:pl-0 rtl:pr-4">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.debate_summary}</ReactMarkdown>
            </div>
          </article>
        )}

        {/* Where Experts Agree & Disagree */}
        {(report.agreement || report.disagreement) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {report.agreement && (
              <div className="rounded-xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-500/15 p-4 sm:p-5 break-inside-avoid page-break-inside-avoid">
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="text-sm">🤝</span>
                  <p className="text-[10px] text-blue-700 dark:text-blue-300 uppercase tracking-widest font-bold">
                    {t.canvas?.agreement || "Where Experts Agree"}
                  </p>
                </div>
                <div className="prose prose-xs prose-slate dark:prose-invert max-w-none text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.agreement}</ReactMarkdown>
                </div>
              </div>
            )}
            {report.disagreement && (
              <div className="rounded-xl bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200/60 dark:border-purple-500/15 p-4 sm:p-5 break-inside-avoid page-break-inside-avoid">
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="text-sm">⚡</span>
                  <p className="text-[10px] text-purple-700 dark:text-purple-300 uppercase tracking-widest font-bold">
                    {t.canvas?.disagreement || "Where Experts Disagree"}
                  </p>
                </div>
                <div className="prose prose-xs prose-slate dark:prose-invert max-w-none text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.disagreement}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Risks + Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Key Risks */}
          {report.key_risks?.length > 0 && (
            <div className="rounded-xl bg-red-50/60 dark:bg-red-950/20 border border-red-200/60 dark:border-red-500/15 p-4 sm:p-5 break-inside-avoid page-break-inside-avoid">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-5 h-5 rounded-md bg-red-100 dark:bg-red-500/20 flex items-center justify-center">
                  <svg className="w-3 h-3 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <p className="text-[10px] text-red-600 dark:text-red-400 uppercase tracking-widest font-bold">
                  {t.canvas.keyRisks}
                </p>
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
            <div className="rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-500/15 p-4 sm:p-5 break-inside-avoid page-break-inside-avoid">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-5 h-5 rounded-md bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center">
                  <svg className="w-3 h-3 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase tracking-widest font-bold">
                  {t.canvas.recommendedActions}
                </p>
              </div>
              <ol className="space-y-2">
                {report.recommended_actions.map((action: string, i: number) => (
                  <li key={i} className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    <span className="flex-shrink-0 w-4 h-4 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[9px] font-bold flex items-center justify-center mt-0.5">
                      {i + 1}
                    </span>
                    {action}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        {/* Assumptions (if available) */}
        {report.assumptions?.length > 0 && (
          <div className="rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.06] p-4 sm:p-5 break-inside-avoid page-break-inside-avoid">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-2">
              Important Assumptions
            </p>
            <ul className="space-y-1.5">
              {report.assumptions.map((item: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* What would change this recommendation (if available) */}
        {report.what_would_change && (
          <div className="rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-500/15 p-4 sm:p-5 break-inside-avoid page-break-inside-avoid">
            <p className="text-[10px] text-amber-600 dark:text-amber-400 uppercase tracking-widest font-bold mb-2">
              What Could Change This Recommendation
            </p>
            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              {report.what_would_change}
            </p>
          </div>
        )}

        {/* Agent mini-votes accordion in report view */}
        {roles.length > 0 && !isExportMode && (
          <div className="rounded-xl border border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-white/[0.02] overflow-hidden">
            <p className="px-4 sm:px-5 py-3 text-[10px] text-slate-500 uppercase tracking-widest font-bold border-b border-slate-200 dark:border-white/[0.06]">
              {t.canvas.agentAnalyses}
            </p>
            <div className="divide-y divide-slate-200 dark:divide-white/[0.04]">
              {roles.map((role: any) => {
                const stream = effectiveStreams[role.key];
                const vote = report?.board_votes?.[role.key];
                const vt = token(vote?.vote, t);
                const displayText = (stream?.text || "")
                  .replace(/<think>[\s\S]*?<\/think>/gi, "")
                  .replace(/^\s*\*?\*?Final Analysis:\*?\*?\s*/i, "")
                  .trim();
                if (!displayText && !vote) return null;

                return (
                  <details key={role.key} className="group">
                    <summary className="flex items-center gap-3 px-4 sm:px-5 py-3 cursor-pointer hover:bg-slate-100 dark:hover:bg-white/[0.03] transition-colors list-none">
                      <span className={`w-7 h-7 rounded-md bg-gradient-to-br ${role.color} flex items-center justify-center text-xs flex-shrink-0`}>
                        {role.icon}
                      </span>
                      <div className="flex-1 min-w-0 text-start">
                        <span className="text-xs font-semibold text-slate-900 dark:text-white block truncate">
                          {t.agents[role.key]?.title || role.name || role.key}
                        </span>
                        <span className="text-[10px] text-slate-500 truncate">
                          {t.agents[role.key]?.role || role.title}
                        </span>
                      </div>
                      {vote && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ring-1 flex-shrink-0 ${vt.pill}`}>
                          {vt.icon} {vt.label} · {vote.confidence}%
                        </span>
                      )}
                      <svg className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 group-open:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </summary>
                    <div className="px-4 sm:px-5 py-3 bg-white dark:bg-white/[0.01] border-t border-slate-100 dark:border-white/[0.04]">
                      <div className="prose prose-xs prose-slate dark:prose-invert max-w-none text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayText || `_${t.canvas.noAnalysis}_`}</ReactMarkdown>
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
        )}
      </section>
    );
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Export Mode: Sequential rendering of BOTH sections without tabs
  // ───────────────────────────────────────────────────────────────────────────
  if (isExportMode) {
    const isUrdu = currentLanguage === "ur";
    const leadAdvisorStream = moderator ? effectiveStreams[moderator.key] : null;
    const leadAdvisorText = (leadAdvisorStream?.text || "")
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/^\s*\*?\*?Final Analysis:\*?\*?\s*/i, "")
      .trim();

    return (
      <div
        dir={isUrdu ? "rtl" : "ltr"}
        className={`p-6 space-y-4 bg-white text-slate-900 w-[800px] mx-auto ${isUrdu ? "font-urdu" : ""}`}
      >
        {/* 1. Header: Mashwara AI */}
        <header
          data-pdf-section="header"
          className="flex items-center justify-between gap-4 p-5 rounded-2xl border border-slate-200 bg-slate-50 shadow-sm"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center p-2 shadow-sm">
              <img src="/boardroom-ai.svg" alt="Mashwara AI" className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold text-slate-900 tracking-tight font-sans" dir="ltr">
                  Mashwara AI
                </h1>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                  {templateLabel}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {isUrdu ? "ماہرانہ مشاورتی کونسل رپورٹ" : "AI Consultation & Deliberation Intelligence Report"}
              </p>
            </div>
          </div>
          {report?.final_decision && (
            <span className={`inline-flex items-center gap-1.5 text-xs font-extrabold px-3.5 py-1.5 rounded-full border shadow-sm ${decStyle.pill}`}>
              {decStyle.icon} {decStyle.label} ({report?.confidence_score}%)
            </span>
          )}
        </header>

        {/* 2. Decision / User Question */}
        <div
          data-pdf-section="question"
          className="p-5 rounded-2xl border border-slate-200 bg-white shadow-sm"
        >
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1.5">
            {isUrdu ? "زیرِ غور فیصلہ / سوال" : "Decision / User Question"}
          </p>
          <h2 className="text-base font-extrabold text-slate-900 leading-snug">
            {displayDecisionTitle}
          </h2>
        </div>

        {/* 3. Section Heading: Mahireen ki Raaye */}
        <div
          data-pdf-section="experts-heading"
          className="pt-2 pb-1 border-b-2 border-slate-200 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">👥</span>
            <h2 className="text-sm font-extrabold text-slate-900">
              {t.share.mahireenKiRaaye}
            </h2>
          </div>
          <span className="text-xs font-semibold text-slate-500">
            {roles.length} {isUrdu ? "ماہرین" : "Specialists"}
          </span>
        </div>

        {/* 4. Expert 1 to 6 Analysis Cards (All Expanded & Semantic Paginatable Blocks) */}
        {roles.map((role: any, idx: number) => {
          const stream = effectiveStreams[role.key] || effectiveStreams[role.role_id];
          const vote = report?.board_votes?.[role.key] || report?.board_votes?.[role.role_id];
          const expertSnapshot = experts?.find((e) => e.role_id === role.key || e.role_id === role.role_id);
          const effectiveVote =
            vote || (expertSnapshot ? { vote: expertSnapshot.vote, confidence: expertSnapshot.confidence } : undefined);
          const vs = token(effectiveVote?.vote, t);
          const cleanText = (stream?.text || expertSnapshot?.analysis || "")
            .replace(/<think>[\s\S]*?<\/think>/gi, "")
            .replace(/^\s*\*?\*?Final Analysis:\*?\*?\s*/i, "")
            .trim();

          const sectionKey = `expert-${role.key || role.role_id || idx + 1}`;
          const analysisBlocks = splitAnalysisIntoBlocks(cleanText);

          return (
            <React.Fragment key={role.key || role.role_id || idx}>
              {/* Primary Expert Card: Header, vote, badge, and primary semantic block */}
              <article
                data-pdf-section={sectionKey}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3"
              >
                <header className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${role.color} flex items-center justify-center text-sm flex-shrink-0 shadow-sm text-white mt-0.5`}>
                      {role.icon}
                    </div>
                    <div className="min-w-0 text-start flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 flex-shrink-0">
                          #{idx + 1}
                        </span>
                        <h3 className="text-xs font-bold text-slate-900 leading-snug">
                          {t.agents[role.key]?.title || role.name || role.key}
                        </h3>
                      </div>
                      <p className="text-[10px] text-slate-500 leading-tight">
                        {t.agents[role.key]?.role || role.title}
                      </p>
                      {effectiveVote && (
                        <div className="mt-1 flex items-center">
                          <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-lg border shadow-sm ${vs.pill}`}>
                            {vs.icon} {vs.label} · {effectiveVote.confidence}%
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </header>
                <div className="prose prose-xs prose-slate max-w-none text-xs text-slate-700 leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {analysisBlocks[0] || `_${t.canvas.noAnalysis}_`}
                  </ReactMarkdown>
                </div>
              </article>

              {/* Naturally paginated continuation blocks if analysis is oversized */}
              {analysisBlocks.slice(1).map((block, bIdx) => (
                <div
                  key={`${sectionKey}-cont-${bIdx}`}
                  data-pdf-section={`${sectionKey}-part-${bIdx + 2}`}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm border-l-4 border-l-blue-500 space-y-2"
                >
                  <div className="text-[10px] text-slate-400 font-semibold flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    <span>{t.agents[role.key]?.title || role.name || role.key}</span>
                    <span>•</span>
                    <span>{isUrdu ? "تجزیہ (جاری)" : "Analysis (Contd.)"}</span>
                  </div>
                  <div className="prose prose-xs prose-slate max-w-none text-xs text-slate-700 leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{block}</ReactMarkdown>
                  </div>
                </div>
              ))}
            </React.Fragment>
          );
        })}

        {/* Lead Musheer / relevant synthesis if appropriate */}
        {leadAdvisorText && (() => {
          const leadBlocks = splitAnalysisIntoBlocks(leadAdvisorText);
          return (
            <React.Fragment>
              <article
                data-pdf-section="lead-synthesis"
                className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5 shadow-sm space-y-3"
              >
                <header className="flex items-center justify-between gap-3 pb-3 border-b border-indigo-100">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-700 text-white flex items-center justify-center text-sm flex-shrink-0 shadow-sm">
                      ⚖️
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-slate-900">
                        {moderator?.name || (isUrdu ? "لیڈ مشیر" : "Lead Musheer")}
                      </h3>
                      <p className="text-[10px] text-indigo-700">
                        {isUrdu ? "جامع مشاورت اور حتمی خلاصہ" : "Council Synthesis & Deliberation Lead"}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-200">
                    {isUrdu ? "رہنما تلخیص" : "Lead Synthesis"}
                  </span>
                </header>
                <div className="prose prose-xs prose-slate max-w-none text-xs text-slate-700 leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{leadBlocks[0]}</ReactMarkdown>
                </div>
              </article>

              {leadBlocks.slice(1).map((block, bIdx) => (
                <div
                  key={`lead-synthesis-cont-${bIdx}`}
                  data-pdf-section={`lead-synthesis-part-${bIdx + 2}`}
                  className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-4 shadow-sm border-l-4 border-l-indigo-600 space-y-2"
                >
                  <div className="text-[10px] text-indigo-600 font-semibold flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                    <span>{moderator?.name || (isUrdu ? "لیڈ مشیر" : "Lead Musheer")}</span>
                    <span>•</span>
                    <span>{isUrdu ? "خلاصہ (جاری)" : "Synthesis (Contd.)"}</span>
                  </div>
                  <div className="prose prose-xs prose-slate max-w-none text-xs text-slate-700 leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{block}</ReactMarkdown>
                  </div>
                </div>
              ))}
            </React.Fragment>
          );
        })()}

        {/* ──────────────────────── Divider ──────────────────────── */}
        <div data-pdf-section="report-divider" className="py-2 flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-300" />
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest px-2">
            Mashwara Report
          </span>
          <div className="flex-1 h-px bg-slate-300" />
        </div>

        {/* 5. Mashwara Report Section Heading */}
        <div
          data-pdf-section="report-heading"
          className="pt-1 pb-1 border-b-2 border-slate-200 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">📊</span>
            <h2 className="text-sm font-extrabold text-slate-900">
              {t.share.mashwaraReport}
            </h2>
          </div>
          {report?.final_decision && (
            <span className={`text-xs font-extrabold px-3 py-1 rounded-full border ${decStyle.pill}`}>
              {decStyle.icon} {decStyle.label} ({report?.confidence_score}%)
            </span>
          )}
        </div>

        {/* 6. Final Mashwara + Confidence + Expert vote summary */}
        {hasReport && (
          <div
            data-pdf-section="report-final"
            className="rounded-2xl p-5 bg-gradient-to-br from-slate-50 to-white border border-slate-200 shadow-sm space-y-4"
          >
            <div className="flex items-center gap-5">
              <div className="relative flex-shrink-0">
                <ConfidenceRing value={report.confidence_score ?? 0} colorClass={decStyle.ring} />
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className={`text-2xl font-extrabold ${decStyle.pill.split(" ")[1]}`}>
                    {report.confidence_score}%
                  </span>
                  <span className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold">
                    {t.canvas.confidence}
                  </span>
                </div>
              </div>
              <div className="flex-1 text-start">
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-1">
                  {templateLabel} • {t.canvas.boardDecision}
                </p>
                <h3 className="text-base font-extrabold text-slate-900 mb-2">
                  {report.decision_title || displayDecisionTitle}
                </h3>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold border ${decStyle.pill}`}>
                  {decStyle.icon} {decStyle.label}
                </span>
              </div>
            </div>

            {/* Expert Vote Summary */}
            {report.board_votes && Object.keys(report.board_votes).length > 0 && (
              <div className="pt-3 border-t border-slate-200">
                <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2 font-bold">
                  {t.canvas.boardVotes}
                </p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {Object.entries(report.board_votes).map(([agent, v]: any) => {
                    const vt = token(v.vote, t);
                    return (
                      <div
                        key={agent}
                        className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg border bg-white ${vt.pill} text-[10px] font-semibold`}
                      >
                        <span>{vt.icon}</span>
                        <span className="text-slate-700">
                          {roles.find((r) => r.key === agent)?.name || t.agents[agent]?.title || agent}
                        </span>
                        <span className="text-slate-400 font-normal">{v.confidence}%</span>
                      </div>
                    );
                  })}
                </div>
                <VoteTally votes={report.board_votes} t={t} />
              </div>
            )}
          </div>
        )}

        {/* 7. Consensus / Debate summary */}
        {report?.debate_summary && (
          <article
            data-pdf-section="report-summary"
            className="rounded-2xl bg-slate-50 border border-slate-200 p-5 space-y-2 shadow-sm"
          >
            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
              {t.canvas.consensusSummary}
            </p>
            <div className="prose prose-xs prose-slate max-w-none text-xs text-slate-700 leading-relaxed border-l-2 rtl:border-l-0 rtl:border-r-2 border-blue-400 pl-3 rtl:pl-0 rtl:pr-3">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.debate_summary}</ReactMarkdown>
            </div>
          </article>
        )}

        {/* 8. Where Experts Agree & Where Experts Disagree */}
        {(report?.agreement || report?.disagreement) && (
          <div data-pdf-section="report-agreement-disagreement" className="grid grid-cols-2 gap-4">
            {report.agreement && (
              <div className="rounded-2xl bg-blue-50/70 border border-blue-200 p-4 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">🤝</span>
                  <p className="text-[10px] text-blue-800 uppercase tracking-widest font-bold">
                    {t.canvas?.agreement || "Where Experts Agree"}
                  </p>
                </div>
                <div className="prose prose-xs prose-slate max-w-none text-xs text-slate-700 leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.agreement}</ReactMarkdown>
                </div>
              </div>
            )}
            {report.disagreement && (
              <div className="rounded-2xl bg-purple-50/70 border border-purple-200 p-4 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">⚡</span>
                  <p className="text-[10px] text-purple-800 uppercase tracking-widest font-bold">
                    {t.canvas?.disagreement || "Where Experts Disagree"}
                  </p>
                </div>
                <div className="prose prose-xs prose-slate max-w-none text-xs text-slate-700 leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.disagreement}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 9. Key Risks & Next Steps (Recommended Actions) */}
        {(report?.key_risks?.length > 0 || report?.recommended_actions?.length > 0) && (
          <div data-pdf-section="report-risks-actions" className="grid grid-cols-2 gap-4">
            {report?.key_risks?.length > 0 && (
              <div className="rounded-2xl bg-red-50/70 border border-red-200 p-4 space-y-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">⚠️</span>
                  <p className="text-[10px] text-red-700 uppercase tracking-widest font-bold">
                    {t.canvas.keyRisks}
                  </p>
                </div>
                <ul className="space-y-1.5">
                  {report.key_risks.map((risk: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-700 leading-relaxed">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />
                      {risk}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {report?.recommended_actions?.length > 0 && (
              <div className="rounded-2xl bg-emerald-50/70 border border-emerald-200 p-4 space-y-2.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">✅</span>
                  <p className="text-[10px] text-emerald-700 uppercase tracking-widest font-bold">
                    {t.canvas.recommendedActions}
                  </p>
                </div>
                <ol className="space-y-1.5">
                  {report.recommended_actions.map((act: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-700 leading-relaxed">
                      <span className="flex-shrink-0 w-4 h-4 rounded-full bg-emerald-200 text-emerald-800 text-[9px] font-bold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      {act}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}

        {/* 10. Assumptions & What Could Change */}
        {(report?.assumptions?.length > 0 || report?.what_would_change) && (
          <div data-pdf-section="report-assumptions-changes" className="space-y-3">
            {report?.assumptions?.length > 0 && (
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-1.5">
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
                  {isUrdu ? "اہم مفروضات" : "Important Assumptions"}
                </p>
                <ul className="space-y-1">
                  {report.assumptions.map((item: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-600 leading-relaxed">
                      <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {report?.what_would_change && (
              <div className="rounded-2xl bg-amber-50/70 border border-amber-200 p-4 space-y-1.5">
                <p className="text-[10px] text-amber-700 uppercase tracking-widest font-bold">
                  {isUrdu ? "کیا چیز اس تجویز کو بدل سکتی ہے؟" : "What Could Change This Recommendation"}
                </p>
                <p className="text-xs text-slate-700 leading-relaxed">
                  {report.what_would_change}
                </p>
              </div>
            )}
          </div>
        )}

        {/* 11. Footer Watermark */}
        <footer
          data-pdf-section="footer"
          className="pt-3 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-400"
        >
          <span>🏛️ Mashwara AI • AI-Powered Consultation Intelligence</span>
          <span>https://mashwara.ai</span>
        </footer>
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Interactive Mode: Tab-based navigation
  // ───────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 pb-24">
      {activeTab === "deliberation" && renderDeliberationSection()}
      {activeTab === "report" && renderReportSection()}
    </div>
  );
}
