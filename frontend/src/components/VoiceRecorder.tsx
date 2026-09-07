/**
 * Mashwara AI — Voice Note Recorder Component (Phase 4)
 * =======================================================
 * WhatsApp-familiar interaction model:
 * 1. Primary: Press-and-hold microphone button (unified pointer events)
 * 2. Slide left (physical dx <= -80px) -> Cancel / Discard
 * 3. Slide up (physical dy <= -65px) -> Hands-Free Locked Mode
 * 4. Locked Mode Dock: Delete, Pause/Resume, Finish
 * 5. Transcribed text enters composer textarea — NEVER auto-sends.
 */

import React, { useState, useRef, useEffect } from "react";
import { useVoiceRecorder } from "../hooks/useVoiceRecorder";
import { useTranslation } from "../i18n";

interface VoiceRecorderProps {
  onTranscriptReady: (transcript: string, transliterated: boolean) => void;
  disabled?: boolean;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({
  onTranscriptReady,
  disabled = false,
}) => {
  const { t, language } = useTranslation();
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const micButtonRef = useRef<HTMLButtonElement>(null);

  const {
    state,
    durationSeconds,
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

  // Reset drag offsets when recording finishes or cancels
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
    if (e.button !== 0) return; // Only primary mouse/touch button

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
    if (state !== "recording" || !pointerStartRef.current) return;

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
    // Physical left is preserved in Urdu RTL so muscle memory remains identical
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

    if (state === "recording") {
      // User held and released cleanly without crossing cancel/lock thresholds
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
    if (state === "recording") {
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
  // Amplitude Visualizer Bars
  // ---------------------------------------------------------------------------
  const renderAmplitudeBars = (barCount: number = 7) => {
    const bars = [];
    for (let i = 0; i < barCount; i++) {
      // Calculate dynamic bar height offset based on amplitude and bar position
      const phase = Math.sin((i / (barCount - 1)) * Math.PI);
      const dynamicHeight = Math.max(
        15,
        Math.min(100, Math.round(amplitude * 100 * (0.4 + 0.6 * phase) + (state === "paused" ? 15 : 20)))
      );
      bars.push(
        <span
          key={i}
          className={`w-1 rounded-full transition-all duration-100 ${
            state === "paused"
              ? "bg-slate-300 dark:bg-slate-600"
              : "bg-red-500 dark:bg-red-400"
          }`}
          style={{ height: `${dynamicHeight}%` }}
        />
      );
    }
    return bars;
  };

  // ---------------------------------------------------------------------------
  // Transcribing State Indicator
  // ---------------------------------------------------------------------------
  if (state === "transcribing") {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50/80 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800/50 rounded-xl text-xs text-blue-600 dark:text-blue-400 font-medium animate-pulse shadow-sm">
        <svg className="w-4 h-4 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span>{t.voiceNote?.transcribing || "Transcribing voice note..."}</span>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Locked Mode Dock Controls
  // ---------------------------------------------------------------------------
  if (state === "locked" || state === "paused") {
    return (
      <div className="flex items-center justify-between gap-3 w-full bg-slate-50 dark:bg-slate-800/95 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl px-3.5 py-2 shadow-lg backdrop-blur-sm animate-fade-in">
        {/* Left: Indicator, Timer, Amplitude bars */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                state === "paused"
                  ? "bg-amber-400"
                  : "bg-red-500 animate-ping"
              }`}
            />
            <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">
              {formatTime(durationSeconds)}
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-1 h-5 w-16">
            {renderAmplitudeBars(6)}
          </div>
        </div>

        {/* Right: Action Buttons (Min 44x44 touch targets) */}
        <div className="flex items-center gap-1.5">
          {/* Delete / Cancel Button */}
          <button
            type="button"
            onClick={cancelRecording}
            className="w-10 h-10 min-w-[40px] rounded-full flex items-center justify-center text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
            title={t.voiceNote?.deleteTooltip || "Delete recording"}
            aria-label="Delete recording"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>

          {/* Pause / Resume Button */}
          {state === "paused" ? (
            <button
              type="button"
              onClick={resumeRecording}
              className="w-10 h-10 min-w-[40px] rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
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
              className="w-10 h-10 min-w-[40px] rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              title={t.voiceNote?.pauseTooltip || "Pause recording"}
              aria-label="Pause recording"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            </button>
          )}

          {/* Finish & Transcribe Button */}
          <button
            type="button"
            onClick={finishRecording}
            className="w-10 h-10 min-w-[40px] rounded-full flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:scale-105 transition-all"
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
  // Active Press-and-Hold Gesture Active State
  // ---------------------------------------------------------------------------
  const isPressHolding = state === "recording";

  return (
    <div className="relative inline-flex items-center">
      {/* Floating gesture guide during Press-and-Hold */}
      {isPressHolding && (
        <div
          className="absolute bottom-full mb-3 flex items-center gap-3 bg-slate-900/90 text-white px-3.5 py-1.5 rounded-full text-xs font-medium shadow-2xl backdrop-blur-md pointer-events-none z-30 animate-fade-in"
          style={{
            transform: `translate(${dragOffset.dx * 0.4}px, ${dragOffset.dy * 0.4}px)`,
          }}
        >
          {/* Pulsing red dot */}
          <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
          <span className="font-mono font-semibold">{formatTime(durationSeconds)}</span>

          {/* Amplitude mini-bars */}
          <div className="flex items-center gap-0.5 h-3.5 w-10">
            {renderAmplitudeBars(5)}
          </div>

          <div className="h-3 w-px bg-white/20 mx-1" />

          {/* Slide guidance */}
          <div className="flex items-center gap-2 text-slate-300">
            <span className="flex items-center gap-1 text-[11px]">
              <span>←</span>
              <span>{t.voiceNote?.slideToCancel || "Slide left to cancel"}</span>
            </span>
            <span className="opacity-40">|</span>
            <span className="flex items-center gap-1 text-[11px] text-blue-300">
              <span>↑</span>
              <span>{t.voiceNote?.slideUpToLock || "Lock"}</span>
            </span>
          </div>
        </div>
      )}

      {/* Primary Microphone Button */}
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
          isPressHolding
            ? "bg-red-500 text-white scale-125 shadow-lg shadow-red-500/40 ring-4 ring-red-500/20"
            : disabled
            ? "text-slate-300 dark:text-slate-700 cursor-not-allowed"
            : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
        }`}
        title={t.voiceNote?.recordTooltip || "Record voice note (press and hold or click)"}
        aria-label={t.voiceNote?.recordTooltip || "Record voice note"}
      >
        <svg
          className={`w-4 h-4 transition-transform ${isPressHolding ? "scale-110" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
          />
        </svg>
      </button>

      {/* Temporary error toast if recording failed */}
      {errorMessage && (
        <div className="absolute bottom-full mb-2 left-0 w-64 p-2 bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 rounded-xl shadow-lg text-[11px] text-red-600 dark:text-red-300 flex items-start justify-between gap-2 z-30">
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={resetError}
            className="text-red-500 hover:text-red-700 font-bold px-1"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
};
