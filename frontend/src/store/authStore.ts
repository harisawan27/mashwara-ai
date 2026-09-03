import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  token: string | null;
  user: any | null;
  setToken: (token: string) => void;
  setUser: (user: any) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => {
      // Synchronously retrieve initial user from localStorage if available to prevent hydration delay
      let initialUser = null;
      try {
        const stored = localStorage.getItem("auth-storage");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.state && parsed.state.user) {
            initialUser = parsed.state.user;
          }
        }
      } catch (e) {
        console.error("Failed to parse persisted user", e);
      }

      return {
        token: localStorage.getItem("token"),
        user: initialUser,
        setToken: (token) => {
          localStorage.setItem("token", token);
          set({ token });
        },
        setUser: (user) => {
          set({ user });
        },
        logout: () => {
          localStorage.removeItem("token");
          set({ token: null, user: null });
        },
      };
    },
    {
      name: "auth-storage", // unique name for localStorage key
      partialize: (state) => ({ user: state.user }), // only persist user
    }
  )
);
