import { useEffect, useState, useRef } from "react";
import { deleteSession, renameSession } from "../api/client";
import { useAuthStore } from "../store/authStore";
import { useSessionStore } from "../store/sessionStore";
import { useNavigate } from "react-router-dom";
import ThemeToggle from "./ThemeToggle";
import ConfirmModal from "./ConfirmModal";

interface SessionInfo {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface SidebarProps {
  onSelectSession: (session: SessionInfo | null) => void;
  selectedSessionId?: string;
  isOpen?: boolean;
  onClose?: () => void;
  onOpenTutorial?: () => void;
}

export default function Sidebar({ onSelectSession, selectedSessionId, isOpen = false, onClose, onOpenTutorial }: SidebarProps) {
  const { sessions, loading, fetchSessions, removeSession, updateSessionTitle } = useSessionStore();
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();

  // Modals & Edit state
  const [sessionToDelete, setSessionToDelete] = useState<SessionInfo | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // PWA state
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
    }
  };

  const handleDeleteSession = async () => {
    if (!sessionToDelete) return;
    const idToDelete = sessionToDelete.id;
    // Optimistic UI update
    removeSession(idToDelete);
    if (selectedSessionId === idToDelete) {
      onSelectSession(null);
    }
    setSessionToDelete(null); // Close modal immediately

    try {
      await deleteSession(idToDelete);
    } catch (err) {
      console.error("Failed to delete session", err);
      // Fallback: fetch again if failed
      fetchSessions();
    }
  };

  const handleRenameSubmit = async (id: string) => {
    if (!editTitle.trim()) {
      setEditingId(null);
      return;
    }
    const newTitle = editTitle;
    setEditingId(null); // Close edit mode immediately

    // Optimistic UI update
    updateSessionTitle(id, newTitle);

    try {
      await renameSession(id, newTitle);
    } catch (err) {
      console.error("Failed to rename session", err);
      // Fallback: fetch again if failed
      fetchSessions();
    }
  };

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingId]);

  useEffect(() => {
    fetchSessions();
  }, []);

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 dark:bg-[#06080f]/80 backdrop-blur-sm z-30 md:hidden"
          onClick={onClose}
        />
      )}

      {openDropdownId && (
        <div className="fixed inset-0 z-40" onClick={() => setOpenDropdownId(null)}></div>
      )}
      {/* Sidebar Container */}
      <div className={`fixed md:relative inset-y-0 left-0 h-[100dvh] bg-slate-50/90 dark:bg-[#06080f]/90 backdrop-blur-xl flex flex-col flex-shrink-0 z-40 transition-all duration-300 ease-in-out overflow-hidden ${
        isOpen ? 'w-64 translate-x-0 border-r border-slate-200 dark:border-white/5' : 'w-0 -translate-x-full md:translate-x-0 border-r-0'
      }`}>
        <div className="w-64 h-full flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white shadow-md ring-1 ring-slate-900/5 flex items-center justify-center p-1">
              <img src="/boardroom-ai.svg" alt="Logo" className="w-full h-full object-contain" />
            </div>
          </div>
          {onClose && (
            <button onClick={onClose} className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
            </button>
          )}
        </div>

      {/* New Meeting Button */}
      <div className="p-4">
        <button
          onClick={() => {
            onSelectSession(null);
            if (window.innerWidth < 768 && onClose) onClose();
          }}
          className="w-full flex items-center justify-center gap-2 bg-white dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-white text-sm font-medium py-2.5 rounded-xl transition-all shadow-sm dark:shadow-none"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Chat
        </button>
      </div>

      {/* History List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
        <div className="px-3 pb-2 text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-widest">
          History
        </div>
        {loading ? (
          <div className="flex justify-center p-4">
            <div className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></div>
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center p-4 text-xs text-slate-500">
            No past chats found.
          </div>
        ) : (
          <div className="space-y-1">
            {sessions.map((s) => (
              <div key={s.id} className="group relative flex items-center">
                <button
                  onClick={() => {
                    if (editingId !== s.id) {
                      onSelectSession(s);
                      if (window.innerWidth < 768 && onClose) onClose();
                    }
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all flex items-center gap-3 pr-16 ${
                    selectedSessionId === s.id
                      ? "bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20"
                      : "text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white border border-transparent"
                  }`}
                >
                  <div className="truncate flex-1">
                    {editingId === s.id ? (
                      <input
                        ref={inputRef}
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onBlur={() => handleRenameSubmit(s.id)}
                        onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit(s.id)}
                        className="w-full bg-white dark:bg-slate-900 border border-blue-500 rounded px-2 py-0.5 text-sm text-slate-900 dark:text-white"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <>
                        <div className="truncate font-medium">{s.title}</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-500 mt-0.5">
                          {new Date(s.updated_at).toLocaleDateString()}
                        </div>
                      </>
                    )}
                  </div>
                </button>
                <div className="absolute right-2 flex items-center z-50">
                  <button 
                    onClick={(e) => { e.stopPropagation(); setOpenDropdownId(openDropdownId === s.id ? null : s.id); }}
                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 16a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm0-6a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm0-6a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/></svg>
                  </button>
                  {openDropdownId === s.id && (
                    <div className="absolute top-8 right-0 w-32 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden py-1">
                      <button 
                        onClick={(e) => { e.stopPropagation(); setEditingId(s.id); setEditTitle(s.title); setOpenDropdownId(null); }}
                        className="w-full text-left px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        Rename
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setSessionToDelete(s); setOpenDropdownId(null); }}
                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 flex items-center gap-2"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer / User Area */}
      <div className="p-4 border-t border-slate-200 dark:border-white/5 space-y-2 md:space-y-1">
        {deferredPrompt && (
          <>
            <button
              onClick={handleInstallClick}
              className="w-full flex items-center gap-3 md:gap-2 text-sm md:text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors py-2 md:py-1.5 px-3 md:px-2 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-500/10 font-medium"
            >
              <svg className="w-5 h-5 md:w-4 md:h-4 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Install App
            </button>
            <div className="h-px w-full bg-slate-200 dark:bg-white/5 my-1"></div>
          </>
        )}

        {onOpenTutorial && (
          <>
            <button
              onClick={() => {
                onOpenTutorial();
                if (window.innerWidth < 768 && onClose) onClose();
              }}
              className="w-full flex items-center gap-3 md:gap-2 text-sm md:text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors py-2 md:py-1.5 px-3 md:px-2 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-500/10 font-medium"
            >
              <svg className="w-5 h-5 md:w-4 md:h-4 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              How it Works
            </button>
            <div className="h-px w-full bg-slate-200 dark:bg-white/5 my-1"></div>
          </>
        )}

        <div className="flex items-center justify-between px-1 py-1 md:py-0">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest md:text-[10px]">
            Theme
          </div>
          <ThemeToggle />
        </div>
        
        <div className="h-px w-full bg-slate-200 dark:bg-white/5 my-1"></div>

        <div className="px-3 md:px-2 pb-1 text-xs font-semibold text-slate-500 uppercase tracking-widest md:text-[10px]">
          Account
        </div>
        
        <button
          onClick={() => {
            navigate("/settings");
            if (window.innerWidth < 768 && onClose) onClose();
          }}
          className="w-full flex items-center gap-3 md:gap-2 text-sm md:text-xs text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors py-2 md:py-1.5 px-3 md:px-2 rounded-xl hover:bg-slate-200/50 dark:hover:bg-white/5"
        >
          <div className="w-6 h-6 md:w-5 md:h-5 rounded-full bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0 text-sm md:text-xs">
            {user?.profile_data?.name?.charAt(0) || "U"}
          </div>
          <div className="truncate text-left flex-1">
            <div className="truncate font-medium">{user?.profile_data?.name || "Profile Settings"}</div>
          </div>
        </button>
      </div>



      <ConfirmModal 
        isOpen={!!sessionToDelete}
        onClose={() => setSessionToDelete(null)}
        onConfirm={handleDeleteSession}
        title="Delete Chat"
        description={`Are you sure you want to delete "${sessionToDelete?.title}"? This action cannot be undone.`}
        confirmText="Delete"
      />
    </div>
      </div>
    </>
  );
}
