import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { streamChat, getSession, createSession, streamStandardMessage, deleteLastTurn, getMe, exchangeNeonAuthSession, getNeonAuthConfig } from "../api/client";
import type { RoleInfo } from "../api/client";
import { getNeonAuthClient } from "../auth/neonAuth";
import MeetingCanvas from "../components/MeetingCanvas";
import AuthModal from "../components/AuthModal";
import Sidebar from "../components/Sidebar";
import TutorialModal from "../components/TutorialModal";
import { LocalizedBrand } from "../components/LocalizedBrand";
import { useAuthStore } from "../store/authStore";
import { useSessionStore, deriveSessionTitle } from "../store/sessionStore";
import { TEMPLATES } from "../types/meeting";
import { useTranslation } from "../i18n";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  is_agentic?: boolean;
  meeting?: any;
  thinking?: string;
}

interface ActiveMeetingData {
  id?: string;
  template: string;
  decisionTitle: string;
  report?: any;
  streams?: Record<string, { status: "idle" | "thinking" | "done" | "waiting"; thinking: string; text: string }>;
  rolesInfo?: RoleInfo[];
}

export default function Dashboard() {
  const token = useAuthStore((state) => state.token);
  const setToken = useAuthStore((state) => state.setToken);
  const setUser = useAuthStore((state) => state.setUser);
  const fetchSessions = useSessionStore((state) => state.fetchSessions);
  const addSession = useSessionStore((state) => state.addSession);
  const sessions = useSessionStore((state) => state.sessions);
  const updateSessionTitle = useSessionStore((state) => state.updateSessionTitle);
  const { sessionId: routeSessionId } = useParams<{ sessionId?: string }>();
  const navigate = useNavigate();
  const abortControllerRef = useRef<AbortController | null>(null);
  const { t, isRTL } = useTranslation();
  
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("STARTUP_BOARD");
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>(routeSessionId);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editInput, setEditInput] = useState("");
  const [thinkingExpandedId, setThinkingExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (routeSessionId) {
      if (token) {
        if (activeSessionId !== routeSessionId) {
          loadSession(routeSessionId);
        }
      } else {
        navigate("/", { replace: true });
      }
    } else if (activeSessionId && !routeSessionId) {
      setActiveSessionId(undefined);
      setMessages([]);
    }
  }, [routeSessionId, token]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };
  
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [hasSeenTutorial, setHasSeenTutorial] = useState(() => localStorage.getItem("hasSeenTutorial") === "true");

  const [isConveneBoardSelected, setIsConveneBoardSelected] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const [isCanvasOpen, setIsCanvasOpen] = useState(false);
  const [activeMeetingData, setActiveMeetingData] = useState<ActiveMeetingData | null>(null);

  const endOfChatRef = useRef<HTMLDivElement>(null);

  // Handle OAuth return from Neon Auth Google sign-in
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("neon_auth")) {
      const handleNeonOAuthReturn = async () => {
        try {
          let neonAuthUrl = import.meta.env.VITE_NEON_AUTH_URL;
          if (!neonAuthUrl) {
            try {
              const cfg = await getNeonAuthConfig();
              neonAuthUrl = cfg.neon_auth_url;
            } catch {
              neonAuthUrl = "https://ep-muddy-frog-adaf15fz.neonauth.c-2.us-east-1.aws.neon.tech/neondb/auth";
            }
          }

          // 1. Extract any token directly from URL search or hash
          const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
          let foundToken = params.get("session_token") || params.get("token") || hashParams.get("token") || hashParams.get("access_token") || undefined;

          // 2. Query Neon Auth session using official Neon Auth SDK
          if (!foundToken) {
            try {
              const authClient = getNeonAuthClient(neonAuthUrl);
              const sessionRes = await authClient.getSession();
              if ((sessionRes as any)?.data?.session?.token) {
                foundToken = (sessionRes as any).data.session.token;
              } else if ((sessionRes as any)?.session?.token) {
                foundToken = (sessionRes as any).session.token;
              } else if ((sessionRes as any)?.data?.token) {
                foundToken = (sessionRes as any).data.token;
              }
            } catch (err) {
              console.warn("Could not retrieve session from Neon Auth client directly:", err);
            }
          }

          // 3. Fallback to /get-session with credentials include if SDK didn't return token in field
          if (!foundToken) {
            try {
              const sessionRes = await fetch(`${neonAuthUrl}/get-session`, {
                credentials: "include",
              });
              if (sessionRes.ok) {
                const sessionData = await sessionRes.json();
                foundToken = sessionData?.session?.token || sessionData?.token;
              }
            } catch (err) {
              console.warn("Raw get-session query failed:", err);
            }
          }

          // 4. Deterministically exchange verified, user-bound session token with backend
          if (foundToken) {
            const res = await exchangeNeonAuthSession(foundToken);
            if (res && res.access_token) {
              setToken(res.access_token);
              if (res.user) setUser(res.user);
              fetchSessions();

              // Restore guest workspace state if saved before OAuth redirect
              const savedGuest = sessionStorage.getItem("mashwara_guest_workspace");
              if (savedGuest) {
                try {
                  const data = JSON.parse(savedGuest);
                  if (data.messages && data.messages.length > 0) setMessages(data.messages);
                  if (data.input) setInput(data.input);
                  if (data.selectedTemplate) setSelectedTemplate(data.selectedTemplate);
                } catch (parseErr) {
                  console.warn("Failed to restore guest workspace:", parseErr);
                }
                sessionStorage.removeItem("mashwara_guest_workspace");
              }
            }
          } else {
            console.error("No valid user-bound Neon session token found after Google OAuth callback");
          }
        } catch (err) {
          console.error("Neon Auth exchange error:", err);
        } finally {
          const url = new URL(window.location.href);
          url.searchParams.delete("neon_auth");
          url.searchParams.delete("token");
          url.searchParams.delete("session_token");
          window.history.replaceState({}, document.title, url.pathname);
        }
      };
      handleNeonOAuthReturn();
    }
  }, [setToken, setUser, fetchSessions]);

  // Persist guest workspace temporarily before external OAuth redirect so conversations survive
  useEffect(() => {
    if (!token && (messages.length > 0 || input.trim())) {
      sessionStorage.setItem(
        "mashwara_guest_workspace",
        JSON.stringify({ messages, input, selectedTemplate })
      );
    }
  }, [token, messages, input, selectedTemplate]);

  useEffect(() => {
    if (token) {
      // Prefetch profile info silently to keep UI fresh
      getMe()
        .then((data) => {
          setUser(data);
        })
        .catch((err) => {
          console.error("Failed to prefetch profile info", err);
        });
      // Fetch latest sessions silently
      fetchSessions();
    }
  }, [token, setUser, fetchSessions]);

  useEffect(() => {
    endOfChatRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleCloseTutorial = () => {
    setIsTutorialOpen(false);
    setHasSeenTutorial(true);
    localStorage.setItem("hasSeenTutorial", "true");
  };

  const handleSend = async (e: React.FormEvent) => {
    if (isConveneBoardSelected) {
      handleConveneBoard();
    } else {
      handleStandardChat(e);
    }
  };

  const loadSession = async (sessionId: string) => {
    try {
      const data = await getSession(sessionId);
      setMessages(data.messages || []);
      setActiveSessionId(sessionId);
    } catch (err) {
      console.error("Failed to load session:", err);
      setActiveSessionId(undefined);
      setMessages([]);
      navigate("/", { replace: true });
    }
  };

  const handleSelectSession = (session: any | null) => {
    if (!session) {
      setActiveSessionId(undefined);
      setMessages([]);
      setInput("");
      setIsProcessing(false);
      navigate("/");
      return;
    }
    navigate(`/c/${session.id}`);
  };

  const handleStandardChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;

    const userText = input.trim();
    setInput("");
    setIsProcessing(true);

    try {
      let sessionId = activeSessionId;
      if (token && !sessionId) {
        const newSession = await createSession();
        sessionId = newSession.id;
        const derivedTitle = deriveSessionTitle(userText);
        newSession.title = derivedTitle;
        setActiveSessionId(newSession.id);
        addSession(newSession);
        updateSessionTitle(newSession.id, derivedTitle);
        navigate(`/c/${newSession.id}`, { replace: true });
      } else if (token && sessionId) {
        const currentSession = sessions.find((s) => s.id === sessionId);
        if (currentSession && (currentSession.title === "New Brainstorming Session" || !currentSession.title)) {
          const derivedTitle = deriveSessionTitle(userText);
          updateSessionTitle(sessionId, derivedTitle);
        }
      }

      const tempUserId = Date.now().toString();
      const tempAsstId = (Date.now() + 1).toString();
      
      setMessages(prev => [...prev, { id: tempUserId, role: "user", content: userText }]);
      setMessages(prev => [...prev, { id: tempAsstId, role: "assistant", content: "", thinking: "" }]);

      const recentHistory = messages.slice(-8).map(m => ({
        role: m.role,
        content: m.content || ""
      }));

      abortControllerRef.current = new AbortController();

      await streamStandardMessage(
        token ? (sessionId as string) : null,
        userText,
        (text) => {
          setMessages(prev => prev.map(m => m.id === tempAsstId ? { ...m, thinking: (m.thinking || "") + text } : m));
        },
        (text) => {
          setMessages(prev => prev.map(m => m.id === tempAsstId ? { ...m, content: (m.content || "") + text } : m));
        },
        (error) => {
          console.error(error);
          setIsProcessing(false);
        },
        () => {
          setIsProcessing(false);
        },
        abortControllerRef.current.signal,
        recentHistory
      );
    } catch (err) {
      console.error(err);
      setIsProcessing(false);
    }
  };

  const handleUpdatePrompt = async () => {
    if (!editInput.trim() || isProcessing) return;
    setIsProcessing(true);
    setEditingMessageId(null);
    
    try {
      if (token && activeSessionId) {
        await deleteLastTurn(activeSessionId);
      }
      
      const userText = editInput.trim();
      setMessages(prev => prev.slice(0, -2)); 
      
      const tempUserId = Date.now().toString();
      const tempAsstId = (Date.now() + 1).toString();
      
      setMessages(prev => [...prev, { id: tempUserId, role: "user", content: userText }]);
      setMessages(prev => [...prev, { id: tempAsstId, role: "assistant", content: "", thinking: "" }]);

      const recentHistory = messages.slice(0, -2).slice(-8).map(m => ({
        role: m.role,
        content: m.content || ""
      }));

      abortControllerRef.current = new AbortController();

      await streamStandardMessage(
        token ? (activeSessionId as string) : null,
        userText,
        (text) => {
          setMessages(prev => prev.map(m => m.id === tempAsstId ? { ...m, thinking: (m.thinking || "") + text } : m));
        },
        (text) => {
          setMessages(prev => prev.map(m => m.id === tempAsstId ? { ...m, content: (m.content || "") + text } : m));
        },
        (error) => {
          console.error(error);
          setIsProcessing(false);
        },
        () => {
          setIsProcessing(false);
        },
        abortControllerRef.current.signal,
        recentHistory
      );
    } catch (err) {
      console.error(err);
      setIsProcessing(false);
    }
  };

  const handleConveneBoard = async () => {
    if (!input.trim() || isProcessing) return;

    const userText = input.trim();
    setInput("");
    setIsProcessing(true);

    try {
      let sessionId = activeSessionId;
      if (token && !sessionId) {
        const newSession = await createSession();
        sessionId = newSession.id;
        const derivedTitle = deriveSessionTitle(userText);
        newSession.title = derivedTitle;
        setActiveSessionId(newSession.id);
        addSession(newSession);
        updateSessionTitle(newSession.id, derivedTitle);
        navigate(`/c/${newSession.id}`, { replace: true });
      } else if (token && sessionId) {
        const currentSession = sessions.find((s) => s.id === sessionId);
        if (currentSession && (currentSession.title === "New Brainstorming Session" || !currentSession.title)) {
          const derivedTitle = deriveSessionTitle(userText);
          updateSessionTitle(sessionId, derivedTitle);
        }
      }

      const tempUserId = Date.now().toString();
      const tempAsstId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, 
        { id: tempUserId, role: "user", content: userText },
        { id: tempAsstId, role: "assistant", content: t.chat.conveneNotice, is_agentic: true }
      ]);

      const newMeetingData: ActiveMeetingData = {
        template: selectedTemplate,
        decisionTitle: t.canvas.liveDeliberation,
        streams: {},
      };
      
      setActiveMeetingData(newMeetingData);
      setIsCanvasOpen(true);
      abortControllerRef.current = new AbortController();

      await streamChat(
        token ? (sessionId as string) : null,
        selectedTemplate,
        userText,
        (roles) => {
          setActiveMeetingData(prev => {
            if (!prev) return prev;
            const initialStreams: any = {};
            roles.forEach(r => {
              if (r.key !== "Moderator") {
                initialStreams[r.key] = { text: "", thinking: "", status: "idle" };
              }
            });
            return { ...prev, rolesInfo: roles, streams: initialStreams };
          });
        },
        (agent, text) => {
          setActiveMeetingData((prev: ActiveMeetingData | null) => {
            if (!prev || !prev.streams || !prev.streams[agent]) return prev;
            const updatedStreams = { ...prev.streams };
            updatedStreams[agent] = {
              ...updatedStreams[agent],
              thinking: updatedStreams[agent].thinking + text,
              status: "thinking"
            };
            return { ...prev, streams: updatedStreams };
          });
        },
        (agent, text) => {
          setActiveMeetingData((prev: ActiveMeetingData | null) => {
            if (!prev || !prev.streams || !prev.streams[agent]) return prev;
            const updatedStreams = { ...prev.streams };
            updatedStreams[agent] = {
              ...updatedStreams[agent],
              text: updatedStreams[agent].text + text,
              status: "thinking"
            };
            return { ...prev, streams: updatedStreams };
          });
        },
        (agent, status, message) => {
          setActiveMeetingData((prev: ActiveMeetingData | null) => {
            if (!prev || !prev.streams || !prev.streams[agent]) return prev;
            const updatedStreams = { ...prev.streams };
            updatedStreams[agent] = {
              ...updatedStreams[agent],
              status: status as "idle" | "thinking" | "done" | "waiting",
              text: message ? message : updatedStreams[agent].text
            };
            return { ...prev, streams: updatedStreams };
          });
        },
        (reportData) => {
          setActiveMeetingData((prev: ActiveMeetingData | null) => {
            if (!prev) return prev;
            const updatedStreams = { ...(prev.streams || {}) };
            for (const a in updatedStreams) {
              updatedStreams[a] = { ...updatedStreams[a], status: "done" };
            }
            return { ...prev, streams: updatedStreams, report: reportData };
          });
        },
        (err) => {
          console.error("Board error:", err);
          // Mark all in-progress agents as done so canvas stops spinning
          setActiveMeetingData(prev => {
            if (!prev || !prev.streams) return prev;
            const frozen: typeof prev.streams = {};
            for (const key of Object.keys(prev.streams)) {
              frozen[key] = { ...prev.streams![key], status: "done" };
            }
            return { ...prev, streams: frozen };
          });
          setIsProcessing(false);
          if (sessionId) loadSession(sessionId as string);
        },
        () => {
          setIsProcessing(false);
          loadSession(sessionId as string);
        },
        abortControllerRef.current.signal,
        // onFinal: replace raw streamed text with clean post-processed version
        (agent, text, thinking) => {
          setActiveMeetingData((prev: ActiveMeetingData | null) => {
            if (!prev || !prev.streams) return prev;
            const updatedStreams = { ...prev.streams };
            updatedStreams[agent] = {
              text,
              thinking,
              status: "done"
            };
            return { ...prev, streams: updatedStreams };
          });
        }
      );

    } catch (err) {
      console.error(err);
      setIsProcessing(false);
    }
  };

  return (
    <div className="h-[100dvh] flex relative overflow-hidden bg-slate-50 dark:bg-[#06080f] transition-colors">
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full bg-[radial-gradient(ellipse,rgba(99,102,241,0.08)_0%,transparent_70%)] dark:bg-[radial-gradient(ellipse,rgba(99,102,241,0.05)_0%,transparent_70%)]" />
        <div className="absolute inset-0 dot-pattern opacity-60 dark:opacity-30" />
      </div>

      <Sidebar 
        onSelectSession={handleSelectSession} 
        selectedSessionId={activeSessionId} 
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onOpenTutorial={() => setIsTutorialOpen(true)}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
      />

      <div className="flex-1 flex flex-col relative z-10 h-screen w-full md:w-auto">
        <nav className="relative h-16 px-4 border-b border-slate-200 dark:border-white/5 flex items-center justify-between bg-slate-50/90 dark:bg-[#06080f]/90 backdrop-blur-xl shrink-0">
          <div className="flex items-center z-10">
            {!isSidebarOpen && (
              <button 
                type="button"
                onClick={() => setIsSidebarOpen(true)} 
                aria-label="Open sidebar"
                className="p-2 -ml-2 rtl:-mr-2 rtl:ml-0 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
              </button>
            )}
          </div>

          {/* Center-aligned Homepage Logo */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2.5 pointer-events-auto">
            <div className="w-8 h-8 rounded-lg bg-white shadow-md ring-1 ring-slate-900/5 flex items-center justify-center p-1">
              <img src="/boardroom-ai.svg" alt="Mashwara AI Logo" className="w-full h-full object-contain" />
            </div>
            <div className="w-px h-5 bg-slate-300 dark:bg-slate-700 hidden sm:block"></div>
            <LocalizedBrand className="text-lg font-extrabold tracking-tight" />
          </div>

          {/* Spacer to balance flex row */}
          <div className="w-8 z-10" aria-hidden="true" />
        </nav>

        <main className={`flex-1 ${messages.length === 0 ? "overflow-hidden flex flex-col" : "overflow-y-auto"} p-4 sm:p-6 custom-scrollbar relative`}>
          <div className={`max-w-3xl mx-auto w-full ${messages.length === 0 ? "flex-1 flex flex-col min-h-0 justify-center pb-28 sm:pb-32" : "space-y-6 pb-40"}`}>
            {/* Guest Banner */}
            {!token && (
              <div className="shrink-0 mb-3 p-3.5 sm:p-4 rounded-2xl bg-amber-500/[0.08] dark:bg-amber-500/[0.06] border border-amber-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-slide-up shadow-sm">
                <div className="flex items-start sm:items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="text-start">
                    <p className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {isRTL ? (
                        <>
                          آپ مہمان کے طور پر <LocalizedBrand firstClassName="font-bold text-slate-800 dark:text-slate-200" aiClassName="text-[#2563EB] font-black" className="mx-1" /> استعمال کر رہے ہیں۔ آپ کی گفتگو محفوظ نہیں ہوگی۔
                        </>
                      ) : (
                        t.guest.bannerNotice
                      )}
                    </p>
                    <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {t.guest.bannerSecondary}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAuthModalOpen(true)}
                  className="self-start sm:self-center shrink-0 py-2 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white text-xs font-semibold shadow-sm transition-all cursor-pointer"
                >
                  {t.guest.signInCta}
                </button>
              </div>
            )}
            {messages.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center text-center my-auto animate-fade-in px-4">
                <div className="inline-flex w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white shadow-xl ring-1 ring-slate-900/5 items-center justify-center mb-4 sm:mb-5 p-2.5 sm:p-3">
                  <img src="/boardroom-ai.svg" alt="Mashwara AI Logo" className="w-full h-full object-contain drop-shadow-sm" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-2">{t.emptyState.title}</h2>
                <p className="text-slate-600 dark:text-slate-400 mb-6 max-w-md mx-auto text-xs sm:text-sm leading-relaxed">
                  {isRTL ? (
                    <>
                      <LocalizedBrand firstClassName="font-medium text-slate-600 dark:text-slate-400" aiClassName="text-[#2563EB] font-black" className="mx-1" /> آپ کے معاملے کو مختلف ماہرین کی نظر سے دیکھ کر آپ کو متوازن اور قابلِ عمل مشورہ دے گا۔
                    </>
                  ) : (
                    t.emptyState.description
                  )}
                </p>

                {!hasSeenTutorial && (
                  <button 
                    onClick={() => setIsTutorialOpen(true)}
                    className="mb-6 mx-auto flex items-center gap-3 px-5 py-2.5 rounded-full bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 border border-blue-500/20 transition-all group font-medium text-xs sm:text-sm"
                  >
                    <div className="w-7 h-7 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-md shadow-blue-500/30 group-hover:scale-110 transition-transform">
                      <svg className="w-3.5 h-3.5 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    {t.emptyState.tutorialButton}
                  </button>
                )}

                <div className="flex flex-wrap gap-2 justify-center max-w-2xl mx-auto">
                  {t.emptyState.suggestedPrompts.map((q, i) => (
                    <button key={i} onClick={() => setInput(q)} className="px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-full border border-slate-200 dark:border-white/10 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-blue-500/50 hover:bg-blue-500/10 transition-all shadow-sm dark:shadow-none bg-white dark:bg-transparent">
                      "{q}"
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, index) => {
              const isLastUserMessage = msg.role === "user" && index === messages.map(m => m.role).lastIndexOf("user");
              
              return (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-slide-up group`}>
                {msg.role === "user" ? (
                  <div className="max-w-[85%] flex flex-col items-end w-full">
                    {editingMessageId === msg.id ? (
                      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-2xl p-3 shadow-lg">
                        <textarea
                          value={editInput}
                          onChange={(e) => setEditInput(e.target.value)}
                          className="w-full bg-transparent border-none focus:ring-0 resize-none text-slate-800 dark:text-slate-200 text-sm"
                          rows={3}
                          autoFocus
                        />
                        <div className="flex justify-end gap-2 mt-2">
                          <button onClick={() => setEditingMessageId(null)} className="px-4 py-1.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                            {t.common.cancel}
                          </button>
                          <button onClick={handleUpdatePrompt} className="px-4 py-1.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors">
                            {t.common.update}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 sm:px-5 py-3 sm:py-3.5 shadow-lg text-sm leading-relaxed whitespace-pre-wrap">
                          {msg.content}
                        </div>
                        <div className="flex items-center gap-1 mt-1 mr-1 text-slate-400">
                          {isLastUserMessage && (
                            <button onClick={() => { setEditingMessageId(msg.id); setEditInput(msg.content); }} className="p-1.5 hover:text-blue-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title={t.chat.editPrompt}>
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            </button>
                          )}
                          <button onClick={() => handleCopy(msg.content, msg.id)} className="p-1.5 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title={t.chat.copyPrompt}>
                            {copiedId === msg.id ? <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="w-full md:max-w-[85%] flex items-start gap-2 sm:gap-3">
                    <div className="w-8 h-8 rounded-full bg-white shadow-sm ring-1 ring-slate-900/5 flex items-center justify-center flex-shrink-0 p-1.5 hidden sm:flex">
                      <img src="/boardroom-ai.svg" alt="Avatar" className="w-full h-full object-contain" />
                    </div>
                    <div className="flex flex-col items-start w-full">
                      {(() => {
                        const { text, thinking } = (msg.role === "assistant" || msg.is_agentic)
                          ? (function() {
                              let t = msg.content || "";
                              let th = msg.thinking || "";
                              const match = t.match(/<think>([\s\S]*?)<\/think>/);
                              if (match) {
                                th = match[1];
                                t = t.replace(/<think>[\s\S]*?<\/think>/, "");
                              } else {
                                const openMatch = t.match(/<think>([\s\S]*)/);
                                if (openMatch && !msg.thinking) {
                                  th = openMatch[1];
                                  t = t.replace(/<think>[\s\S]*/, "");
                                }
                              }
                              return { text: t.trim(), thinking: th.trim() };
                            })()
                          : { text: msg.content, thinking: msg.thinking };

                        return (
                          <>
                          {thinking && (
                            <div className="mb-2 w-full max-w-xl">
                              <button 
                                onClick={() => setThinkingExpandedId(thinkingExpandedId === msg.id ? null : msg.id)}
                                className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors bg-slate-100 dark:bg-slate-800/50 px-3 py-1.5 rounded-full"
                              >
                                <svg className={`w-3.5 h-3.5 transition-transform ${thinkingExpandedId === msg.id ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                {isProcessing && index === messages.length - 1 ? (
                                  <span className="flex items-center gap-1">
                                    {t.chat.thinkingStatus}
                                  </span>
                                ) : t.chat.thoughtProcess}
                              </button>
                              {thinkingExpandedId === msg.id && (
                                <div className="mt-2 p-3 bg-slate-50 dark:bg-slate-800/30 border border-slate-200 dark:border-white/5 rounded-xl text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto custom-scrollbar">
                                  {thinking}
                                </div>
                              )}
                            </div>
                          )}
                          {text && (
                          <div className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200 rounded-2xl rounded-tl-sm px-3 sm:px-5 py-3 sm:py-3.5 shadow-sm text-sm leading-relaxed prose prose-slate dark:prose-invert max-w-none overflow-x-auto">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                          </div>
                          )}
                          {!text && !thinking && isProcessing && index === messages.length - 1 && !msg.is_agentic && (
                            <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 text-sm font-medium italic mt-2 ml-1">
                              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                              {t.chat.chiefOfStaffTyping}
                            </div>
                          )}
                          <div className="flex items-center gap-1 mt-1 ml-1 text-slate-400">
                            <button onClick={() => handleCopy(text, msg.id)} className="p-1.5 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title={t.chat.copyText}>
                              {copiedId === msg.id ? <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>}
                            </button>
                          </div>
                          </>
                        );
                      })()}
                      {msg.is_agentic && (
                        <button 
                          onClick={() => {
                            if (msg.meeting) {
                              const dbStreamsData = msg.meeting?.streams_data || {};
                              const streamsObj = Object.fromEntries(
                                Object.entries(dbStreamsData).filter(([k]) => k !== "_roles")
                              ) as Record<string, { status: "idle" | "thinking" | "done" | "waiting"; thinking: string; text: string }>;

                              setActiveMeetingData({
                                id: msg.meeting?.id,
                                template: msg.meeting?.template || "STARTUP_BOARD",
                                decisionTitle: msg.meeting?.prompt || t.canvas.boardMeeting,
                                report: msg.meeting?.report_data,
                                rolesInfo: dbStreamsData._roles || [],
                                streams: streamsObj
                              });
                              setIsCanvasOpen(true);
                            } else if (activeMeetingData) {
                              setIsCanvasOpen(true);
                            }
                          }}
                          className={`mt-3 flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-500/10 dark:to-indigo-500/10 hover:from-blue-100 hover:to-indigo-100 dark:hover:from-blue-500/20 dark:hover:to-indigo-500/20 border border-blue-200/50 dark:border-blue-500/20 text-blue-700 dark:text-blue-300 text-sm font-medium rounded-xl transition-all shadow-sm ${
                            isProcessing && index === messages.length - 1 ? 'animate-pulse' : ''
                          }`}
                        >
                          {isProcessing && index === messages.length - 1 ? (
                            <svg className="animate-spin w-4 h-4 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                          ) : (
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                          )}
                          {isProcessing && index === messages.length - 1 ? t.chat.deliberating : t.chat.openReport}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
              );
            })}
            <div ref={endOfChatRef} />
          </div>
        </main>

        {/* Input Command Center */}
        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 bg-gradient-to-t from-slate-50 via-slate-50/90 dark:from-[#06080f] dark:via-[#06080f]/90 to-transparent z-20 pointer-events-none">
          <div className="max-w-3xl mx-auto relative pointer-events-auto">
            <div className={`bg-white dark:bg-slate-900/90 backdrop-blur-md border rounded-2xl shadow-lg dark:shadow-none overflow-visible transition-all ${isConveneBoardSelected ? 'border-blue-500/50 shadow-blue-500/10 ring-1 ring-blue-500/20' : 'border-slate-200 dark:border-white/10 focus-within:ring-2 focus-within:ring-blue-500/50'}`}>
              
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={() => {
                  // Let default behavior (newline) happen for Enter, including Shift+Enter
                }}
                placeholder={t.chat.inputPlaceholder}
                className="w-full bg-transparent border-none py-3.5 sm:py-4 px-4 sm:px-5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:ring-0 resize-none max-h-48 custom-scrollbar text-sm sm:text-base outline-none"
                rows={Math.min(input.split("\n").length, 5) || 1}
                style={{ minHeight: '56px' }}
              />

              <div className="flex items-center justify-between px-2 pb-2">
                <div className="flex items-center gap-2 relative">
                  {/* Custom Dropdown for Template */}
                  <div className="relative">
                    <button
                      onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                      className="flex items-center gap-2 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                      {t.templates[selectedTemplate]?.name || TEMPLATES[selectedTemplate as keyof typeof TEMPLATES].name}
                      <svg className={`w-3 h-3 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    
                    {isDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setIsDropdownOpen(false)} />
                        <div className={`absolute bottom-full ${isRTL ? "right-0" : "left-0"} mb-2 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-20 overflow-hidden animate-fade-in`}>
                          {Object.keys(TEMPLATES).map((key) => (
                            <button
                              key={key}
                              onClick={() => {
                                setSelectedTemplate(key);
                                setIsDropdownOpen(false);
                              }}
                              className={`w-full text-start px-4 py-3 text-sm transition-colors ${selectedTemplate === key ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                            >
                              <div className="font-medium">{t.templates[key]?.name || TEMPLATES[key as keyof typeof TEMPLATES].name}</div>
                              <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">{t.templates[key]?.description || TEMPLATES[key as keyof typeof TEMPLATES].description}</div>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  
                  {/* Convene Toggle */}
                  <button
                    onClick={() => setIsConveneBoardSelected(!isConveneBoardSelected)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${isConveneBoardSelected ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400 ring-1 ring-blue-500/50' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                    </svg>
                    {t.chat.conveneToggle}
                  </button>
                </div>

                <div className="flex items-center gap-2 pr-1">
                  {isProcessing ? (
                    <button
                      onClick={() => {
                        abortControllerRef.current?.abort();
                        // Freeze all in-progress agents in the canvas immediately
                        setActiveMeetingData(prev => {
                          if (!prev || !prev.streams) return prev;
                          const frozen: typeof prev.streams = {};
                          for (const key of Object.keys(prev.streams)) {
                            frozen[key] = { ...prev.streams![key], status: "done" };
                          }
                          return { ...prev, streams: frozen };
                        });
                        setIsProcessing(false);
                      }}
                      className="w-8 h-8 rounded-full flex items-center justify-center bg-red-100 hover:bg-red-200 dark:bg-red-500/20 dark:hover:bg-red-500/30 text-red-600 dark:text-red-400 transition-colors shadow-sm"
                      title={t.chat.stopTooltip}
                    >
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                        <rect x="6" y="6" width="12" height="12" rx="2" ry="2" />
                      </svg>
                    </button>
                  ) : (
                    <button
                      onClick={handleSend}
                      disabled={!input.trim()}
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-all shadow-sm ${
                        !input.trim()
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                          : isConveneBoardSelected
                          ? 'bg-gradient-to-r from-blue-600 to-blue-800 text-white hover:scale-105 shadow-blue-500/20'
                          : 'bg-blue-500 text-white hover:scale-105 hover:bg-blue-600'
                      }`}
                      title={t.chat.sendTooltip}
                    >
                      <svg className={`w-4 h-4 ${isRTL ? "-scale-x-100" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Meeting Canvas Slide-over */}
        {activeMeetingData && (
          <MeetingCanvas
            isOpen={isCanvasOpen}
            onClose={() => setIsCanvasOpen(false)}
            report={activeMeetingData.report}
            streams={activeMeetingData.streams}
            isProcessing={isProcessing}
            template={activeMeetingData.template}
            decisionTitle={activeMeetingData.decisionTitle}
            rolesInfo={activeMeetingData.rolesInfo}
            meetingId={activeMeetingData.id}
          />
        )}
        <TutorialModal isOpen={isTutorialOpen} onClose={handleCloseTutorial} />
        
        {/* Auth Modal triggered on-demand for guests */}
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          onSuccess={() => {
            setIsAuthModalOpen(false);
            fetchSessions();
          }}
        />
      </div>
    </div>
  );
}
