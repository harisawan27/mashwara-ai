/**
 * SummaryAudioPlayer — Executive Voice Narration Player (Phase 5)
 * ================================================================
 * Speaks the exact persisted companion executive summary using Google's dedicated
 * gemini-3.1-flash-tts-preview model with the authoritative adult male voice 'Charon'.
 *
 * Features:
 * - Lazy on-demand audio generation (0 cost until user clicks Listen)
 * - Cached audio instant-load
 * - Global audio singleton (stops any other active player when starting)
 * - Play / Pause / Scrub / Replay / Speed Toggle (1x, 1.25x, 1.5x)
 * - Touch-friendly (>= 44px targets) & RTL compliant
 * - Seamless integration inside private consultations (never on public share)
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import { getSummaryAudioBlob } from "../api/client";
import { useTranslation } from "../i18n";

interface SummaryAudioPlayerProps {
  meetingId: string;
  className?: string;
}

// Global audio coordinator to ensure only one audio plays at a time across the entire app
let activeGlobalAudio: HTMLAudioElement | null = null;
let activeGlobalStopCallback: (() => void) | null = null;

export default function SummaryAudioPlayer({ meetingId, className = "" }: SummaryAudioPlayerProps) {
  const { t } = useTranslation();
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  // Stop handler for global singleton coordination
  const handleExternalStop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
      if (activeGlobalAudio === audioRef.current) {
        activeGlobalAudio = null;
        activeGlobalStopCallback = null;
      }
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  const handleFetchAudio = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setError(null);

    try {
      const audioBlob = await getSummaryAudioBlob(meetingId);
      if (!audioBlob.size) {
        throw new Error("Empty narration response");
      }
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
      const blobUrl = URL.createObjectURL(audioBlob);
      objectUrlRef.current = blobUrl;

      setAudioUrl(blobUrl);
      // Autoplay once fetched
      setTimeout(() => {
        if (audioRef.current) {
          if (activeGlobalStopCallback && activeGlobalAudio !== audioRef.current) {
            activeGlobalStopCallback();
          }
          activeGlobalAudio = audioRef.current;
          activeGlobalStopCallback = handleExternalStop;
          audioRef.current.play().then(() => {
            setIsPlaying(true);
          }).catch((err) => {
            console.warn("Autoplay prevented:", err);
            setIsPlaying(false);
          });
        }
      }, 50);
    } catch (err: any) {
      console.error("Failed to load summary audio:", err);
      setError(t.summaryAudio?.error || "Audio narration unavailable");
    } finally {
      setIsLoading(false);
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      if (activeGlobalStopCallback && activeGlobalAudio !== audioRef.current) {
        activeGlobalStopCallback();
      }
      activeGlobalAudio = audioRef.current;
      activeGlobalStopCallback = handleExternalStop;
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch((err) => {
        console.warn("Play error:", err);
      });
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const cyclePlaybackRate = () => {
    const rates = [1, 1.25, 1.5];
    const nextIdx = (rates.indexOf(playbackRate) + 1) % rates.length;
    const newRate = rates[nextIdx];
    setPlaybackRate(newRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = newRate;
    }
  };

  const handleReplay = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
      if (!isPlaying) {
        togglePlay();
      }
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  // Initial Unloaded Pill
  if (!audioUrl) {
    return (
      <div className={`mt-3 min-w-0 flex flex-wrap items-center gap-2 ${className}`}>
        <button
          type="button"
          onClick={handleFetchAudio}
          disabled={isLoading}
          aria-label={t.summaryAudio?.listen || "Listen to Summary"}
          className="max-w-full inline-flex items-center gap-2 px-3 sm:px-3.5 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 hover:from-blue-100 hover:to-indigo-100 dark:hover:from-blue-900/50 dark:hover:to-indigo-900/50 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-500/20 shadow-sm hover:shadow transition-all group disabled:opacity-60"
        >
          {isLoading ? (
            <>
              <svg className="animate-spin w-4 h-4 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>{t.summaryAudio?.preparing || "Preparing audio..."}</span>
            </>
          ) : (
            <>
              <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center flex-shrink-0 shadow-sm shadow-blue-500/30 group-hover:scale-105 transition-transform">
                <svg className="w-2.5 h-2.5 ml-0.5 rtl:ml-0 rtl:mr-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
              <span className="min-w-0 font-medium leading-snug">{t.summaryAudio?.listen || "Listen to Summary"}</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-blue-600/10 dark:bg-blue-400/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                {t.summaryAudio?.voiceLabel || "Executive Voice"}
              </span>
            </>
          )}
        </button>

        {error && (
          <span className="text-xs text-red-500 dark:text-red-400 flex items-center gap-1">
            <span>⚠️</span> {error}
          </span>
        )}
      </div>
    );
  }

  // Active Player Bar
  return (
    <div
      className={`mt-3 w-full max-w-lg p-2.5 sm:p-3 rounded-2xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200/90 dark:border-white/10 shadow-sm flex flex-col gap-2 transition-all animate-fade-in ${className}`}
      dir="ltr" // Player controls consistently LTR for waveform/scrubber ergonomics
    >
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="metadata"
        onTimeUpdate={() => {
          if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
          }
        }}
        onLoadedMetadata={() => {
          if (audioRef.current) {
            setDuration(audioRef.current.duration);
          }
        }}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
      />

      <div className="flex items-center gap-2.5">
        {/* Play/Pause Button (>= 44px touch target) */}
        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? (t.summaryAudio?.pause || "Pause") : (t.summaryAudio?.playing || "Play")}
          className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center flex-shrink-0 shadow-md shadow-blue-500/20 hover:scale-105 active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
        >
          {isPlaying ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Scrubber & Time */}
        <div className="flex-1 flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400">
            <span className="font-mono text-[10px]">{formatTime(currentTime)}</span>
            <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-blue-600 dark:text-blue-400">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              <span>Charon</span>
            </div>
            <span className="font-mono text-[10px]">{formatTime(duration)}</span>
          </div>

          <div className="relative flex items-center group">
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              aria-label="Audio scrubber"
              className="w-full h-1.5 bg-slate-200 dark:bg-slate-700/60 rounded-full appearance-none cursor-pointer accent-blue-600 group-hover:h-2 transition-all focus:outline-none"
              style={{
                background: `linear-gradient(to right, #2563EB ${(currentTime / (duration || 1)) * 100}%, rgba(148, 163, 184, 0.25) ${(currentTime / (duration || 1)) * 100}%)`,
              }}
            />
          </div>
        </div>

        {/* Speed Toggle */}
        <button
          type="button"
          onClick={cyclePlaybackRate}
          title="Playback speed"
          className="min-w-[36px] h-8 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-300 transition-colors flex items-center justify-center focus:outline-none"
        >
          {playbackRate}x
        </button>

        {/* Replay */}
        <button
          type="button"
          onClick={handleReplay}
          title={t.summaryAudio?.replay || "Replay"}
          aria-label={t.summaryAudio?.replay || "Replay"}
          className="w-8 h-8 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center justify-center transition-colors focus:outline-none"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
    </div>
  );
}
