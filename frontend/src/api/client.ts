/**
 * Boardroom AI — API Client
 * ===========================
 * Handles SSE streaming from the backend.
 * Supports: roles, thinking, chunk, report, error event types.
 */

import axios from "axios";
import type { AttachmentItem, AudioPresignResponse, AudioTranscribeResponse, SummaryAudioResponse } from "../types/meeting";

// ---------------------------------------------------------------------------
// Axios instance (for non-streaming calls like health check)
// ---------------------------------------------------------------------------
const API_BASE = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export function getGuestScopeHeaders(): Record<string, string> {
  const token = localStorage.getItem("token");
  if (token) return {};

  let scopeId = sessionStorage.getItem("mashwara_guest_scope_id");
  let secret = sessionStorage.getItem("mashwara_guest_scope_secret");
  if (!scopeId) {
    scopeId = "guest_" + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    sessionStorage.setItem("mashwara_guest_scope_id", scopeId);
  }
  if (!secret) {
    secret = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    sessionStorage.setItem("mashwara_guest_scope_secret", secret);
  }
  return {
    "X-Guest-Scope-Id": scopeId,
    "X-Guest-Scope-Secret": secret,
  };
}

const apiClient = axios.create({
  baseURL: API_BASE,
  timeout: 120_000,
  headers: { "Content-Type": "application/json" },
});

// Interceptor to inject JWT token or guest scope credentials
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  } else if (config.headers) {
    const guestHeaders = getGuestScopeHeaders();
    Object.entries(guestHeaders).forEach(([k, v]) => {
      config.headers[k] = v;
    });
  }
  return config;
});

// ---------------------------------------------------------------------------
// Role info type (sent by backend at start of each meeting)
// ---------------------------------------------------------------------------
export interface RoleInfo {
  key: string;
  name: string;
  title: string;
  icon: string;
  color: string;
  description?: string;
  is_moderator?: boolean;
  is_dynamic?: boolean;
}

// ---------------------------------------------------------------------------
// Streaming Chat
// ---------------------------------------------------------------------------

/**
 * Submit a prompt and stream the board meeting responses.
 */
export async function streamChat(
  sessionId: string | null,
  template: string,
  prompt: string,
  onRoles: (roles: RoleInfo[]) => void,
  onThinking: (agent: string, text: string) => void,
  onChunk: (agent: string, text: string) => void,
  onStatus: (agent: string, status: string, message?: string) => void,
  onReport: (report: any) => void,
  onError: (error: string) => void,
  onComplete: () => void,
  abortSignal?: AbortSignal,
  onFinal?: (agent: string, text: string, thinking: string) => void,
  onChatSummary?: (summaryText: string) => void,
  attachmentContextId?: string,
  onEvidence?: (evidence: any) => void,
  webSearchMode?: string,
  webEvidence?: any,
  onWebEvidence?: (webEvidence: any) => void
) {
  try {
    const token = localStorage.getItem("token");
    const currentLang = localStorage.getItem("mashwara_language") || "ur";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept-Language": currentLang,
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    } else {
      const guestHeaders = getGuestScopeHeaders();
      Object.entries(guestHeaders).forEach(([k, v]) => {
        headers[k] = v;
      });
    }

    const response = await fetch(
      `${API_BASE}/chat/stream`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          template,
          prompt,
          session_id: sessionId,
          language: currentLang,
          attachment_context_id: attachmentContextId || undefined,
          web_search_mode: webSearchMode || "auto",
          web_evidence: webEvidence || undefined,
        }),
        signal: abortSignal,
      }
    );

    if (!response.body) throw new Error("ReadableStream not supported");

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const cleanLine = line.endsWith("\r") ? line.slice(0, -1) : line;
        if (cleanLine.startsWith("data: ")) {
          const dataStr = cleanLine.substring(6);
          try {
            const data = JSON.parse(dataStr);
            switch (data.type) {
              case "roles":
                onRoles(data.data);
                break;
              case "evidence":
                if (onEvidence) onEvidence(data.data);
                break;
              case "web_evidence":
                if (onWebEvidence) onWebEvidence(data.data);
                break;
              case "status":
                onStatus(data.agent, data.status, data.message);
                break;
              case "thinking":
                onThinking(data.agent, data.text);
                break;
              case "chunk":
                onChunk(data.agent, data.text);
                break;
              case "final":
                // Replace raw streamed text with clean post-processed version
                if (onFinal) onFinal(data.agent, data.text, data.thinking || "");
                break;
              case "report":
                onReport(data.data);
                break;
              case "chat_summary":
                if (onChatSummary) onChatSummary(data.text);
                break;
              case "error":
                onError(data.message);
                break;
            }
          } catch (e) {
            console.error("Failed to parse SSE data", e, dataStr);
          }
        }
      }
    }
    onComplete();
  } catch (error: any) {
    if (error.name === 'AbortError') {
      onError("Generation stopped.");
    } else {
      onError(error instanceof Error ? error.message : "Stream failed");
    }
    onComplete();
  }
}

/**
 * Check if the backend API is healthy.
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const response = await apiClient.get<{ status: string }>("/health");
    return response.data.status === "ok";
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Auth & History API
// ---------------------------------------------------------------------------

export interface GoogleAuthResponse {
  access_token: string;
  token_type: string;
  user: {
    id: string;
    email: string;
    profile_data?: any;
  };
}

export async function loginWithGoogle(credential: string): Promise<GoogleAuthResponse> {
  const response = await apiClient.post<GoogleAuthResponse>("/auth/google", { credential });
  return response.data;
}

export async function login(email: string, password: string): Promise<string> {
  const response = await apiClient.post("/auth/login", { email, password });
  return response.data.access_token;
}

export async function register(email: string, password: string): Promise<string> {
  const response = await apiClient.post("/auth/register", { email, password });
  return response.data.access_token;
}

export async function fetchMeetings(): Promise<any[]> {
  const response = await apiClient.get("/meetings");
  return response.data;
}

export async function getMe(): Promise<any> {
  const response = await apiClient.get("/auth/me");
  return response.data;
}

export async function updateProfile(profileData: any): Promise<any> {
  const response = await apiClient.put("/auth/profile", profileData);
  return response.data;
}

export async function deleteAccount(): Promise<any> {
  const response = await apiClient.delete("/auth/me");
  return response.data;
}

// ---------------------------------------------------------------------------
// Copilot Chat & Sessions API
// ---------------------------------------------------------------------------

export async function createSession(): Promise<any> {
  const response = await apiClient.post("/chat/sessions");
  return response.data;
}

export async function getSessions(): Promise<any[]> {
  const response = await apiClient.get("/chat/sessions");
  return response.data;
}

export async function getSession(sessionId: string): Promise<any> {
  const response = await apiClient.get(`/chat/sessions/${sessionId}`);
  return response.data;
}

export async function renameSession(sessionId: string, title: string): Promise<any> {
  const response = await apiClient.put(`/chat/sessions/${sessionId}`, { title });
  return response.data;
}

export async function deleteSession(sessionId: string): Promise<any> {
  const response = await apiClient.delete(`/chat/sessions/${sessionId}`);
  return response.data;
}

export async function deleteLastTurn(sessionId: string): Promise<any> {
  const response = await apiClient.delete(`/chat/sessions/${sessionId}/last_turn`);
  return response.data;
}

export async function sendStandardMessage(sessionId: string, message: string): Promise<any> {
  const response = await apiClient.post("/chat/message", { session_id: sessionId, message });
  return response.data;
}


// ---------------------------------------------------------------------------
// Document Attachment Endpoints
// ---------------------------------------------------------------------------
export interface PresignAttachmentResponse {
  upload_url: string;
  attachment_id: string;
  context_id: string;
  gcs_path: string;
  expires_in_seconds: number;
}

export async function presignAttachment(params: {
  filename: string;
  content_type: string;
  size_bytes: number;
  context_id?: string;
  session_id?: string;
}): Promise<PresignAttachmentResponse> {
  const res = await apiClient.post<PresignAttachmentResponse>("/attachments/presign", params);
  return res.data;
}

export async function completeAttachment(attachmentId: string): Promise<AttachmentItem> {
  const res = await apiClient.post<AttachmentItem>(`/attachments/${encodeURIComponent(attachmentId)}/complete`);
  return res.data;
}

export async function deleteAttachment(attachmentId: string): Promise<void> {
  await apiClient.delete(`/attachments/${encodeURIComponent(attachmentId)}`);
}

export async function deleteAttachmentContext(contextId: string): Promise<void> {
  await apiClient.delete(`/attachments/contexts/${encodeURIComponent(contextId)}`);
}

export async function getAttachments(contextId: string): Promise<AttachmentItem[]> {
  const res = await apiClient.get<AttachmentItem[]>("/attachments", {
    params: { context_id: contextId },
  });
  return res.data;
}

export function uploadFileToSignedUrl(
  uploadUrl: string,
  file: File,
  contentType: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Content-Type", contentType);

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          onProgress(pct);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Storage upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error("Network error during file upload to storage"));
    };

    xhr.send(file);
  });
}

// ---------------------------------------------------------------------------
// Voice Note STT Methods (Phase 4)
// ---------------------------------------------------------------------------
export async function presignAudioUpload(params: {
  content_type: string;
  size_bytes: number;
  duration_seconds?: number;
  language_hint?: string;
}): Promise<AudioPresignResponse> {
  const res = await apiClient.post<AudioPresignResponse>("/audio/presign", params);
  return res.data;
}

export function uploadAudioBlobToGCS(
  uploadUrl: string,
  blob: Blob,
  contentType: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Content-Type", contentType);

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          onProgress(pct);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Audio upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error("Network error during audio upload to temporary storage"));
    };

    xhr.send(blob);
  });
}

export async function transcribeAudioNote(
  audioId: string,
  params: {
    gcs_key?: string;
    content_type?: string;
    language_hint?: string;
    transliterate_roman?: boolean;
  }
): Promise<AudioTranscribeResponse> {
  const res = await apiClient.post<AudioTranscribeResponse>(
    `/audio/${encodeURIComponent(audioId)}/transcribe`,
    params
  );
  return res.data;
}

export async function cancelAudioUpload(audioId: string): Promise<void> {
  try {
    await apiClient.delete(`/audio/${encodeURIComponent(audioId)}`);
  } catch (err) {
    console.warn("Could not delete temporary audio object:", err);
  }
}

export interface StandardChatAction {
  type?: string;
  action: string;
  decision_prompt: string;
  attachment_context_id?: string;
  web_evidence?: any;
  web_search_mode?: string;
}

export async function streamStandardMessage(
  sessionId: string | null,
  message: string,
  onThinking: (text: string) => void,
  onChunk: (text: string) => void,
  onError: (error: string) => void,
  onComplete: () => void,
  abortSignal?: AbortSignal,
  history?: Array<{ role: string; content: string; attachment_context_id?: string; web_evidence?: any; web_search_mode?: string }>,
  onAction?: (actionData: StandardChatAction) => void,
  attachmentContextId?: string,
  webSearchMode?: string,
  onSources?: (sourcesData: { sources: any[]; searched_at?: string }) => void
) {
  try {
    const token = localStorage.getItem("token");
    const currentLang = localStorage.getItem("mashwara_language") || "ur";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept-Language": currentLang,
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    } else {
      const guestHeaders = getGuestScopeHeaders();
      Object.entries(guestHeaders).forEach(([k, v]) => {
        headers[k] = v;
      });
    }

    const response = await fetch(`${apiClient.defaults.baseURL}/chat/stream_message`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        session_id: sessionId,
        message,
        language: currentLang,
        history,
        attachment_context_id: attachmentContextId || undefined,
        web_search_mode: webSearchMode || "auto",
      }),
      signal: abortSignal,
    });

    if (!response.ok) {
      const text = await response.text();
      onError(`Stream failed: ${response.status} ${text}`);
      return;
    }

    if (!response.body) throw new Error("No response body");

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let isCompleted = false;

    const triggerComplete = () => {
      if (!isCompleted) {
        isCompleted = true;
        onComplete();
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const cleanLine = line.endsWith("\r") ? line.slice(0, -1) : line;
        if (cleanLine.startsWith("data: ")) {
          const dataStr = cleanLine.substring(6);
          try {
            const data = JSON.parse(dataStr);
            if (data.type === "action") {
              if (onAction) {
                onAction({
                  action: data.action,
                  decision_prompt: data.decision_prompt,
                  attachment_context_id: data.attachment_context_id,
                  web_evidence: data.web_evidence,
                  web_search_mode: data.web_search_mode,
                });
              }
            } else if (data.type === "sources") {
              if (onSources) {
                onSources(data.data);
              }
            } else if (data.type === "thinking" && data.text) {
              onThinking(data.text);
            } else if (data.type === "chunk" && data.text) {
              onChunk(data.text);
            } else if (data.type === "error") {
              onError(data.message);
            } else if (data.type === "done") {
              triggerComplete();
            }
          } catch (e) {
            console.error("Failed to parse SSE data", e, dataStr);
          }
        }
      }
    }

    if (buffer) {
      const cleanLine = buffer.endsWith("\r") ? buffer.slice(0, -1) : buffer;
      if (cleanLine.startsWith("data: ")) {
        const dataStr = cleanLine.substring(6);
        try {
          const data = JSON.parse(dataStr);
          if (data.type === "action") {
            if (onAction) {
              onAction({
                action: data.action,
                decision_prompt: data.decision_prompt,
                attachment_context_id: data.attachment_context_id,
                web_evidence: data.web_evidence,
                web_search_mode: data.web_search_mode,
              });
            }
          } else if (data.type === "sources") {
            if (onSources) {
              onSources(data.data);
            }
          } else if (data.type === "thinking" && data.text) {
            onThinking(data.text);
          } else if (data.type === "chunk" && data.text) {
            onChunk(data.text);
          } else if (data.type === "error") {
            onError(data.message);
          } else if (data.type === "done") {
            triggerComplete();
          }
        } catch (e) {
          console.error("Failed to parse trailing SSE data", e, dataStr);
        }
      }
    }

    triggerComplete();
  } catch (error: any) {
    if (error.name === 'AbortError') {
      onError("Generation stopped.");
    } else {
      onError(error.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Shared Mashwara API
// ---------------------------------------------------------------------------
export interface SharedMashwaraExpert {
  role_id: string;
  name: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  analysis: string;
  vote: string;
  confidence: number;
}

export interface SharedMashwaraSnapshot {
  decision_title: string;
  language: string;
  domain: string;
  template: string;
  experts: SharedMashwaraExpert[];
  report: {
    final_decision: string;
    confidence_score: number;
    board_votes: Record<string, { vote: string; confidence: number }>;
    debate_summary: string;
    key_risks: string[];
    recommended_actions: string[];
    agreement?: string;
    disagreement?: string;
    assumptions?: string[];
    what_would_change?: string;
  };
  created_at: string;
}

export interface PublicSharedMashwaraData {
  share_id: string;
  language: string;
  decision_title: string;
  snapshot: SharedMashwaraSnapshot;
  created_at: string;
}

export interface CreateShareResponse {
  share_id: string;
  share_url: string;
}

export async function createSharedMashwara(payload: {
  meeting_id?: string;
  snapshot?: any;
  language?: string;
  decision_title?: string;
}): Promise<CreateShareResponse> {
  const res = await apiClient.post<CreateShareResponse>("/shared-mashwaras", payload);
  return res.data;
}

export class SharedMashwaraError extends Error {
  status?: number;
  isNotFound?: boolean;
  constructor(message: string, status?: number, isNotFound: boolean = false) {
    super(message);
    this.name = "SharedMashwaraError";
    this.status = status;
    this.isNotFound = isNotFound;
  }
}

export async function getSharedMashwara(shareId: string): Promise<PublicSharedMashwaraData> {
  const url = `${API_BASE}/shared-mashwaras/${encodeURIComponent(shareId)}`;

  const doFetch = async (): Promise<PublicSharedMashwaraData> => {
    // Genuinely anonymous simple GET: no Content-Type, no Authorization, only Accept header.
    // Avoids CORS preflight requirements on public read endpoints.
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (res.status === 404) {
      throw new SharedMashwaraError("Shared Mashwara not found", 404, true);
    }

    if (!res.ok) {
      throw new SharedMashwaraError(
        `Server returned ${res.status}: ${res.statusText}`,
        res.status,
        false
      );
    }

    return await res.json();
  };

  try {
    return await doFetch();
  } catch (err: any) {
    // Never retry a genuine 404
    if (err?.isNotFound || err?.status === 404) {
      throw err;
    }

    // Network error / CORS / 5xx: automatically retry ONCE after short delay (800ms)
    console.warn("[Shared Mashwara] First attempt failed, retrying once after 800ms...", err);
    await new Promise((resolve) => setTimeout(resolve, 800));

    try {
      return await doFetch();
    } catch (retryErr: any) {
      console.error("[Shared Mashwara] Public GET retry also failed:", retryErr);
      if (retryErr?.isNotFound || retryErr?.status === 404) {
        throw retryErr;
      }
      throw new SharedMashwaraError(
        retryErr?.message || "Temporary connection issue loading shared consultation",
        retryErr?.status,
        false
      );
    }
  }
}

/**
 * Fetches or generates V4 signed download URL for companion executive summary narration.
 * Endpoint: POST /meetings/{meetingId}/summary-audio
 */
export async function getSummaryAudio(meetingId: string): Promise<SummaryAudioResponse> {
  const response = await apiClient.post<SummaryAudioResponse>(`/meetings/${meetingId}/summary-audio`);
  return response.data;
}
