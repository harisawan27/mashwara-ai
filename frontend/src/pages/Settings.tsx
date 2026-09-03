import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getMe, updateProfile, deleteAccount } from "../api/client";
import { useAuthStore } from "../store/authStore";
import { useTranslation } from "../i18n";
import ConfirmModal from "../components/ConfirmModal";
import AuthModal from "../components/AuthModal";

export default function Settings() {
  const navigate = useNavigate();
  const { token, user, setUser } = useAuthStore();
  const { t, language, setLanguage, isRTL } = useTranslation();
  
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const logout = useAuthStore((state) => state.logout);

  const handleDeleteAccount = async () => {
    try {
      setLoading(true);
      await deleteAccount();
      logout();
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || t.settings.updateFailed);
      setLoading(false);
      setDeleteModalOpen(false);
    }
  };

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    role: "",
    company: "",
    industry: "",
    bio: ""
  });

  useEffect(() => {
    if (!token) return;
    
    // Load existing profile if authenticated
    const loadProfile = async () => {
      try {
        const data = await getMe();
        setUser(data);
        if (data.profile_data) {
          setFormData({
            name: data.profile_data.name || "",
            role: data.profile_data.role || "",
            company: data.profile_data.company || "",
            industry: data.profile_data.industry || "",
            bio: data.profile_data.bio || ""
          });
        }
      } catch (err) {
        console.error("Failed to load profile", err);
      }
    };
    
    loadProfile();
  }, [token, setUser]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSuccessMsg("");
    setErrorMsg("");

    try {
      const response = await updateProfile(formData);
      setUser({ ...user, profile_data: response.profile_data });
      setSuccessMsg(t.settings.profileUpdated);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || t.settings.updateFailed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative bg-slate-50 dark:bg-[#06080f] text-slate-900 dark:text-white transition-colors">
      {/* Global Background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full bg-[radial-gradient(ellipse,rgba(99,102,241,0.08)_0%,transparent_70%)] dark:bg-[radial-gradient(ellipse,rgba(99,102,241,0.05)_0%,transparent_70%)]" />
        <div className="absolute inset-0 dot-pattern opacity-60 dark:opacity-30" />
      </div>

      <div className="relative z-10 max-w-3xl mx-auto p-6 sm:p-10 pt-20">
        
        <button 
          onClick={() => navigate("/")}
          className="mb-8 flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
        >
          <svg className={`w-4 h-4 ${isRTL ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          {t.settings.backToDashboard}
        </button>

        <div className="mb-10">
          <h1 className="text-3xl font-bold mb-2">{t.settings.pageTitle}</h1>
          <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
            {t.settings.pageDescription}
          </p>
        </div>

        {/* ── Language Preferences Card ── */}
        <div className="mb-8 glass-elevated rounded-2xl p-6 sm:p-8 space-y-6 border border-slate-200 dark:border-white/5">
          <div className="border-b border-slate-200 dark:border-white/5 pb-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t.settings.languageSectionTitle}</h2>
            <p className="text-sm text-slate-500 mt-1">{t.settings.languageSectionDesc}</p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* 1. اردو (Urdu) */}
            <button
              type="button"
              onClick={() => setLanguage("ur")}
              className={`p-4 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1.5 ${
                language === "ur"
                  ? "border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold ring-2 ring-blue-500/30 shadow-sm"
                  : "border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300"
              }`}
            >
              <span className="text-lg font-bold">اردو</span>
              <span className="text-xs text-slate-400">Urdu (Default)</span>
              {language === "ur" && (
                <span className="mt-1 inline-flex items-center text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-500/20 px-2 py-0.5 rounded-full">
                  ✓ منتخب شدہ
                </span>
              )}
            </button>

            {/* 2. Roman Urdu */}
            <button
              type="button"
              onClick={() => setLanguage("roman-ur")}
              className={`p-4 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer ${
                language === "roman-ur"
                  ? "border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold ring-2 ring-blue-500/30 shadow-sm"
                  : "border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300"
              }`}
            >
              <span className="text-lg font-bold">Roman Urdu</span>
              <span className="text-xs text-slate-400">Pakistani Roman Urdu</span>
              {language === "roman-ur" && (
                <span className="mt-1 inline-flex items-center text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-500/20 px-2 py-0.5 rounded-full">
                  ✓ Selected
                </span>
              )}
            </button>

            {/* 3. English */}
            <button
              type="button"
              onClick={() => setLanguage("en")}
              className={`p-4 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1.5 ${
                language === "en"
                  ? "border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold ring-2 ring-blue-500/30 shadow-sm"
                  : "border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300"
              }`}
            >
              <span className="text-lg font-bold">English</span>
              <span className="text-xs text-slate-400">Original UI</span>
              {language === "en" && (
                <span className="mt-1 inline-flex items-center text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-500/20 px-2 py-0.5 rounded-full">
                  ✓ Selected
                </span>
              )}
            </button>
          </div>
        </div>

        {!token ? (
          <div className="glass-elevated rounded-2xl p-6 sm:p-8 mb-8 border border-blue-500/20 bg-blue-500/[0.04]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                    {t.guest.settingsGuestTitle}
                  </span>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300 max-w-xl leading-relaxed text-start">
                  {t.guest.settingsGuestDesc}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsAuthModalOpen(true)}
                className="shrink-0 py-2.5 px-6 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-semibold text-sm shadow-md transition-all cursor-pointer"
              >
                {t.guest.signInCta}
              </button>
            </div>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="space-y-6">
              {successMsg && (
                <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm animate-fade-in">
                  {successMsg}
                </div>
              )}
              {errorMsg && (
                <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm animate-fade-in">
                  {errorMsg}
                </div>
              )}

              <div className="glass-elevated rounded-2xl p-6 sm:p-8 space-y-6">
                <h2 className="text-lg font-semibold border-b border-slate-200 dark:border-white/5 pb-4 mb-6">{t.settings.personalDetails}</h2>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">{t.settings.fullName}</label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      className="w-full bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all shadow-sm dark:shadow-none"
                      placeholder={t.settings.fullNamePlaceholder}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">{t.settings.role}</label>
                    <input
                      type="text"
                      name="role"
                      value={formData.role}
                      onChange={handleChange}
                      className="w-full bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all shadow-sm dark:shadow-none"
                      placeholder={t.settings.rolePlaceholder}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">{t.settings.company}</label>
                    <input
                      type="text"
                      name="company"
                      value={formData.company}
                      onChange={handleChange}
                      className="w-full bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all shadow-sm dark:shadow-none"
                      placeholder={t.settings.companyPlaceholder}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">{t.settings.industry}</label>
                    <input
                      type="text"
                      name="industry"
                      value={formData.industry}
                      onChange={handleChange}
                      className="w-full bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all shadow-sm dark:shadow-none"
                      placeholder={t.settings.industryPlaceholder}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">{t.settings.bio}</label>
                  <textarea
                    name="bio"
                    value={formData.bio}
                    onChange={handleChange}
                    rows={4}
                    className="w-full bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all resize-none shadow-sm dark:shadow-none"
                    placeholder={t.settings.bioPlaceholder}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 px-8 rounded-xl shadow-lg shadow-blue-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[150px] cursor-pointer"
                >
                  {loading ? (
                    <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    t.settings.saveProfile
                  )}
                </button>
              </div>
            </form>

            {/* Account Actions / Danger Zone */}
            <div className="mt-12 space-y-6">
              <div className="glass-elevated rounded-2xl p-6 sm:p-8 space-y-6 border border-slate-200 dark:border-white/5">
                <h2 className="text-lg font-semibold border-b border-slate-200 dark:border-white/5 pb-4 mb-6">{t.settings.accountActions}</h2>
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="font-medium text-slate-900 dark:text-white">{t.settings.signOut}</h3>
                    <p className="text-sm text-slate-500">{t.settings.signOutDesc}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setLogoutModalOpen(true)}
                    className="px-6 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors font-medium text-sm cursor-pointer"
                  >
                    {t.settings.signOut}
                  </button>
                </div>
              </div>

              <div className="glass-elevated rounded-2xl p-6 sm:p-8 space-y-6 border border-red-500/20 bg-red-50/50 dark:bg-red-500/5">
                <h2 className="text-lg font-semibold text-red-600 dark:text-red-400 border-b border-red-500/20 pb-4 mb-6">{t.settings.dangerZone}</h2>
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="font-medium text-red-700 dark:text-red-400">{t.settings.deleteAccount}</h3>
                    <p className="text-sm text-red-600/70 dark:text-red-400/70">{t.settings.deleteAccountDesc}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDeleteModalOpen(true)}
                    className="px-6 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white transition-colors font-medium text-sm shadow-lg shadow-red-500/25 cursor-pointer"
                  >
                    {t.settings.deleteAccount}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <AuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => setIsAuthModalOpen(false)} 
        onSuccess={() => setIsAuthModalOpen(false)} 
      />

      <ConfirmModal 
        isOpen={logoutModalOpen}
        onClose={() => setLogoutModalOpen(false)}
        onConfirm={logout}
        title={t.settings.signOutModalTitle}
        description={t.settings.signOutModalDesc}
        confirmText={t.settings.signOut}
        cancelText={t.common.cancel}
      />

      <ConfirmModal 
        isOpen={deleteModalOpen}
        onClose={() => { setDeleteModalOpen(false); setDeleteConfirmText(""); }}
        onConfirm={() => {
          if (deleteConfirmText.trim().toUpperCase() === "DELETE") {
            handleDeleteAccount();
          } else {
            setErrorMsg(t.settings.deleteConfirmError);
            setDeleteModalOpen(false);
          }
        }}
        title={t.settings.deleteModalTitle}
        description={<>
          <p className="mb-4 text-red-500 font-medium">{t.settings.deleteWarning1}</p>
          <p className="mb-4">{t.settings.deleteWarning2}</p>
          <div className="mt-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              {t.settings.typeDeletePrompt}
            </label>
            <input 
              type="text" 
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white"
              placeholder="DELETE"
              dir="ltr"
            />
          </div>
        </>}
        confirmText={t.settings.permanentlyDelete}
        cancelText={t.common.cancel}
      />
    </div>
  );
}
