import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { streamChat, getSession, createSession, streamStandardMessage, deleteLastTurn, getMe } from "../api/client";
import type { RoleInfo } from "../api/client";
import MeetingCanvas from "../components/MeetingCanvas";
import AuthModal from "../components/AuthModal";
import Sidebar from "../components/Sidebar";
import TutorialModal from "../components/TutorialModal";
import { useAuthStore } from "../store/authStore";
import { useSessionStore } from "../store/sessionStore";
import { TEMPLATES } from "../types/meeting";

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
  const setUser = useAuthStore((state) => state.setUser);
  const fetchSessions = useSessionStore((state) => state.fetchSessions);
  const addSession = useSessionStore((state) => state.addSession);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("STARTUP_BOARD");
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | undefined>();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editInput, setEditInput] = useState("");
  const [thinkingExpandedId, setThinkingExpandedId] = useState<string | null>(null);

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
      console.error(err);
    }
  };

  const handleSelectSession = (session: any | null) => {
    if (!session) {
      setActiveSessionId(undefined);
      setMessages([]);
      setInput("");
      setIsProcessing(false);
      return;
    }
    loadSession(session.id);
  };

  const handleStandardChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;

    const userText = input.trim();
    setInput("");
    setIsProcessing(true);

    try {
      let sessionId = activeSessionId;
      if (!sessionId) {
        const newSession = await createSession();
        sessionId = newSession.id;
        setActiveSessionId(sessionId);
        addSession(newSession);
      }

      const tempUserId = Date.now().toString();
      const tempAsstId = (Date.now() + 1).toString();
      
      setMessages(prev => [...prev, { id: tempUserId, role: "user", content: userText }]);
      setMessages(prev => [...prev, { id: tempAsstId, role: "assistant", content: "", thinking: "" }]);

      abortControllerRef.current = new AbortController();

      await streamStandardMessage(
        sessionId as string,
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
        abortControllerRef.current.signal
      );
    } catch (err) {
      console.error(err);
      setIsProcessing(false);
    }
  };

  const handleUpdatePrompt = async () => {
    if (!editInput.trim() || !activeSessionId || isProcessing) return;
    setIsProcessing(true);
    setEditingMessageId(null);
    
    try {
      await deleteLastTurn(activeSessionId);
      
      const userText = editInput.trim();
      setMessages(prev => prev.slice(0, -2)); 
      
      const tempUserId = Date.now().toString();
      const tempAsstId = (Date.now() + 1).toString();
      
      setMessages(prev => [...prev, { id: tempUserId, role: "user", content: userText }]);
      setMessages(prev => [...prev, { id: tempAsstId, role: "assistant", content: "", thinking: "" }]);

      abortControllerRef.current = new AbortController();

      await streamStandardMessage(
        activeSessionId,
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
        abortControllerRef.current.signal
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
      if (!sessionId) {
        const newSession = await createSession();
        sessionId = newSession.id;
        setActiveSessionId(sessionId);
        addSession(newSession);
      }

      const tempUserId = Date.now().toString();
      const tempAsstId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, 
        { id: tempUserId, role: "user", content: userText },
        { id: tempAsstId, role: "assistant", content: "I am convening the board to analyze your request. Please wait while they deliberate.", is_agentic: true }
      ]);

      const newMeetingData: ActiveMeetingData = {
        template: selectedTemplate,
        decisionTitle: "Live Board Meeting",
        streams: {},
      };
      
      setActiveMeetingData(newMeetingData);
      setIsCanvasOpen(true);
      abortControllerRef.current = new AbortController();

      await streamChat(
        sessionId as string,
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

  if (!token) return <AuthModal />;

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
      />

      <div className="flex-1 flex flex-col relative z-10 h-screen w-full md:w-auto">
        <nav className="p-4 border-b border-slate-200 dark:border-white/5 flex items-center justify-between glass">
          <div className="flex items-center gap-3">
            {!isSidebarOpen && (
              <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
              </button>
            )}
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-md bg-white shadow-sm ring-1 ring-slate-900/5 flex items-center justify-center p-1">
                <img src="/boardroom-ai.svg" alt="Boardroom AI Logo" className="w-full h-full object-contain" />
              </div>
              <div className="w-px h-5 bg-slate-300 dark:bg-slate-700 hidden sm:block"></div>
              <span className="text-lg font-extrabold tracking-tight">
                <span className="text-[#0F172A] dark:text-white">Boardroom</span><span className="text-[#2563EB]">AI</span>
              </span>
            </div>
          </div>
        </nav>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar relative">
          <div className="max-w-3xl mx-auto space-y-6 pb-40">
            {messages.length === 0 && (
              <div className="text-center mt-20 animate-fade-in px-4">
                <div className="inline-flex w-16 h-16 rounded-2xl bg-white shadow-xl ring-1 ring-slate-900/5 items-center justify-center mb-6 p-3">
                  <img src="/boardroom-ai.svg" alt="Boardroom AI Logo" className="w-full h-full object-contain drop-shadow-sm" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Welcome to your Workspace</h2>
                <p className="text-slate-600 dark:text-slate-400 mb-8 max-w-md mx-auto text-sm sm:text-base">
                  Brainstorm with your Chief of Staff, and when you're ready, convene the full executive board to analyze your decision.
                </p>

                {!hasSeenTutorial && (
                  <button 
                    onClick={() => setIsTutorialOpen(true)}
                    className="mb-8 mx-auto flex items-center gap-3 px-6 py-3 rounded-full bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 border border-blue-500/20 transition-all group font-medium"
                  >
                    <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center shadow-md shadow-blue-500/30 group-hover:scale-110 transition-transform">
                      <svg className="w-4 h-4 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    Watch the 1-Minute Tutorial
                  </button>
                )}

                <div className="flex flex-wrap gap-2 justify-center max-w-2xl mx-auto">
                  {["Should we raise a Series A now?", "Fire underperforming contractor?", "Pivot target audience to Enterprise?"].map((q, i) => (
                    <button key={i} onClick={() => setInput(q)} className="px-4 py-2 rounded-full border border-slate-200 dark:border-white/10 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:border-blue-500/50 hover:bg-blue-500/10 transition-all shadow-sm dark:shadow-none bg-white dark:bg-transparent">
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
                            Cancel
                          </button>
                          <button onClick={handleUpdatePrompt} className="px-4 py-1.5 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors">
                            Update
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
                            <button onClick={() => { setEditingMessageId(msg.id); setEditInput(msg.content); }} className="p-1.5 hover:text-blue-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="Edit Prompt">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            </button>
                          )}
                          <button onClick={() => handleCopy(msg.content, msg.id)} className="p-1.5 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="Copy Prompt">
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
                                    Thinking<span className="animate-pulse">...</span>
                                  </span>
                                ) : "Thought Process"}
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
                              Chief of Staff is typing...
                            </div>
                          )}
                          <div className="flex items-center gap-1 mt-1 ml-1 text-slate-400">
                            <button onClick={() => handleCopy(text, msg.id)} className="p-1.5 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="Copy Text">
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
                                decisionTitle: msg.meeting?.prompt ? "Past Board Meeting" : "Live Board Meeting",
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
                          {isProcessing && index === messages.length - 1 ? "Board is deliberating..." : "Open Board Report"}
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
                placeholder="Message Chief of Staff or convene the board..."
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
                      {TEMPLATES[selectedTemplate as keyof typeof TEMPLATES].name}
                      <svg className={`w-3 h-3 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    
                    {isDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setIsDropdownOpen(false)} />
                        <div className="absolute bottom-full left-0 mb-2 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-20 overflow-hidden animate-fade-in">
                          {Object.keys(TEMPLATES).map((key) => (
                            <button
                              key={key}
                              onClick={() => {
                                setSelectedTemplate(key);
                                setIsDropdownOpen(false);
                              }}
                              className={`w-full text-left px-4 py-3 text-sm transition-colors ${selectedTemplate === key ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                            >
                              <div className="font-medium">{TEMPLATES[key as keyof typeof TEMPLATES].name}</div>
                              <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">{TEMPLATES[key as keyof typeof TEMPLATES].description}</div>
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
                    Convene
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
                      title="Stop Generation"
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
                      title="Send Message"
                    >
                      <svg className="w-4 h-4 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
          />
        )}
        <TutorialModal isOpen={isTutorialOpen} onClose={handleCloseTutorial} />
      </div>
    </div>
  );
}
