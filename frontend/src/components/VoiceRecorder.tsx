/**
 * Mashwara AI — Voice Note Recorder Component (Phase 4)
 * =======================================================
 * WhatsApp-familiar interaction model transformed directly inside composer:
 * 1. Hold Mic: Composer toolbar row becomes full-width recording surface
 * 2. Drag Left (physical dx <= -80px): Slide-to-cancel with zero network upload
 * 3. Drag Up (physical dy <= -65px): Lock hands-free recording
 * 4. Locked Dock: Delete (destructive), Pause/Resume, Finish (primary) with >= 44x44 targets
 * 5. Normal Release: Surface transitions to "Uploading securely..." -> "Transcribing your voice..."
 * 6. Error State: In-composer "⚠️ Voice upload couldn't start [Try again]" preserving draft
 * 7. Physical LEFT stays left even in Urdu RTL.
 */

import React, { useState, useRef, useEffect } from "react";
import { useVoiceRecorder } from "../hooks/useVoiceRecorder";
import { useTranslation } from "../i18n";

interface VoiceRecorderProps {
  onTranscriptReady: (transcript: string, transliterated: boolean) => void;
  disabled?: boolean;
  onActiveChange?: (isActive: boolean) => void;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  onTranscriptReady,
  disabled = false,
  onActiveChange,
}) => {
  const { t, language } = useTranslation();
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const micButtonRef = useRef<HTMLButtonElement>(null);

  const {
    state,
    transcriptionStage,
    durationSeconds,
    isApproachingLimit,
    amplitude,
    errorMessage,
    startRecording,
    lockRecording,
    pauseRecording,
    resumeRecording,
    cancelRecording,
    finishRecording,
    resetError,
  } = useVoiceRecorder({
    languageHint: language,
    onTranscriptReady,
    onError: (err) => console.warn("Voice recording error:", err),
  });

  // Notify parent component (Dashboard) when voice recording becomes active or idle
  useEffect(() => {
    const isActive = state !== "idle";
    onActiveChange?.(isActive);
  }, [state, onActiveChange]);

  // Reset drag offsets when recording finishes, locks, or cancels
  useEffect(() => {
    if (state === "idle" || state === "locked" || state === "paused") {
      setDragOffset({ dx: 0, dy: 0 });
      pointerStartRef.current = null;
    }
  }, [state]);

  // Format time MM:SS
  const formatTime = (totalSecs: number): string => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // ---------------------------------------------------------------------------
  // Unified Pointer Event Handlers for Press-and-Hold
  // ---------------------------------------------------------------------------
  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled || state === "transcribing" || state === "locked" || state === "paused") return;
    if (e.button !== 0) return; // Primary pointer button only

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    setDragOffset({ dx: 0, dy: 0 });
    startRecording();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!pointerStartRef.current) return;

    const dx = e.clientX - pointerStartRef.current.x;
    const dy = e.clientY - pointerStartRef.current.y;
    setDragOffset({ dx, dy });

    // 1. Slide UP to Lock (dy <= -65px)
    if (dy <= -65) {
      lockRecording();
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      setDragOffset({ dx: 0, dy: 0 });
      pointerStartRef.current = null;
      return;
    }

    // 2. Slide LEFT to Cancel (dx <= -80px)
    // Physical left is strictly preserved even in Urdu RTL
    if (dx <= -80) {
      cancelRecording();
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      setDragOffset({ dx: 0, dy: 0 });
      pointerStartRef.current = null;
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    pointerStartRef.current = null;
    setDragOffset({ dx: 0, dy: 0 });

    if (state === "recording" || state === "requesting_permission") {
      finishRecording();
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    pointerStartRef.current = null;
    setDragOffset({ dx: 0, dy: 0 });
    if (state === "recording" || state === "requesting_permission") {
      cancelRecording();
    }
  };

  // Keyboard accessibility
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (state === "idle") {
        startRecording().then(() => lockRecording());
      } else if (state === "locked" || state === "paused") {
        finishRecording();
      }
    } else if (e.key === "Escape") {
      if (state !== "idle") {
        e.preventDefault();
        cancelRecording();
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Dynamic Waveform Calculation
  // ---------------------------------------------------------------------------
  const getBarHeight = (i: number, total: number): number => {
    if (state === "paused") return 20; // Dim frozen resting height
    const normalizedPos = i / (total - 1);
    const bell = Math.sin(normalizedPos * Math.PI); // Parabolic center peak
    const harmonic = Math.sin(i * 0.9 + amplitude * 5.0) * 0.2 + 0.8;
    const baseHeight = 16;
    const variableHeight = amplitude * 84 * (0.35 + 0.65 * bell) * harmonic;
    return Math.min(100, Math.max(baseHeight, Math.round(baseHeight + variableHeight)));
  };

  // Render waveform bars
  const renderWaveform = (totalBars: number = 22) => {
    const bars = [];
    const fadeOpacity = Math.max(0.15, 1 - Math.abs(Math.min(0, dragOffset.dx)) / 75);

    for (let i = 0; i < totalBars; i++) {
      const height = getBarHeight(i, totalBars);
      const isMobileHidden = i % 2 !== 0; // Show ~11 bars on small screens, 22 on desktop
      bars.push(
        <span
          key={i}
          className={`w-[3px] rounded-full transition-all duration-75 ${
            isMobileHidden ? "hidden sm:inline-block" : "inline-block"
          } ${
            state === "paused"
              ? "bg-slate-300 dark:bg-slate-600 opacity-60"
              : "bg-red-500 dark:bg-red-400"
          }`}
          style={{
            height: `${height}%`,
            opacity: state === "paused" ? 0.6 : fadeOpacity,
          }}
        />
      );
    }
    return bars;
  };

  // ---------------------------------------------------------------------------
  // 1. ERROR STATE (In-composer row, preserving typed draft)
  // ---------------------------------------------------------------------------
  if (state === "error") {
    return (
      <div className="w-full flex items-center justify-between gap-3 px-3 py-1.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 rounded-xl text-xs text-amber-800 dark:text-amber-200 animate-fade-in select-none">
        <div className="flex items-center gap-2">
          <span className="text-sm">⚠️</span>
          <span className="font-medium">{errorMessage || t.voiceNote?.uploadFailed || "Voice upload couldn't start"}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={resetError}
            className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium text-xs shadow-sm transition-colors"
          >
            {t.voiceNote?.tryAgain || "Try again"}
          </button>
          <button
            type="button"
            onClick={resetError}
            className="w-7 h-7 rounded-full flex items-center justify-center text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-sm font-bold"
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 2. TRANSCRIBING & UPLOADING FLOW (Seamless surface transition)
  // ---------------------------------------------------------------------------
  if (state === "transcribing") {
    const isUploading = transcriptionStage === "uploading";
    return (
      <div className="w-full flex items-center justify-between gap-3 px-3.5 py-2 bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/70 dark:border-blue-800/50 rounded-xl animate-pulse select-none">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-base flex-shrink-0">✨</span>
          <div className="flex flex-col truncate">
            <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 truncate">
              {isUploading
                ? (t.voiceNote?.uploading || "Uploading securely...")
                : (t.voiceNote?.transcribingVoice || "Transcribing your voice…")}
            </span>
            <span className="text-[10px] text-blue-600/80 dark:text-blue-400/80 font-normal truncate">
              {t.voiceNote?.understandingLanguages || "Understanding Urdu / Roman Urdu / English"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <svg className="w-4 h-4 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 3. LOCKED RECORDING MODE (Integrated composer dock with min 44x44 touch targets)
  // ---------------------------------------------------------------------------
  if (state === "locked" || state === "paused") {
    return (
      <div
        className="w-full flex items-center justify-between gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/95 border border-slate-200/80 dark:border-slate-700/80 rounded-xl shadow-sm animate-fade-in select-none"
        dir="ltr"
      >
        {/* Left: Indicator, Timer, Waveform */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className="relative flex h-2.5 w-2.5">
              {state === "paused" ? (
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-400" />
              ) : (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                </>
              )}
            </span>
            <span className="font-mono text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100">
              {formatTime(durationSeconds)}
            </span>
            {isApproachingLimit && (
              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium px-1.5 py-0.2 bg-amber-100 dark:bg-amber-900/40 rounded-full animate-pulse">
                {t.voiceNote?.approachingLimit || "15m limit"}
              </span>
            )}
          </div>

          <div className="flex items-center justify-center gap-0.5 sm:gap-1 h-6 px-1 overflow-hidden">
            {renderWaveform(16)}
          </div>
        </div>

        {/* Right: Touch Target Controls (Min 44x44 touch hit areas) */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Delete / Cancel Button */}
          <button
            type="button"
            onClick={cancelRecording}
            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
            title={t.voiceNote?.deleteTooltip || "Delete recording"}
            aria-label="Delete recording"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>

          {/* Pause / Resume Button */}
          {state === "paused" ? (
            <button
              type="button"
              onClick={resumeRecording}
              className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
              title={t.voiceNote?.resumeTooltip || "Resume recording"}
              aria-label="Resume recording"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              onClick={pauseRecording}
              className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              title={t.voiceNote?.pauseTooltip || "Pause recording"}
              aria-label="Pause recording"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            </button>
          )}

          {/* Finish & Transcribe Button (Primary) */}
          <button
            type="button"
            onClick={finishRecording}
            className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-md hover:scale-105 transition-all"
            title={t.voiceNote?.finishTooltip || "Finish and transcribe"}
            aria-label="Finish and transcribe"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 4. ACTIVE PRESS-AND-HOLD RECORDING STATE (WhatsApp-familiar Toolbar Row)
  // ---------------------------------------------------------------------------
  const isHolding = state === "recording" || state === "requesting_permission";

  if (isHolding) {
    const cancelRatio = Math.min(1, Math.abs(Math.min(0, dragOffset.dx)) / 80);
    const lockRatio = Math.min(1, Math.abs(Math.min(0, dragOffset.dy)) / 65);
    const isNearCancel = dragOffset.dx <= -45;
    const isNearLock = dragOffset.dy <= -35;

    return (
      <div
        className="w-full flex items-center justify-between px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800/95 border border-slate-200/80 dark:border-slate-700/80 rounded-xl shadow-sm select-none relative"
        dir="ltr"
      >
        {/* LEFT SECTION: 🔴 Red pulsing dot & Timer */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
          </span>
          <span className="font-mono text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100">
            {formatTime(durationSeconds)}
          </span>
          {isApproachingLimit && (
            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium px-1.5 py-0.2 bg-amber-100 dark:bg-amber-900/40 rounded-full animate-pulse">
              {t.voiceNote?.approachingLimit || "15m limit"}
            </span>
          )}
        </div>

        {/* CENTER SECTION: Live Waveform & Slide-to-Cancel guidance */}
        <div className="flex-1 flex items-center justify-center gap-2 sm:gap-3 px-2 overflow-hidden min-w-0">
          {/* Live Waveform */}
          <div className="flex items-center justify-center gap-0.5 sm:gap-1 h-6">
            {renderWaveform(20)}
          </div>

          {/* Slide-to-cancel guidance physically translated with finger */}
          <div
            className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 transition-transform duration-75 flex-shrink-0"
            style={{
              transform: `translateX(${Math.min(0, dragOffset.dx * 0.85)}px)`,
            }}
          >
            <span
              className={`transition-all duration-100 ${
                isNearCancel ? "text-red-500 font-bold" : "text-slate-400"
              }`}
              style={{
                transform: `scale(${1 + cancelRatio * 0.3})`,
              }}
            >
              {isNearCancel ? "🗑️" : "←"}
            </span>
            <span
              className={`text-[11px] sm:text-xs font-medium whitespace-nowrap transition-colors duration-100 ${
                isNearCancel ? "text-red-600 dark:text-red-400 font-semibold" : "text-slate-500 dark:text-slate-400"
              }`}
            >
              {t.voiceNote?.slideToCancel || "Slide left to cancel"}
            </span>
          </div>
        </div>

        {/* RIGHT SECTION: Upward Lock Affordance & Held Mic Anchor */}
        <div className="flex items-center gap-2 flex-shrink-0 relative">
          {/* Lock Affordance Trajectory Pill */}
          <div
            className={`absolute bottom-full mb-1 right-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all pointer-events-none shadow-md ${
              isNearLock
                ? "bg-blue-600 text-white scale-110 ring-2 ring-blue-400/50"
                : "bg-slate-800/90 dark:bg-slate-700/90 text-slate-200 backdrop-blur-sm"
            }`}
            style={{
              transform: `translateY(${Math.min(0, Math.max(dragOffset.dy * 0.7, -40))}px)`,
              opacity: Math.max(0.6, lockRatio),
            }}
          >
            <span>🔒</span>
            <span>↑ {t.voiceNote?.slideUpToLock || "Lock"}</span>
          </div>

          {/* Held Mic Button (Finger Anchor with Pointer Capture) */}
          <button
            ref={micButtonRef}
            type="button"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onKeyDown={handleKeyDown}
            className="w-10 h-10 min-w-[40px] min-h-[40px] rounded-full flex items-center justify-center bg-red-500 text-white scale-110 shadow-lg shadow-red-500/35 ring-4 ring-red-500/20 select-none touch-none transition-transform"
            style={{
              transform: `translateX(${Math.max(dragOffset.dx * 0.2, -16)}px) scale(1.15)`,
            }}
            aria-label="Recording active"
          >
            <svg className="w-5 h-5 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 5. IDLE STATE (Standard Mic Button in Composer Toolbar)
  // ---------------------------------------------------------------------------
  return (
    <button
      ref={micButtonRef}
      type="button"
      disabled={disabled}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onKeyDown={handleKeyDown}
      className={`relative w-8 h-8 rounded-full flex items-center justify-center transition-all select-none touch-none ${
        disabled
          ? "text-slate-300 dark:text-slate-700 cursor-not-allowed"
          : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
      }`}
      title={t.voiceNote?.recordTooltip || "Record voice note (press and hold or click to dictate)"}
      aria-label={t.voiceNote?.recordTooltip || "Record voice note"}
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
        />
      </svg>
    </button>
  );
};
