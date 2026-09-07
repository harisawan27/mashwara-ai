/**
 * MeetingCanvas — Premium board meeting canvas
 * Full-screen slide-over with tabbed Report / Deliberation views.
 * Refactored to delegate presentation to reusable MashwaraResultView,
 * with Share Mashwara link creation and vector PDF export.
 */

import { useState } from "react";
import { useTranslation } from "../i18n";
import { useAuthStore } from "../store/authStore";
import { createSharedMashwara, type RoleInfo } from "../api/client";
import MashwaraResultView from "./MashwaraResultView";
import { exportMashwaraPdf } from "../utils/pdfExport";
import { isVisibleExpert } from "../utils/roleVisibility";

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
  rolesInfo?: RoleInfo[];
  meetingId?: string;
}

function token(key: string | undefined, t: any) {
  const k = (key || "").toUpperCase();
  if (k === "YES" || k === "APPROVE") {
    return {
      label: t.votes.approve,
      icon: "✓",
      pill: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-emerald-500/30",
    };
  }
  if (k === "NO" || k === "REJECT") {
    return {
      label: t.votes.reject,
      icon: "✗",
      pill: "bg-red-500/15 text-red-600 dark:text-red-400 ring-red-500/30",
    };
  }
  return {
    label: t.votes.defer,
    icon: "⏸",
    pill: "bg-amber-500/15 text-amber-600 dark:text-amber-400 ring-amber-500/30",
  };
}

export default function MeetingCanvas({
  isOpen,
  onClose,
  report,
  streams,
  isProcessing,
  template,
  decisionTitle,
  rolesInfo,
  meetingId,
}: MeetingCanvasProps) {
  const [tab, setTab] = useState<"report" | "deliberation">("deliberation");
  const { t, language } = useTranslation();
  const tokenVal = useAuthStore((state) => state.token);

  // Sharing state
  const [isSharing, setIsSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isGuestConfirmOpen, setIsGuestConfirmOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [exportStage, setExportStage] = useState<"idle" | "preparing" | "capturing" | "assembling" | "saving" | "downloaded">("idle");
  const [exportError, setExportError] = useState<string | null>(null);

  if (!isOpen) return null;

  const defaultTitle = t.report?.consultationTitle || t.share.mashwaraReport || t.canvas.boardMeeting;
  const displayDecisionTitle = (!decisionTitle || decisionTitle === "Mashwara Consultation" || decisionTitle === "Board Meeting" || decisionTitle === "مشاورتی رپورٹ")
    ? defaultTitle
    : decisionTitle;
  const hasReport = !!report;
  const decStyle = token(report?.final_decision, t);
  const templateLabel = t.templates[template]?.name || template.replace(/_BOARD$/, "").replace(/_/g, " ");

  const roles = rolesInfo?.filter(isVisibleExpert) || [];
  const activeStreams = streams ? Object.keys(streams).filter((k) => k !== "_roles" && isVisibleExpert({ key: k }) && streams[k]?.status !== "idle") : [];
  const doneCount = activeStreams.filter((k) => streams![k]?.status === "done").length;
  const totalAgents = roles.length;

  const executeShare = async () => {
    setIsSharing(true);
    setShareError(null);
    try {
      let payload: any = {
        language: language,
        decision_title: displayDecisionTitle,
      };

      const effMeetingId = meetingId || report?.meeting_id;
      if (tokenVal && effMeetingId) {
        payload.meeting_id = effMeetingId;
      } else {
        payload.snapshot = {
          decision_title: displayDecisionTitle,
          language: language,
          template: template,
          roles: rolesInfo || [],
          streams: streams || {},
          report: report || {},
        };
      }

      const res = await createSharedMashwara(payload);
      const fullUrl = `${window.location.origin}/m/${res.share_id}`;
      setShareUrl(fullUrl);
      setIsShareModalOpen(true);

      // Auto-copy to clipboard if supported
      try {
        await navigator.clipboard.writeText(fullUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      } catch {
        // Clipboard write may fail silently in some contexts
      }
    } catch (err) {
      console.error("Failed to share mashwara:", err);
      setShareError(t.share.shareFailed);
      setTimeout(() => setShareError(null), 6000);
    } finally {
      setIsSharing(false);
      setIsGuestConfirmOpen(false);
    }
  };

  const handleShareClick = () => {
    // Guest user requires explicit confirmation notice before saving snapshot
    if (!tokenVal) {
      setIsGuestConfirmOpen(true);
    } else {
      executeShare();
    }
  };

  const handleExportPdf = async () => {
    if (exportStage !== "idle") return;
    setExportStage("preparing");
    setExportError(null);
    try {
      await exportMashwaraPdf(displayDecisionTitle, {
        elementId: "mashwara-canvas-export",
        onProgress: (stage) => {
          setExportStage(stage);
        },
        onError: (err) => {
          console.error("[PDF Export Technical Error]", err);
        },
      });

      // Show downloaded checkmark for 1.8 seconds after pdf.save() triggers
      setExportStage("downloaded");
      setTimeout(() => {
        setExportStage("idle");
      }, 1800);
    } catch (err: any) {
      console.error("Failed to export PDF:", err);
      setExportStage("idle");
      const fallbackMsg =
        language === "ur"
          ? "PDF تیار نہیں ہو سکی۔ دوبارہ کوشش کریں۔"
          : language === "en"
          ? "PDF couldn't be generated. Please try again."
          : "PDF download nahi ho saka. Dobara try karein.";
      const msg = t.share?.pdfExportError || fallbackMsg;
      setExportError(msg);
      setTimeout(() => setExportError(null), 5000);
    }
  };

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
              <img src="/boardroom-ai.svg" alt="Mashwara AI Logo" className="w-full h-full object-contain" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate">{displayDecisionTitle}</h2>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">{templateLabel}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Live progress pill */}
            {isProcessing ? (
              <span className="hidden sm:flex items-center gap-1.5 text-[11px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-2.5 py-1 rounded-full ring-1 ring-blue-500/20">
                <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {doneCount}/{totalAgents} {t.canvas.complete}
              </span>
            ) : hasReport ? (
              <>
                <span className={`hidden sm:flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ring-1 ${decStyle.pill}`}>
                  {decStyle.icon} {decStyle.label}
                </span>

                {/* Share Button */}
                <button
                  onClick={handleShareClick}
                  disabled={isSharing}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-blue-50 hover:bg-blue-100 dark:bg-blue-500/10 dark:hover:bg-blue-500/20 border border-blue-500/20 text-blue-600 dark:text-blue-400 transition-all shadow-sm"
                  title={t.share.shareMashwara}
                >
                  {isSharing ? (
                    <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                  )}
                  <span className="hidden sm:inline">{t.share.shareMashwara}</span>
                </button>

                {/* PDF Export Button with Progress Stages */}
                <button
                  onClick={handleExportPdf}
                  disabled={exportStage !== "idle"}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                    exportStage === "downloaded"
                      ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] disabled:opacity-85"
                  }`}
                  title={t.share.exportPdf}
                >
                  {exportStage === "downloaded" ? (
                    <>
                      <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="hidden sm:inline text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                        {t.share.pdfDownloaded || "Download started ✓"}
                      </span>
                    </>
                  ) : exportStage !== "idle" ? (
                    <>
                      <svg className="animate-spin w-3.5 h-3.5 text-blue-500" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span className="text-[11px] text-blue-600 dark:text-blue-400 font-semibold">
                        {exportStage === "saving"
                          ? (t.share.pdfSaving || "Saving...")
                          : exportStage === "preparing"
                          ? (t.share.pdfPreparing || "Preparing PDF...")
                          : (t.share.pdfGenerating || "Generating PDF...")}
                      </span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="hidden sm:inline text-[11px]">{t.share.exportPdf}</span>
                    </>
                  )}
                </button>
              </>
            ) : null}

            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
              aria-label={t.common.close}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Localized Share Error Banner */}
        {shareError && (
          <div className="mx-4 mt-2 px-3.5 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-semibold flex items-center justify-between animate-fade-in">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{shareError}</span>
            </div>
            <button onClick={() => setShareError(null)} className="p-1 hover:opacity-75">✕</button>
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="flex-shrink-0 px-4 sm:px-6 flex gap-1 border-b border-slate-200 dark:border-white/[0.06] bg-white/50 dark:bg-transparent">
          {(["deliberation", "report"] as const).map((tTab) => (
            <button
              key={tTab}
              onClick={() => setTab(tTab)}
              disabled={tTab === "report" && !hasReport}
              className={`relative py-3 px-3 text-xs font-semibold tracking-wide transition-colors capitalize
                ${tab === tTab
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed"
                }`}
            >
              {tTab === "deliberation" ? t.canvas.liveDeliberation : t.canvas.boardReport}
              {tab === tTab && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-t-full" />}
              {tTab === "report" && !hasReport && isProcessing && (
                <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse align-middle" />
              )}
            </button>
          ))}
        </div>

        {/* ── Scroll Content (reusing MashwaraResultView) ── */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <MashwaraResultView
            report={report}
            streams={streams}
            rolesInfo={rolesInfo}
            template={template}
            decisionTitle={decisionTitle}
            isProcessing={isProcessing}
            activeTab={tab}
            onTabChange={(newTab) => setTab(newTab)}
            mode="interactive"
            meetingId={meetingId || report?.meeting_id}
            allowAudio={true}
          />
        </div>
      </div>

      {/* ── Guest Confirmation Modal ── */}
      {isGuestConfirmOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-white dark:bg-[#0e1222] border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center text-xl">
              🔗
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1.5">
                {t.share.guestConfirmTitle}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {t.share.guestSaveNotice}
              </p>
              <p className="text-[11px] text-slate-500 mt-2 italic">
                {t.share.anyoneWithLink}
              </p>
            </div>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setIsGuestConfirmOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
              >
                {t.common.cancel}
              </button>
              <button
                onClick={executeShare}
                disabled={isSharing}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow transition-all"
              >
                {isSharing ? t.common.loading : t.share.guestConfirmButton}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Share Link Success Modal ── */}
      {isShareModalOpen && shareUrl && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-white dark:bg-[#0e1222] border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">✨</span>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {t.share.shareMashwara}
                </h3>
              </div>
              <button
                onClick={() => setIsShareModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              {t.share.anyoneWithLink}
            </p>

            <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="flex-1 bg-transparent text-xs text-slate-800 dark:text-slate-200 focus:outline-none truncate px-1 select-all"
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(shareUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2500);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  copied
                    ? "bg-emerald-600 text-white"
                    : "bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                }`}
              >
                {copied ? t.share.linkCopied : t.share.copyLink}
              </button>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <a
                href={shareUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
              >
                <span>{t.share.openLink}</span>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ── Off-screen DOM Container for High-Fidelity PDF Generation (Never flashes onscreen) ── */}
      <div
        id="mashwara-canvas-export"
        data-mashwara-export="true"
        className="pointer-events-none"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "820px",
          opacity: 0,
          pointerEvents: "none",
          zIndex: -9999,
        }}
        aria-hidden="true"
      >
        <MashwaraResultView
          report={report}
          streams={streams}
          rolesInfo={rolesInfo}
          template={template}
          decisionTitle={displayDecisionTitle}
          mode="export"
          customT={t}
          language={language}
        />
      </div>

      {/* Localized Error Toast if PDF export fails */}
      {exportError && (
        <div className="fixed bottom-6 right-6 z-50 bg-red-600/95 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 text-xs font-bold animate-fade-in border border-red-500 backdrop-blur-md">
          <span className="text-base">⚠️</span>
          <span>{exportError}</span>
        </div>
      )}
    </div>
  );
}
