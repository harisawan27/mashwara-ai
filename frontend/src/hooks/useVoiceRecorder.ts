/**
 * Mashwara AI — Voice Recorder Hook (Phase 4)
 * ============================================
 * Manages MediaRecorder lifecycle, live amplitude derivation, active duration
 * tracking with pause/resume support, GCS upload, and transcription dispatch.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import type { VoiceRecordingState } from "../types/meeting";
import { transcribeAudioDirect } from "../api/client";

interface UseVoiceRecorderOptions {
  languageHint?: string;
  onTranscriptReady: (transcript: string, transliterated: boolean) => void;
  onError?: (errorMessage: string) => void;
}

export function useVoiceRecorder({
  languageHint = "roman-ur",
  onTranscriptReady,
  onError,
}: UseVoiceRecorderOptions) {
  const [state, setState] = useState<VoiceRecordingState>("idle");
  const [transcriptionStage, setTranscriptionStage] = useState<"uploading" | "transcribing" | null>(null);
  const [durationSeconds, setDurationSeconds] = useState<number>(0);
  const [isApproachingLimit, setIsApproachingLimit] = useState<boolean>(false);
  const [amplitude, setAmplitude] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);

  const chunksRef = useRef<Blob[]>([]);
  const selectedMimeRef = useRef<string>("audio/webm");

  // Time tracking
  const startTimeRef = useRef<number>(0);
  const accumulatedMsRef = useRef<number>(0);
  const isPausedRef = useRef<boolean>(false);

  // Lifecycle race condition protection refs
  const isPointerDownRef = useRef<boolean>(false);
  const cancelRequestedRef = useRef<boolean>(false);
  const lockRequestedRef = useRef<boolean>(false);
  const activeSessionIdRef = useRef<number>(0);
  const finishRecordingRef = useRef<(() => Promise<void>) | null>(null);

  // Detect supported mime type
  const getSupportedMimeType = useCallback((): string => {
    if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
      return "";
    }
    const candidateTypes = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/aac",
      "audio/ogg;codecs=opus",
      "audio/ogg",
      "audio/wav",
    ];
    for (const t of candidateTypes) {
      if (MediaRecorder.isTypeSupported(t)) {
        return t;
      }
    }
    return "";
  }, []);

  // Cleanup all audio tracks & streams
  const cleanupMedia = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      try {
        audioContextRef.current.close();
      } catch {
        // ignore
      }
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
    setAmplitude(0);
  }, []);

  // Start visualizer loop
  const startVisualizer = useCallback((stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.7;
      source.connect(analyser);
      analyserRef.current = analyser;

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          sum += buffer[i];
        }
        const avg = sum / buffer.length;
        const norm = Math.min(1.0, Math.max(0.0, (avg / 128) * 1.25));
        setAmplitude(norm);
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (e) {
      console.warn("Visualizer init warning:", e);
    }
  }, []);

  // Start recording
  const startRecording = useCallback(async () => {
    const sessionId = ++activeSessionIdRef.current;
    isPointerDownRef.current = true;
    cancelRequestedRef.current = false;
    lockRequestedRef.current = false;

    setErrorMessage(null);
    setState("requesting_permission");
    chunksRef.current = [];
    accumulatedMsRef.current = 0;
    isPausedRef.current = false;
    setDurationSeconds(0);
    setIsApproachingLimit(false);

    const mime = getSupportedMimeType();
    if (!mime && typeof MediaRecorder === "undefined") {
      const msg = "Audio recording is not supported in this browser.";
      setErrorMessage(msg);
      setState("error");
      onError?.(msg);
      return;
    }
    selectedMimeRef.current = mime || "audio/webm";

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // RACE CONDITION CHECK:
      // If user released, cancelled, or started a new session while awaiting permission:
      if (
        activeSessionIdRef.current !== sessionId ||
        cancelRequestedRef.current ||
        (!isPointerDownRef.current && !lockRequestedRef.current)
      ) {
        stream.getTracks().forEach((track) => track.stop());
        cleanupMedia();
        setState("idle");
        return;
      }

      mediaStreamRef.current = stream;
      startVisualizer(stream);

      const recorderOptions: MediaRecorderOptions = {};
      if (mime) recorderOptions.mimeType = mime;

      const recorder = new MediaRecorder(stream, recorderOptions);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.start(250); // Emit chunks every 250ms
      startTimeRef.current = Date.now();

      if (lockRequestedRef.current) {
        setState("locked");
      } else {
        setState("recording");
      }

      // Active duration timer
      timerRef.current = window.setInterval(() => {
        if (!isPausedRef.current) {
          const activeMs = accumulatedMsRef.current + (Date.now() - startTimeRef.current);
          const secs = Math.floor(activeMs / 1000);
          setDurationSeconds(secs);

          // Subtle warning at 14:30 (870 seconds)
          if (secs >= 870) {
            setIsApproachingLimit(true);
          }

          // 15-minute maximum limit (900 seconds): auto-FINISH and transcribe
          if (secs >= 900) {
            finishRecordingRef.current?.();
          }
        }
      }, 250);
    } catch (err: unknown) {
      cleanupMedia();
      const msg =
        (err as { name?: string })?.name === "NotAllowedError" || (err as { name?: string })?.name === "PermissionDeniedError"
          ? "Microphone access was denied. Please allow microphone permissions."
          : "Could not start audio recording. Please check your microphone.";
      setErrorMessage(msg);
      setState("error");
      onError?.(msg);
    }
  }, [cleanupMedia, getSupportedMimeType, onError, startVisualizer]);

  // Lock recording
  const lockRecording = useCallback(() => {
    if (state === "recording") {
      setState("locked");
    } else if (state === "requesting_permission") {
      lockRequestedRef.current = true;
    }
  }, [state]);

  // Pause recording
  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.pause();
      isPausedRef.current = true;
      accumulatedMsRef.current += Date.now() - startTimeRef.current;
      setState("paused");
      setAmplitude(0);
    }
  }, []);

  // Resume recording
  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "paused") {
      mediaRecorderRef.current.resume();
      isPausedRef.current = false;
      startTimeRef.current = Date.now();
      setState("locked");
    }
  }, []);

  // Cancel recording (Immediate zero-network discard)
  const cancelRecording = useCallback(async () => {
    cancelRequestedRef.current = true;
    isPointerDownRef.current = false;
    lockRequestedRef.current = false;
    cleanupMedia();
    chunksRef.current = [];
    setDurationSeconds(0);
    setIsApproachingLimit(false);
    setTranscriptionStage(null);
    setState("idle");
  }, [cleanupMedia]);

  // Finish and transcribe
  const finishRecording = useCallback(async () => {
    isPointerDownRef.current = false;

    // Handle release while permission request is still resolving
    if (state === "requesting_permission") {
      cancelRecording();
      return;
    }

    if (!mediaRecorderRef.current) return;

    const finalActiveMs = isPausedRef.current
      ? accumulatedMsRef.current
      : accumulatedMsRef.current + (Date.now() - startTimeRef.current);
    const finalSecs = finalActiveMs / 1000;

    // Discard if under 600ms (0.6s short tap: zero upload, no error)
    if (finalSecs < 0.6) {
      cancelRecording();
      return;
    }

    const mime = selectedMimeRef.current || "audio/webm";
    const recorder = mediaRecorderRef.current;

    const handleStop = async () => {
      cleanupMedia();
      const rawBlob = new Blob(chunksRef.current, { type: mime });
      if (rawBlob.size === 0) {
        setState("idle");
        setTranscriptionStage(null);
        return;
      }

      setState("transcribing");
      setTranscriptionStage("uploading");
      try {
        // Single-call: send raw audio bytes directly to backend (no GCS)
        setTranscriptionStage("transcribing");
        const transcribeRes = await transcribeAudioDirect(rawBlob, mime, languageHint);

        setTranscriptionStage(null);
        setState("idle");

        if (transcribeRes.transcript) {
          onTranscriptReady(transcribeRes.transcript, transcribeRes.transliterated);
        }
      } catch (err: unknown) {
        console.error("Voice recording / transcription failed:", err);
        const responseStatus = (
          err as { response?: { status?: number } }
        )?.response?.status;
        const friendlyError = responseStatus === 422
          ? "No speech was detected. Please record again and speak clearly."
          : "Could not transcribe your voice note. Please try again.";
        setErrorMessage(friendlyError);
        setTranscriptionStage(null);
        setState("error");
        onError?.(friendlyError);
      }
    };

    if (recorder.state !== "inactive") {
      recorder.onstop = handleStop;
      recorder.stop();
    } else {
      await handleStop();
    }
  }, [cancelRecording, cleanupMedia, languageHint, onError, onTranscriptReady, state]);

  // Keep finishRecordingRef in sync for timer interval
  useEffect(() => {
    finishRecordingRef.current = finishRecording;
  }, [finishRecording]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      cleanupMedia();
    };
  }, [cleanupMedia]);

  return {
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
    resetError: () => {
      setErrorMessage(null);
      setState("idle");
    },
  };
}
