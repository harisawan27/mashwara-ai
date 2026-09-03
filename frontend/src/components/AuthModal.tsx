import { useState, useEffect } from "react";
import { useAuthStore } from "../store/authStore";
import { login, register, getNeonAuthConfig } from "../api/client";
import { useTranslation } from "../i18n";

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
  const { t, isRTL, language } = useTranslation();

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

  if (!isOpen) return null;

  const passwordChecks = [
    { label: t.auth.reqChars, valid: password.length >= 8 },
    { label: t.auth.reqUppercase, valid: /[A-Z]/.test(password) },
    { label: t.auth.reqLowercase, valid: /[a-z]/.test(password) },
    { label: t.auth.reqNumber, valid: /[0-9]/.test(password) },
    { label: t.auth.reqSpecial, valid: /[!@#$%^&*(),.?":{}|<>]/.test(password) },
  ];

  const isPasswordValid = passwordChecks.every((check) => check.valid);

  const handleGoogleSignIn = async () => {
    setError("");
    setGoogleLoading(true);

    try {
      // Retrieve Neon Auth URL dynamically or use production fallback
      let neonAuthUrl = import.meta.env.VITE_NEON_AUTH_URL;
      if (!neonAuthUrl) {
        try {
          const cfg = await getNeonAuthConfig();
          neonAuthUrl = cfg.neon_auth_url;
        } catch {
          neonAuthUrl = "https://ep-muddy-frog-adaf15fz.neonauth.c-2.us-east-1.aws.neon.tech/neondb/auth";
        }
      }

      const callbackUrl = `${window.location.origin}/?neon_auth=1`;
      const res = await fetch(`${neonAuthUrl}/sign-in/social`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: "google",
          callbackURL: callbackUrl,
        }),
        credentials: "include",
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to initiate Google OAuth");
      }

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error("Missing OAuth redirect URL");
      }
    } catch (err: any) {
      console.error("Google sign in failed:", err);
      setError(t.auth.googleAuthFailed);
      setGoogleLoading(false);
    }
  };

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
        className="relative glass-elevated rounded-3xl w-full max-w-md p-6 sm:p-8 shadow-2xl animate-scale-in border border-slate-200/50 dark:border-white/10 bg-white/95 dark:bg-[#0c1222]/95 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Dismiss Button */}
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close"
            className={`absolute top-4 ${isRTL ? "left-4" : "right-4"} p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-all`}
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
                <span className="font-extrabold tracking-tight text-[1.1em]">
                  <span className="text-[#0F172A] dark:text-white">{t.brand.firstPart}</span>
                  <span className="text-[#2563EB]">{t.brand.secondPart}</span>
                </span>
                <span className="font-bold text-slate-900 dark:text-white">{t.auth.welcomeTo}</span>
              </>
            ) : (
              <>
                <span className="font-bold text-slate-900 dark:text-white">{t.auth.welcomeTo}</span>
                <span className="font-extrabold tracking-tight text-[1.1em]">
                  <span className="text-[#0F172A] dark:text-white">{t.brand.firstPart}</span>
                  <span className="text-[#2563EB]">{t.brand.secondPart}</span>
                </span>
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

        {/* 1. Continue with Google (Neon Auth) */}
        <div className="space-y-4">
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading || loading}
            id="google-signin-btn"
            className="w-full flex items-center justify-center gap-3 bg-white dark:bg-slate-800/90 border border-slate-300 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-slate-700/80 text-slate-800 dark:text-white font-medium py-3 rounded-xl shadow-sm transition-all h-[50px] disabled:opacity-50 disabled:cursor-not-allowed hover:shadow cursor-pointer"
          >
            {googleLoading ? (
              <svg className="animate-spin w-5 h-5 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <>
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span className="text-sm font-semibold">{t.auth.continueWithGoogle}</span>
              </>
            )}
          </button>

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
                className={`w-full bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl ${
                  isRTL ? "pl-12 pr-4 text-left" : "pl-4 pr-12 text-left"
                } py-3 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all shadow-sm dark:shadow-none text-sm`}
                placeholder={t.auth.passwordPlaceholder}
                dir="ltr"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className={`absolute ${isRTL ? "left-3" : "right-3"} top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors p-1`}
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
