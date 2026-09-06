import { useState, useEffect, useRef } from "react";
import { useAuthStore } from "../store/authStore";
import { useSessionStore } from "../store/sessionStore";
import { login, register, loginWithGoogle } from "../api/client";
import { useTranslation } from "../i18n";
import { LocalizedBrand } from "./LocalizedBrand";

interface AuthModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  onSuccess?: () => void;
}

export default function AuthModal({ isOpen = true, onClose, onSuccess }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  
  const setToken = useAuthStore((state) => state.setToken);
  const setUser = useAuthStore((state) => state.setUser);
  const fetchSessions = useSessionStore((state) => state.fetchSessions);
  const { t, isRTL, language } = useTranslation();

  const googleBtnContainerRef = useRef<HTMLDivElement>(null);
  const gsiInitializedRef = useRef(false);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onClose) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Handle direct Google Identity Services ID token callback
  const handleGoogleCredential = async (response: { credential: string }) => {
    if (!response || !response.credential) {
      console.warn("No Google credential returned in response");
      return;
    }

    setError("");
    setGoogleLoading(true);

    try {
      const res = await loginWithGoogle(response.credential);
      if (res && res.access_token) {
        setToken(res.access_token);
        if (res.user) setUser(res.user);
        fetchSessions();
        if (onSuccess) onSuccess();
        if (onClose) onClose();
      } else {
        throw new Error("Invalid response from auth server");
      }
    } catch (err: any) {
      console.error("Google authentication failed:", err);
      const detailMsg =
        err.response?.data?.detail ||
        err.message ||
        t.auth.googleAuthFailed ||
        "Google authentication failed. Please try again.";
      setError(detailMsg);
    } finally {
      setGoogleLoading(false);
    }
  };

  // Initialize and render official Google Identity Services button
  useEffect(() => {
    if (!isOpen) return;

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setError("Google Sign-In configuration error: VITE_GOOGLE_CLIENT_ID is missing.");
      return;
    }

    const renderGsiButton = () => {
      if (!window.google?.accounts?.id || !googleBtnContainerRef.current) {
        return false;
      }

      try {
        if (!gsiInitializedRef.current) {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: handleGoogleCredential,
            auto_select: false,
          });
          gsiInitializedRef.current = true;
        }

        googleBtnContainerRef.current.innerHTML = "";

        // Check if dark theme is currently active
        const isDark = document.documentElement.classList.contains("dark");

        window.google.accounts.id.renderButton(googleBtnContainerRef.current, {
          type: "standard",
          theme: isDark ? "filled_black" : "outline",
          size: "large",
          text: isLogin ? "signin_with" : "signup_with",
          shape: "rectangular",
          logo_alignment: "left",
          width: 380,
        });
        return true;
      } catch (err) {
        console.error("Failed to render Google Identity Services button:", err);
        return false;
      }
    };

    if (!renderGsiButton()) {
      // Poll briefly if GSI script is still downloading
      const interval = setInterval(() => {
        if (renderGsiButton()) {
          clearInterval(interval);
        }
      }, 150);

      const timeout = setTimeout(() => {
        clearInterval(interval);
        if (!window.google?.accounts?.id) {
          setError("Google Identity Services failed to load. Please check your network or ad blocker.");
        }
      }, 6000);

      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }
  }, [isOpen, isLogin]);

  if (!isOpen) return null;

  const passwordChecks = [
    { label: t.auth.reqChars, valid: password.length >= 8 },
    { label: t.auth.reqUppercase, valid: /[A-Z]/.test(password) },
    { label: t.auth.reqLowercase, valid: /[a-z]/.test(password) },
    { label: t.auth.reqNumber, valid: /[0-9]/.test(password) },
    { label: t.auth.reqSpecial, valid: /[!@#$%^&*(),.?":{}|<>]/.test(password) },
  ];

  const isPasswordValid = passwordChecks.every((check) => check.valid);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (!isLogin && !isPasswordValid) {
      setError(t.auth.reqNotMet);
      setLoading(false);
      return;
    }

    try {
      let tokenStr: string;
      if (isLogin) {
        tokenStr = await login(email, password);
      } else {
        tokenStr = await register(email, password);
      }
      setToken(tokenStr);
      fetchSessions();
      if (onSuccess) onSuccess();
      if (onClose) onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || t.auth.authFailed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Background with blur and click-to-close */}
      <div 
        onClick={onClose} 
        className="absolute inset-0 bg-slate-900/60 dark:bg-[#06080f]/80 backdrop-blur-md transition-colors" 
      />

      {/* Auth Card */}
      <div 
        className="relative glass-elevated rounded-3xl w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto custom-scrollbar p-6 sm:p-8 shadow-2xl animate-scale-in border border-slate-200/50 dark:border-white/10 bg-white/95 dark:bg-[#0c1222]/95 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Dismiss Button */}
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close"
            className={`absolute top-4 ${isRTL ? "left-4" : "right-4"} p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-all cursor-pointer`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}

        <div className="text-center mb-6">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-white shadow-lg ring-1 ring-slate-900/5 items-center justify-center mb-3 p-2.5">
            <img src="/boardroom-ai.svg" alt="Mashwara AI Logo" className="w-full h-full object-contain" />
          </div>
          <h2 className="text-2xl mb-1.5 flex items-center justify-center gap-1.5 flex-wrap">
            {isRTL || language === "roman-ur" ? (
              <>
                <LocalizedBrand className="text-[1.1em] font-extrabold tracking-tight" />
                <span className="font-bold text-slate-900 dark:text-white">{t.auth.welcomeTo}</span>
              </>
            ) : (
              <>
                <span className="font-bold text-slate-900 dark:text-white">{t.auth.welcomeTo}</span>
                <LocalizedBrand className="text-[1.1em] font-extrabold tracking-tight" />
              </>
            )}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            {isLogin ? t.auth.signInSubtitle : t.auth.signUpSubtitle}
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 dark:text-red-400 text-xs text-center leading-relaxed">
            {error}
          </div>
        )}

        {/* 1. Official Google Identity Services Button */}
        <div className="space-y-4">
          {googleLoading ? (
            <div className="w-full flex items-center justify-center gap-3 bg-white dark:bg-slate-800/90 border border-slate-300 dark:border-white/10 text-slate-800 dark:text-white font-medium py-3 rounded-xl shadow-sm h-[50px]">
              <svg className="animate-spin w-5 h-5 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm font-semibold">{t.common.loading || "Verifying with Google..."}</span>
            </div>
          ) : (
            <div className="flex justify-center w-full min-h-[44px]">
              <div ref={googleBtnContainerRef} id="google-signin-btn-container" className="w-full flex justify-center" />
            </div>
          )}

          {/* Divider: or / یا */}
          <div className="relative flex items-center justify-center my-4">
            <div className="border-t border-slate-200 dark:border-white/10 w-full" />
            <span className="bg-white dark:bg-[#0c1222] px-3 text-xs font-medium text-slate-400 uppercase tracking-wider relative">
              {t.auth.dividerOr}
            </span>
          </div>
        </div>

        {/* 2. Email + Password Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wider text-start">
              {t.auth.emailLabel}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all shadow-sm dark:shadow-none text-sm"
              placeholder={t.auth.emailPlaceholder}
              dir="ltr"
              required
            />
          </div>
          
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wider text-start">
              {t.auth.passwordLabel}
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl pl-4 pr-12 text-left py-3 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all shadow-sm dark:shadow-none text-sm"
                placeholder={t.auth.passwordPlaceholder}
                dir="ltr"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors p-1 cursor-pointer"
                aria-label={showPassword ? t.auth.hidePassword : t.auth.showPassword}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                )}
              </button>
            </div>
          </div>

          {!isLogin && (
            <div className="space-y-1.5 mt-2 bg-slate-50 dark:bg-white/[0.02] p-3 rounded-xl border border-slate-200/40 dark:border-white/5">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400 text-start">{t.auth.passwordReqTitle}</p>
              {passwordChecks.map((check, index) => (
                <div key={index} className="flex items-center gap-2 text-xs">
                  {check.valid ? (
                    <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  <span className={check.valid ? "text-emerald-600 dark:text-emerald-400" : "text-slate-500"}>
                    {check.label}
                  </span>
                </div>
              ))}
            </div>
          )}
          
          <button
            type="submit"
            disabled={loading || googleLoading || !email || !password || (!isLogin && !isPasswordValid)}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-semibold py-3 rounded-xl shadow-lg shadow-blue-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center h-[50px] cursor-pointer"
          >
            {loading ? (
              <svg className="animate-spin w-5 h-5 text-white" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              isLogin ? t.auth.signInButton : t.auth.signUpButton
            )}
          </button>
        </form>

        <div className="mt-5 text-center">
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError("");
            }}
            className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            {isLogin ? t.auth.dontHaveAccount : t.auth.alreadyHaveAccount}
          </button>
        </div>
      </div>
    </div>
  );
}
