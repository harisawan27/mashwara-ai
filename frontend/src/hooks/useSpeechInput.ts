import { useCallback, useEffect, useRef, useState } from "react";
import type { VoiceRecordingState } from "../types/meeting";

interface SpeechInputMessages {
  unsupported: string;
  permissionDenied: string;
  noMicrophone: string;
  network: string;
  failed: string;
}

interface UseSpeechInputOptions {
  languageHint?: string;
  messages: SpeechInputMessages;
  onTranscriptReady: (transcript: string) => void;
  onError?: (errorMessage: string) => void;
}

const MAX_DURATION_SECONDS = 900;
const WARNING_AT_SECONDS = 870;
const MIN_DURATION_MS = 600;
const RESTART_DELAY_MS = 150;
const FINISH_FALLBACK_MS = 1000;

function recognitionLanguage(languageHint: string): string {
  return languageHint === "en" ? "en-US" : "ur-PK";
}

function getRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function useSpeechInput({
  languageHint = "roman-ur",
  messages,
  onTranscriptReady,
  onError,
}: UseSpeechInputOptions) {
  const [state, setState] = useState<VoiceRecordingState>("idle");
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [isApproachingLimit, setIsApproachingLimit] = useState(false);
  const [amplitude, setAmplitude] = useState(0);
  const [finalTranscript, setFinalTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const stateRef = useRef<VoiceRecordingState>("idle");
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const restartTimeoutRef = useRef<number | null>(null);
  const finishTimeoutRef = useRef<number | null>(null);

  const startTimeRef = useRef(0);
  const accumulatedMsRef = useRef(0);
  const activeSessionIdRef = useRef(0);
  const sessionActiveRef = useRef(false);
  const isPointerDownRef = useRef(false);
  const lockRequestedRef = useRef(false);
  const pausedRef = useRef(false);
  const cancellingRef = useRef(false);
  const finishingRef = useRef(false);
  const finalizedRef = useRef(false);
  const finalTranscriptRef = useRef("");
  const interimTranscriptRef = useRef("");

  const onTranscriptReadyRef = useRef(onTranscriptReady);
  const onErrorRef = useRef(onError);
  const messagesRef = useRef(messages);
  const languageHintRef = useRef(languageHint);
  const startRecognitionRef = useRef<(() => void) | null>(null);
  const finishRecordingRef = useRef<(() => void) | null>(null);
  const finalizeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    onTranscriptReadyRef.current = onTranscriptReady;
    onErrorRef.current = onError;
    messagesRef.current = messages;
    languageHintRef.current = languageHint;
  }, [languageHint, messages, onError, onTranscriptReady]);

  const updateState = useCallback((next: VoiceRecordingState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const clearScheduledWork = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (restartTimeoutRef.current !== null) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    if (finishTimeoutRef.current !== null) {
      clearTimeout(finishTimeoutRef.current);
      finishTimeoutRef.current = null;
    }
  }, []);

  const stopWaveform = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    analyserRef.current = null;
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      void audioContextRef.current.close().catch(() => undefined);
    }
    audioContextRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    setAmplitude(0);
  }, []);

  const startVisualizer = useCallback((stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const context = new AudioCtx();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 64;
      analyser.smoothingTimeConstant = 0.7;
      source.connect(analyser);
      audioContextRef.current = context;
      analyserRef.current = analyser;

      const values = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        const currentAnalyser = analyserRef.current;
        if (!currentAnalyser) return;
        currentAnalyser.getByteFrequencyData(values);
        const average = values.reduce((sum, value) => sum + value, 0) / values.length;
        setAmplitude(Math.min(1, Math.max(0, (average / 128) * 1.25)));
        animFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (error) {
      console.warn("Voice waveform could not start:", error);
    }
  }, []);

  const appendFinalSegment = useCallback((segment: string) => {
    const cleanSegment = segment.trim();
    if (!cleanSegment) return;
    const previous = finalTranscriptRef.current;
    const separator = previous && !/\s$/.test(previous) ? " " : "";
    const next = `${previous}${separator}${cleanSegment}`;
    finalTranscriptRef.current = next;
    setFinalTranscript(next);
  }, []);

  const failSession = useCallback((message: string) => {
    sessionActiveRef.current = false;
    cancellingRef.current = true;
    finishingRef.current = false;
    pausedRef.current = false;
    clearScheduledWork();

    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      try { recognition.abort(); } catch { /* already stopped */ }
    }

    stopWaveform();
    interimTranscriptRef.current = "";
    setInterimTranscript("");
    setErrorMessage(message);
    updateState("error");
    onErrorRef.current?.(message);
  }, [clearScheduledWork, stopWaveform, updateState]);

  const finalize = useCallback(() => {
    if (finalizedRef.current) return;
    finalizedRef.current = true;
    sessionActiveRef.current = false;
    finishingRef.current = false;
    clearScheduledWork();

    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      try { recognition.abort(); } catch { /* already ended */ }
    }

    stopWaveform();
    const transcript = finalTranscriptRef.current.trim();
    interimTranscriptRef.current = "";
    setInterimTranscript("");
    updateState("idle");

    if (transcript) onTranscriptReadyRef.current(transcript);
    finalTranscriptRef.current = "";
    setFinalTranscript("");
    setDurationSeconds(0);
    setIsApproachingLimit(false);
  }, [clearScheduledWork, stopWaveform, updateState]);

  useEffect(() => {
    finalizeRef.current = finalize;
  }, [finalize]);

  const startRecognition = useCallback(() => {
    const Recognition = getRecognitionConstructor();
    if (!Recognition) {
      failSession(messagesRef.current.unsupported);
      return;
    }

    const recognition = new Recognition();
    const processedFinalIndexes = new Set<number>();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = recognitionLanguage(languageHintRef.current);
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      if (recognitionRef.current !== recognition || !sessionActiveRef.current || cancellingRef.current) return;
      const interimSegments: string[] = [];

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const segment = result?.[0]?.transcript || "";
        if (result?.isFinal) {
          if (!processedFinalIndexes.has(index)) {
            processedFinalIndexes.add(index);
            appendFinalSegment(segment);
          }
        } else if (!pausedRef.current && !finishingRef.current && segment.trim()) {
          interimSegments.push(segment.trim());
        }
      }

      const interim = interimSegments.join(" ");
      interimTranscriptRef.current = interim;
      setInterimTranscript(interim);
    };

    recognition.onerror = (event) => {
      if (recognitionRef.current !== recognition) return;
      const error = event.error;
      if (error === "no-speech") {
        interimTranscriptRef.current = "";
        setInterimTranscript("");
        return;
      }
      if (error === "aborted" && (cancellingRef.current || pausedRef.current || finishingRef.current)) return;
      if (error === "not-allowed" || error === "service-not-allowed") {
        failSession(messagesRef.current.permissionDenied);
      } else if (error === "audio-capture") {
        failSession(messagesRef.current.noMicrophone);
      } else if (error === "network") {
        failSession(messagesRef.current.network);
      } else if (error !== "aborted") {
        failSession(messagesRef.current.failed);
      }
    };

    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      recognitionRef.current = null;
      interimTranscriptRef.current = "";
      setInterimTranscript("");

      if (finishingRef.current) {
        finalizeRef.current?.();
        return;
      }
      if (!sessionActiveRef.current || pausedRef.current || cancellingRef.current) return;

      restartTimeoutRef.current = window.setTimeout(() => {
        restartTimeoutRef.current = null;
        if (sessionActiveRef.current && !pausedRef.current && !cancellingRef.current && !finishingRef.current) {
          startRecognitionRef.current?.();
        }
      }, RESTART_DELAY_MS);
    };

    try {
      recognition.start();
    } catch {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      failSession(messagesRef.current.failed);
    }
  }, [appendFinalSegment, failSession]);

  useEffect(() => {
    startRecognitionRef.current = startRecognition;
  }, [startRecognition]);

  const startTimer = useCallback(() => {
    if (timerRef.current !== null) clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      if (pausedRef.current || finishingRef.current || !sessionActiveRef.current) return;
      const elapsedMs = accumulatedMsRef.current + (Date.now() - startTimeRef.current);
      const seconds = Math.floor(elapsedMs / 1000);
      setDurationSeconds(seconds);
      if (seconds >= WARNING_AT_SECONDS) setIsApproachingLimit(true);
      if (seconds >= MAX_DURATION_SECONDS) finishRecordingRef.current?.();
    }, 250);
  }, []);

  const cancelRecording = useCallback(() => {
    activeSessionIdRef.current += 1;
    sessionActiveRef.current = false;
    isPointerDownRef.current = false;
    lockRequestedRef.current = false;
    cancellingRef.current = true;
    finishingRef.current = false;
    pausedRef.current = false;
    clearScheduledWork();

    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      try { recognition.abort(); } catch { /* already stopped */ }
    }

    stopWaveform();
    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";
    setFinalTranscript("");
    setInterimTranscript("");
    setDurationSeconds(0);
    setIsApproachingLimit(false);
    setErrorMessage(null);
    updateState("idle");
  }, [clearScheduledWork, stopWaveform, updateState]);

  const finishRecording = useCallback(() => {
    isPointerDownRef.current = false;
    if (finishingRef.current || stateRef.current === "idle" || stateRef.current === "error") return;
    if (stateRef.current === "requesting_permission") {
      cancelRecording();
      return;
    }

    const elapsedMs = pausedRef.current
      ? accumulatedMsRef.current
      : accumulatedMsRef.current + (Date.now() - startTimeRef.current);
    if (elapsedMs < MIN_DURATION_MS) {
      cancelRecording();
      return;
    }

    accumulatedMsRef.current = elapsedMs;
    finishingRef.current = true;
    pausedRef.current = false;
    lockRequestedRef.current = false;
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    updateState("finalizing");
    stopWaveform();

    finishTimeoutRef.current = window.setTimeout(() => finalizeRef.current?.(), FINISH_FALLBACK_MS);
    const recognition = recognitionRef.current;
    if (!recognition) {
      finalizeRef.current?.();
      return;
    }
    try {
      recognition.stop();
    } catch {
      finalizeRef.current?.();
    }
  }, [cancelRecording, stopWaveform, updateState]);

  useEffect(() => {
    finishRecordingRef.current = finishRecording;
  }, [finishRecording]);

  const startRecording = useCallback(async () => {
    if (stateRef.current !== "idle") return;
    const Recognition = getRecognitionConstructor();
    if (!Recognition) {
      failSession(messagesRef.current.unsupported);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      failSession(messagesRef.current.noMicrophone);
      return;
    }

    const sessionId = ++activeSessionIdRef.current;
    isPointerDownRef.current = true;
    lockRequestedRef.current = false;
    pausedRef.current = false;
    cancellingRef.current = false;
    finishingRef.current = false;
    finalizedRef.current = false;
    sessionActiveRef.current = false;
    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";
    accumulatedMsRef.current = 0;
    setFinalTranscript("");
    setInterimTranscript("");
    setDurationSeconds(0);
    setIsApproachingLimit(false);
    setErrorMessage(null);
    updateState("requesting_permission");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (activeSessionIdRef.current !== sessionId || cancellingRef.current || (!isPointerDownRef.current && !lockRequestedRef.current)) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      mediaStreamRef.current = stream;
      sessionActiveRef.current = true;
      startTimeRef.current = Date.now();
      startVisualizer(stream);
      startRecognitionRef.current?.();
      if (!sessionActiveRef.current || !recognitionRef.current) return;
      startTimer();
      updateState(lockRequestedRef.current ? "locked" : "recording");
    } catch (error) {
      const errorName = (error as { name?: string })?.name;
      if (activeSessionIdRef.current !== sessionId || cancellingRef.current) return;
      if (errorName === "NotAllowedError" || errorName === "PermissionDeniedError") {
        failSession(messagesRef.current.permissionDenied);
      } else if (errorName === "NotFoundError" || errorName === "DevicesNotFoundError" || errorName === "OverconstrainedError") {
        failSession(messagesRef.current.noMicrophone);
      } else {
        failSession(messagesRef.current.failed);
      }
    }
  }, [failSession, startTimer, startVisualizer, updateState]);

  const lockRecording = useCallback(() => {
    lockRequestedRef.current = true;
    if (stateRef.current === "recording") updateState("locked");
  }, [updateState]);

  const pauseRecording = useCallback(() => {
    if (stateRef.current !== "locked" || pausedRef.current || finishingRef.current) return;
    pausedRef.current = true;
    accumulatedMsRef.current += Date.now() - startTimeRef.current;
    interimTranscriptRef.current = "";
    setInterimTranscript("");
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    void audioContextRef.current?.suspend().catch(() => undefined);
    setAmplitude(0);
    updateState("paused");
    try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
  }, [updateState]);

  const resumeRecording = useCallback(() => {
    if (stateRef.current !== "paused" || finishingRef.current || !sessionActiveRef.current) return;
    pausedRef.current = false;
    cancellingRef.current = false;
    startTimeRef.current = Date.now();
    void audioContextRef.current?.resume().catch(() => undefined);
    updateState("locked");
    startTimer();
    restartTimeoutRef.current = window.setTimeout(() => {
      restartTimeoutRef.current = null;
      if (sessionActiveRef.current && !pausedRef.current && !finishingRef.current) startRecognitionRef.current?.();
    }, RESTART_DELAY_MS);
  }, [startTimer, updateState]);

  const resetError = useCallback(() => {
    setErrorMessage(null);
    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";
    setFinalTranscript("");
    setInterimTranscript("");
    updateState("idle");
  }, [updateState]);

  useEffect(() => () => {
    sessionActiveRef.current = false;
    cancellingRef.current = true;
    clearScheduledWork();
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      try { recognition.abort(); } catch { /* already stopped */ }
    }
    if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    if (audioContextRef.current && audioContextRef.current.state !== "closed") void audioContextRef.current.close();
  }, [clearScheduledWork]);

  return {
    state,
    durationSeconds,
    isApproachingLimit,
    amplitude,
    finalTranscript,
    interimTranscript,
    errorMessage,
    isSupported: getRecognitionConstructor() !== null,
    recognitionLanguage: recognitionLanguage(languageHint),
    startRecording,
    lockRecording,
    pauseRecording,
    resumeRecording,
    cancelRecording,
    finishRecording,
    resetError,
  };
}
