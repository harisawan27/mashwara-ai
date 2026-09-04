/**
 * SharedMashwaraPage — Public read-only interactive consultation viewer.
 * Route: /m/:shareId
 *
 * Features:
 * - Standalone read-only viewer for completed consultations
 * - Preserves consultation's native language (Urdu RTL, Roman Urdu LTR, English LTR)
 * - Fully interactive: tab switching (Mahireen ki Raaye / Mashwara Report), accordions
 * - Sequential fully-expanded DOM rendering for crisp vector PDF export
 * - Machine-readable JSON-LD structured data and canonical JSON endpoint link
 * - noindex, nofollow robots meta to prevent search engine indexing
 * - Subtle non-intrusive "Start your own Mashwara" CTA
 */

import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { getSharedMashwara, type PublicSharedMashwaraData } from "../api/client";
import MashwaraResultView from "../components/MashwaraResultView";
import { getTranslations, type SupportedLanguage } from "../i18n";
import { exportMashwaraPdf } from "../utils/pdfExport";

export default function SharedMashwaraPage() {
  const { shareId } = useParams<{ shareId: string }>();
  const [data, setData] = useState<PublicSharedMashwaraData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"deliberation" | "report">("report");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!shareId) {
      setError("Invalid share link");
      setLoading(false);
      return;
    }

    let isMounted = true;
    getSharedMashwara(shareId)
      .then((res) => {
        if (isMounted) {
          setData(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.response?.status === 404 ? "not_found" : "failed_to_load");
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [shareId]);

  // Set noindex, nofollow robots meta tag dynamically
  useEffect(() => {
    let meta = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    let created = false;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "robots";
      document.head.appendChild(meta);
      created = true;
    }
    meta.content = "noindex,nofollow";

    return () => {
      if (created && meta && meta.parentNode) {
        meta.parentNode.removeChild(meta);
      }
    };
  }, []);

  // Language resolution: lock to consultation's generated language (do not mutate viewer's localStorage)
  const reportLang = (data?.language as SupportedLanguage) || "roman-ur";
  const t = getTranslations(reportLang);
  const isUrdu = reportLang === "ur";

  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleCopyLink = () => {
    const fullUrl = `${window.location.origin}/m/${shareId}`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleExportPdf = async () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    setExportError(null);
    try {
      await exportMashwaraPdf(data?.decision_title || "Mashwara", {
        elementId: "mashwara-shared-export-content",
        onError: (err) => {
          console.error("[PDF Export Technical Error]", err);
        },
      });
    } catch (err: any) {
      console.error("[PDF Export Failed]", err);
      const fallbackMsg =
        reportLang === "ur"
          ? "PDF تیار نہیں ہو سکی۔ دوبارہ کوشش کریں۔"
          : reportLang === "en"
          ? "PDF couldn't be generated. Please try again."
          : "PDF export nahi ho saka. Dobara try karein.";
      const msg = t.share.pdfExportError || fallbackMsg;
      setExportError(msg);
      setTimeout(() => setExportError(null), 5000);
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Structured JSON-LD representation for AI & crawlers
  const jsonLdPayload = data
    ? {
        "@context": "https://schema.org",
        "@type": "Decision",
        "name": data.decision_title,
        "inLanguage": data.language,
        "datePublished": data.created_at,
        "description": data.snapshot?.report?.debate_summary || "",
        "verdict": data.snapshot?.report?.final_decision || "",
        "confidenceScore": data.snapshot?.report?.confidence_score || 0,
        "experts": (data.snapshot?.experts || []).map((e) => ({
          "@type": "Person",
          "roleName": e.name,
          "jobTitle": e.title,
          "vote": e.vote,
          "confidence": e.confidence,
          "opinion": e.analysis,
        })),
        "keyRisks": data.snapshot?.report?.key_risks || [],
        "recommendedActions": data.snapshot?.report?.recommended_actions || [],
      }
    : null;

  // Loading State
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#070913] flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-900 shadow ring-1 ring-slate-200 dark:ring-white/10 flex items-center justify-center p-2 mb-4 animate-pulse">
          <img src="/boardroom-ai.svg" alt="Mashwara AI Logo" className="w-full h-full object-contain" />
        </div>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Mashwara load ho raha hai...</p>
      </div>
    );
  }

  // Error / Not Found State
  if (error || !data) {
    return (
      <div
        dir={isUrdu ? "rtl" : "ltr"}
        className={`min-h-screen bg-slate-50 dark:bg-[#070913] flex flex-col items-center justify-center p-4 text-center ${isUrdu ? "lang-ur" : ""}`}
      >
        <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center text-2xl mb-4 border border-amber-500/20">
          ⚠️
        </div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white mb-1">{t.share.sharedNotFound}</h1>
        <p className="text-xs text-slate-500 max-w-sm mb-6">{t.share.sharedNotFoundDesc}</p>
        <Link
          to="/"
          className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all"
        >
          {t.share.backToHome}
        </Link>
      </div>
    );
  }

  const snapshot = data.snapshot;

  return (
    <div
      dir={isUrdu ? "rtl" : "ltr"}
      className={`min-h-screen bg-slate-50 dark:bg-[#070913] text-slate-900 dark:text-white ${isUrdu ? "lang-ur" : ""}`}
    >
      {/* Machine-readable canonical API link for crawlers */}
      <link rel="alternate" type="application/json" href={`/api/shared-mashwaras/${data.share_id}`} />

      {/* Embedded structured data (JSON-LD) for non-secret machine discovery */}
      {jsonLdPayload && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdPayload) }}
        />
      )}

      {/* ── Top Navigation Bar (Hidden during Print) ── */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-[#0a0d18]/80 backdrop-blur-md border-b border-slate-200 dark:border-white/10 px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4 print:hidden">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-900 shadow ring-1 ring-slate-200 dark:ring-white/10 flex items-center justify-center p-1.5 flex-shrink-0 group-hover:scale-105 transition-transform">
            <img src="/boardroom-ai.svg" alt="Mashwara AI Logo" className="w-full h-full object-contain" />
          </div>
          <div className="min-w-0">
            <span className="text-xs font-bold text-slate-900 dark:text-white block leading-tight">
              {reportLang === "ur" ? "AI مشورہ" : "Mashwara AI"}
            </span>
          </div>
        </Link>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Copy Link Button */}
          <button
            onClick={handleCopyLink}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              copied
                ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                : "bg-white dark:bg-white/[0.04] border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.08]"
            }`}
            title={t.share.copyLink}
          >
            {copied ? (
              <>
                <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                <span className="hidden sm:inline">{t.share.linkCopied}</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span className="hidden sm:inline">{t.share.copyLink}</span>
              </>
            )}
          </button>

          {/* Export PDF Button */}
          <button
            onClick={handleExportPdf}
            disabled={isExportingPdf}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all"
            title={t.share.exportPdf}
          >
            {isExportingPdf ? (
              <>
                <svg className="animate-spin w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="hidden sm:inline">{t.share.exportingPdf}</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="hidden sm:inline">{t.share.exportPdf}</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* ── Main Interactive Container (Hidden during Print) ── */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 print:hidden">
        {/* Privacy notice banner */}
        <div className="mb-4 px-4 py-2.5 rounded-xl bg-blue-50/60 dark:bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300 text-xs flex items-center gap-2.5">
          <svg className="w-4 h-4 flex-shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="flex-1 leading-relaxed">{t.share.anyoneWithLink}</span>
        </div>

        {/* Tab Selection */}
        <div className="flex gap-2 border-b border-slate-200 dark:border-white/10 mb-6 overflow-x-auto custom-scrollbar">
          <button
            onClick={() => setActiveTab("report")}
            className={`py-3 px-4 text-xs font-bold transition-all relative shrink-0 whitespace-nowrap ${
              activeTab === "report"
                ? "text-blue-600 dark:text-blue-400"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-300"
            }`}
          >
            {t.share.mashwaraReport}
            {activeTab === "report" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full" />
            )}
          </button>

          <button
            onClick={() => setActiveTab("deliberation")}
            className={`py-3 px-4 text-xs font-bold transition-all relative shrink-0 whitespace-nowrap ${
              activeTab === "deliberation"
                ? "text-blue-600 dark:text-blue-400"
                : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-300"
            }`}
          >
            {t.share.mahireenKiRaaye}
            {activeTab === "deliberation" && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600 dark:bg-blue-400 rounded-full" />
            )}
          </button>
        </div>

        {/* Interactive Consultation Content */}
        <div className="bg-white dark:bg-[#0a0d18] rounded-2xl border border-slate-200/80 dark:border-white/[0.08] shadow-sm overflow-hidden">
          <MashwaraResultView
            report={snapshot.report}
            experts={snapshot.experts}
            template={snapshot.template}
            decisionTitle={snapshot.decision_title}
            activeTab={activeTab}
            onTabChange={(newTab) => setActiveTab(newTab)}
            mode="interactive"
            customT={t}
          />
        </div>

        {/* Non-intrusive Call to Action */}
        <footer className="mt-12 mb-16 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2.5 px-6 py-3 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs sm:text-sm font-bold shadow-lg shadow-blue-500/20 hover:scale-[1.02] transition-all"
          >
            <span>🏛️</span>
            <span>{t.share.startYourOwn}</span>
            <svg className={`w-4 h-4 ${isUrdu ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </footer>
      </main>

      {/* ── Off-screen DOM Container for High-Fidelity PDF Generation (Never flashes onscreen) ── */}
      <div
        id="mashwara-shared-export-content"
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
          report={snapshot.report}
          experts={snapshot.experts}
          template={snapshot.template}
          decisionTitle={snapshot.decision_title}
          mode="export"
          customT={t}
          language={reportLang}
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
