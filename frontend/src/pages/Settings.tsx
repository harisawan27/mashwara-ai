import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMe, updateProfile, deleteAccount } from "../api/client";
import { useAuthStore } from "../store/authStore";
import { useThemeStore } from "../store/themeStore";
import { useTranslation } from "../i18n";
import ConfirmModal from "../components/ConfirmModal";
import AuthModal from "../components/AuthModal";
import ThemeToggle from "../components/ThemeToggle";
import UiIcon from "../components/UiIcon";

const profileKeys = ["name", "role", "company", "industry", "bio"] as const;
type Profile = Record<(typeof profileKeys)[number], string>;
function profileFrom(user: any): Profile {
  return Object.fromEntries(profileKeys.map(key => [key, user?.profile_data?.[key] || ""])) as Profile;
}

const card = "min-w-0 rounded-2xl border border-slate-200/80 bg-white/90 dark:border-white/[0.08] dark:bg-slate-900/60";
const muted = "text-xs leading-relaxed text-slate-500 dark:text-slate-400";
const field = "w-full min-w-0 min-h-11 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 disabled:opacity-60 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-100 dark:placeholder:text-slate-500 transition-colors";
const secondary = "min-h-11 inline-flex items-center justify-center rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5 transition-colors";

export default function Settings() {
  const navigate = useNavigate();
  const { token, user, setUser, logout } = useAuthStore();
  const { theme } = useThemeStore();
  const { t, language, setLanguage, isRTL } = useTranslation();
  // Show the persisted profile immediately; /auth/me only refreshes it in the background.
  const [formData, setFormData] = useState<Profile>(() => profileFrom(user));
  const [baseline, setBaseline] = useState<Profile>(() => profileFrom(user));
  const touched = useRef(new Set<keyof Profile>());
  const [refreshing, setRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [refreshAttempt, setRefreshAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  // An account with no profile_data is a valid, editable empty profile.
  const hasProfile = !!user;
  const hasChanges = profileKeys.some(key => formData[key] !== baseline[key]);

  useEffect(() => {
    touched.current.clear();
    setFormData(profileFrom(useAuthStore.getState().user));
    setBaseline(profileFrom(useAuthStore.getState().user));
    setSuccess(false);
    setErrorMsg("");
  }, [token]);

  useEffect(() => {
    const next = profileFrom(user);
    setBaseline(next);
    setFormData(current => Object.fromEntries(profileKeys.map(key => [key, touched.current.has(key) ? current[key] : next[key]])) as Profile);
  }, [user]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    const initialUser = useAuthStore.getState().user;
    setRefreshing(true);
    setRefreshFailed(false);
    getMe().then(data => {
      // Ignore a refresh if a save or account change happened while it was in flight.
      if (active && useAuthStore.getState().token === token && useAuthStore.getState().user === initialUser) setUser(data);
    }).catch(() => {
      if (active) setRefreshFailed(true);
    }).finally(() => {
      if (active) setRefreshing(false);
    });
    return () => { active = false; };
  }, [token, setUser, refreshAttempt]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const key = e.target.name as keyof Profile;
    const value = e.target.value;
    touched.current.add(key);
    setFormData(current => ({ ...current, [key]: value }));
    setSuccess(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || !hasChanges || !hasProfile) return;
    setSaving(true);
    setSuccess(false);
    setErrorMsg("");
    const submitted = { ...formData };
    try {
      const response = await updateProfile(submitted);
      if (useAuthStore.getState().token !== token) return;
      const savedUser = { ...useAuthStore.getState().user, profile_data: response.profile_data || submitted };
      touched.current.clear();
      setFormData(profileFrom(savedUser));
      setBaseline(profileFrom(savedUser));
      setUser(savedUser);
      setSuccess(true);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || t.settings.updateFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleting) return;
    try {
      setDeleting(true);
      await deleteAccount();
      logout();
      navigate("/", { replace: true });
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || t.settings.updateFailed);
    } finally {
      setDeleting(false);
    }
  };

  const inputs = [
    { name: "name", label: t.settings.fullName, placeholder: t.settings.fullNamePlaceholder, autoComplete: "name" },
    { name: "role", label: t.settings.role, placeholder: t.settings.rolePlaceholder, autoComplete: "organization-title" },
    { name: "company", label: t.settings.company, placeholder: t.settings.companyPlaceholder, autoComplete: "organization" },
    { name: "industry", label: t.settings.industry, placeholder: t.settings.industryPlaceholder, autoComplete: "off" },
  ] as const;
  const languages = [
    { value: "ur", label: "اردو", description: t.settings.urduDesc },
    { value: "roman-ur", label: "Roman Urdu", description: t.settings.romanUrduDesc },
    { value: "en", label: "English", description: t.settings.englishDesc },
  ] as const;

  return (
    <div className="min-h-[var(--app-height)] min-w-0 bg-slate-50 text-slate-900 dark:bg-[#06080f] dark:text-slate-100 transition-colors">
      <div className="pointer-events-none fixed inset-0 dot-pattern opacity-40 dark:opacity-20" aria-hidden="true" />
      <main className="relative mx-auto w-full max-w-5xl min-w-0 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:pt-6 lg:px-8 lg:pt-8">
        <button type="button" onClick={() => navigate("/")} className="mb-4 inline-flex min-h-11 items-center gap-1.5 text-start text-xs font-medium text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 sm:mb-5">
          <UiIcon name="chevronLeft" className={`w-4 h-4 ${isRTL ? "rotate-180" : ""}`} />
          {t.settings.backToDashboard}
        </button>
        <header className="mb-5 sm:mb-6">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t.settings.pageTitle}</h1>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-slate-500 dark:text-slate-400">{t.settings.pageDescription}</p>
        </header>

        <div className="grid min-w-0 items-start gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          {token ? (
            <section className={card} aria-labelledby="settings-profile-title">
              <div className="flex items-center gap-3 border-b border-slate-100 p-4 dark:border-white/[0.06] sm:px-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-sm font-semibold text-blue-600 dark:bg-blue-500/10 dark:text-blue-400" aria-hidden="true">
                  {(user?.profile_data?.name || user?.email || "M").trim().charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <h2 id="settings-profile-title" className="text-sm font-semibold">{t.settings.personalDetails}</h2>
                  <p className={`mt-0.5 ${muted}`}>{t.settings.profileHint}</p>
                </div>
              </div>
              <form onSubmit={handleSubmit}>
                <div className="space-y-4 p-4 sm:p-5">
                  <div className="rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-white/[0.03]">
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-300">{t.settings.emailLabel}</p>
                    {user?.email ? <p className="mt-1 break-all text-sm" dir="ltr">{user.email}</p> : <div className="mt-2 h-4 w-40 max-w-full animate-pulse rounded bg-slate-200 dark:bg-slate-700" />}
                    <p className={`mt-1 ${muted}`}>{t.settings.emailHint}</p>
                  </div>
                  {refreshFailed && (
                    <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                      <UiIcon name="alert" /><span className="min-w-0 flex-1">{t.settings.loadFailed}</span>
                      <button type="button" onClick={() => setRefreshAttempt(value => value + 1)} className="min-h-11 px-2 font-medium underline underline-offset-2">{t.settings.retry}</button>
                    </div>
                  )}
                  {!hasProfile && !refreshFailed && <p role="status" className={muted}>{t.settings.loadingProfile}</p>}
                  <fieldset disabled={saving || !hasProfile} className="min-w-0 space-y-4">
                    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                      {inputs.map(input => (
                        <div key={input.name} className="min-w-0">
                          <label htmlFor={`profile-${input.name}`} className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">{input.label}</label>
                          {hasProfile ? <input id={`profile-${input.name}`} name={input.name} type="text" dir="auto" autoComplete={input.autoComplete} value={formData[input.name]} onChange={handleChange} className={field} placeholder={input.placeholder} /> : <div className="h-11 animate-pulse rounded-lg bg-slate-100 dark:bg-white/5" aria-hidden="true" />}
                        </div>
                      ))}
                    </div>
                    <div>
                      <label htmlFor="profile-bio" className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">{t.settings.bio}</label>
                      {hasProfile ? <textarea id="profile-bio" name="bio" dir="auto" value={formData.bio} onChange={handleChange} rows={3} className={`${field} resize-y`} placeholder={t.settings.bioPlaceholder} aria-describedby="profile-context-hint" /> : <div className="h-24 animate-pulse rounded-lg bg-slate-100 dark:bg-white/5" aria-hidden="true" />}
                      <p id="profile-context-hint" className={`mt-1.5 ${muted}`}>{t.settings.contextHint}</p>
                    </div>
                  </fieldset>
                  {success && <p role="status" className="flex items-start gap-2 text-xs leading-relaxed text-emerald-700 dark:text-emerald-400"><UiIcon name="check" />{t.settings.profileUpdated}</p>}
                </div>
                <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 dark:border-white/[0.06] min-[480px]:flex-row min-[480px]:items-center min-[480px]:justify-between sm:px-5">
                  <p role="status" className={`min-w-0 ${muted}`}>{saving ? t.settings.savingState : !hasProfile ? (refreshing ? t.settings.loadingProfile : "") : hasChanges ? t.settings.unsavedState : t.settings.savedState}</p>
                  <button type="submit" disabled={saving || !hasChanges || !hasProfile} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50">
                    {saving && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />}
                    {t.settings.saveProfile}
                  </button>
                </div>
              </form>
            </section>
          ) : (
            <section className={`${card} p-5 sm:p-6`}>
              <span className="inline-flex rounded-lg bg-blue-50 px-2 py-1 text-xs font-medium text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">{t.guest.settingsGuestTitle}</span>
              <p className="mb-4 mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{t.guest.settingsGuestDesc}</p>
              <button type="button" onClick={() => setIsAuthModalOpen(true)} className="min-h-11 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">{t.guest.signInCta}</button>
            </section>
          )}

          <section className={`${card} p-4 sm:p-5`} aria-labelledby="settings-preferences-title">
            <h2 id="settings-preferences-title" className="text-sm font-semibold">{t.settings.preferences}</h2>
            <p className={`mt-1 ${muted}`}>{t.settings.preferencesDesc}</p>
            <div className="mt-5">
              <h3 className="flex items-center gap-2 text-xs font-medium"><UiIcon name="languages" />{t.settings.languageSectionTitle}</h3>
              <p className={`mb-3 mt-1 ${muted}`}>{t.settings.languageSectionDesc}</p>
              <div className="grid min-w-0 gap-2 sm:grid-cols-3 lg:grid-cols-1" role="group" aria-label={t.settings.languageSectionTitle}>
                {languages.map(option => (
                  <button key={option.value} type="button" onClick={() => setLanguage(option.value)} aria-pressed={language === option.value} className={`flex min-h-14 min-w-0 items-center gap-2 rounded-xl border px-3 py-2.5 text-start transition-colors ${language === option.value ? "border-blue-500/50 bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300" : "border-slate-200/80 text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"}`}>
                    <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{option.label}</span><span className={`mt-0.5 block ${muted}`}>{option.description}</span></span>
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-current opacity-80" aria-hidden="true">{language === option.value && <span className="h-2 w-2 rounded-full bg-current" />}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-5 border-t border-slate-100 pt-4 dark:border-white/[0.06]">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-xs font-medium">{t.settings.appearance}</h3>
                <ThemeToggle />
              </div>
              <p className={`mt-2 ${muted}`}>{t.settings.appearanceDesc}</p>
              <p className="mt-1 text-xs font-medium text-slate-600 dark:text-slate-300">{theme === "light" ? t.settings.themeLight : theme === "dark" ? t.settings.themeDark : t.settings.themeSystem}</p>
            </div>
          </section>

          {token && (
            <section className={`${card} lg:col-span-2`} aria-labelledby="settings-account-title">
              <div className="px-4 pb-3 pt-4 sm:px-5">
                <h2 id="settings-account-title" className="text-sm font-semibold">{t.settings.accountActions}</h2>
                <p className={`mt-1 ${muted}`}>{t.settings.accountDesc}</p>
              </div>
              <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-4 dark:border-white/[0.06] sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="min-w-0"><h3 className="text-sm font-medium">{t.settings.signOut}</h3><p className={`mt-1 ${muted}`}>{t.settings.signOutDesc}</p></div>
                <button type="button" onClick={() => setLogoutModalOpen(true)} className={`${secondary} shrink-0`}>{t.settings.signOut}</button>
              </div>
              <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-4 dark:border-white/[0.06] sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="min-w-0"><h3 className="text-sm font-medium text-red-600 dark:text-red-400">{t.settings.deleteAccount}</h3><p className={`mt-1 ${muted}`}>{t.settings.deleteAccountDesc}</p></div>
                <button type="button" disabled={deleting} onClick={() => setDeleteModalOpen(true)} className="min-h-11 shrink-0 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-500/20 dark:text-red-400 dark:hover:bg-red-500/10">{t.settings.deleteAccount}</button>
              </div>
            </section>
          )}
        </div>
        {errorMsg && <p role="alert" className="mt-4 rounded-xl border border-red-500/20 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{errorMsg}</p>}
      </main>

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} onSuccess={() => setIsAuthModalOpen(false)} />
      <ConfirmModal isOpen={logoutModalOpen} onClose={() => setLogoutModalOpen(false)} onConfirm={() => { logout(); navigate("/"); }} title={t.settings.signOutModalTitle} description={t.settings.signOutModalDesc} confirmText={t.settings.signOut} cancelText={t.common.cancel} isDestructive={false} />
      <ConfirmModal
        isOpen={deleteModalOpen}
        onClose={() => { setDeleteModalOpen(false); setDeleteConfirmText(""); }}
        onConfirm={() => {
          if (deleteConfirmText.trim().toUpperCase() === "DELETE") void handleDeleteAccount();
          else setErrorMsg(t.settings.deleteConfirmError);
        }}
        title={t.settings.deleteModalTitle}
        description={<>
          <p className="mb-3 text-red-600 dark:text-red-400">{t.settings.deleteWarning1}</p>
          <p className="mb-4">{t.settings.deleteWarning2}</p>
          <label htmlFor="delete-account-confirm" className="mb-2 block text-sm font-medium">{t.settings.typeDeletePrompt}</label>
          <input id="delete-account-confirm" type="text" value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} className={field} placeholder="DELETE" dir="ltr" autoComplete="off" />
        </>}
        confirmText={t.settings.permanentlyDelete}
        cancelText={t.common.cancel}
      />
    </div>
  );
}
