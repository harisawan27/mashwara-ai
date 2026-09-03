import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getSessions } from '../api/client';

export interface SessionInfo {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface SessionState {
  sessions: SessionInfo[];
  loading: boolean;
  fetchSessions: () => Promise<void>;
  addSession: (session: SessionInfo) => void;
  updateSessionTitle: (id: string, title: string) => void;
  removeSession: (id: string) => void;
  clearSessions: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => {
      // Synchronously retrieve initial sessions from localStorage if available to prevent hydration delay
      let initialSessions: SessionInfo[] = [];
      try {
        const stored = localStorage.getItem("session-storage");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.state && Array.isArray(parsed.state.sessions)) {
            initialSessions = parsed.state.sessions;
          }
        }
      } catch (e) {
        console.error("Failed to parse persisted sessions", e);
      }

      return {
        sessions: initialSessions,
        loading: false,
        fetchSessions: async () => {
          // If we don't have sessions yet, show loading. Otherwise fetch silently.
          set((state) => ({ loading: state.sessions.length === 0 }));
          try {
            const data = await getSessions();
            set({ sessions: data, loading: false });
          } catch (err) {
            console.error("Failed to fetch sessions", err);
            set({ loading: false });
          }
        },
        addSession: (session) => set((state) => ({ sessions: [session, ...state.sessions] })),
        updateSessionTitle: (id, title) => set((state) => ({
          sessions: state.sessions.map((s) => s.id === id ? { ...s, title } : s)
        })),
        removeSession: (id) => set((state) => ({
          sessions: state.sessions.filter((s) => s.id !== id)
        })),
        clearSessions: () => set({ sessions: [] })
      };
    },
    {
      name: "session-storage",
      partialize: (state) => ({ sessions: state.sessions }),
    }
  )
);
