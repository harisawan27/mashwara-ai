/**
 * Boardroom AI — API Client
 * ===========================
 * Handles SSE streaming from the backend.
 * Supports: roles, thinking, chunk, report, error event types.
 */

import axios from "axios";

// ---------------------------------------------------------------------------
// Axios instance (for non-streaming calls like health check)
// ---------------------------------------------------------------------------
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
  timeout: 120_000,
  headers: { "Content-Type": "application/json" },
});

// Interceptor to inject JWT token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
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
  onFinal?: (agent: string, text: string, thinking: string) => void
) {
  try {
    const token = localStorage.getItem("token");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(
      `${import.meta.env.VITE_API_URL || "http://localhost:8000"}/chat/stream`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ template, prompt, session_id: sessionId }),
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
        if (line.startsWith("data: ")) {
          const dataStr = line.substring(6);
          try {
            const data = JSON.parse(dataStr);
            switch (data.type) {
              case "roles":
                onRoles(data.data);
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

export async function streamStandardMessage(
  sessionId: string,
  message: string,
  onThinking: (text: string) => void,
  onChunk: (text: string) => void,
  onError: (error: string) => void,
  onComplete: () => void,
  abortSignal?: AbortSignal
) {
  try {
    const token = localStorage.getItem("token");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(`${apiClient.defaults.baseURL}/chat/stream_message`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        session_id: sessionId,
        message,
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

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            const dataStr = line.substring("data: ".length);
            if (!dataStr) continue;
            
            const data = JSON.parse(dataStr);
            if (data.type === "thinking" && data.text) {
              onThinking(data.text);
            } else if (data.type === "chunk" && data.text) {
              onChunk(data.text);
            } else if (data.type === "error") {
              onError(data.message);
            } else if (data.type === "done") {
              onComplete();
            }
          } catch (e) {
            console.error("Error parsing SSE line", line, e);
          }
        }
      }
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      onError("Generation stopped.");
    } else {
      onError(error.message);
    }
  }
}
