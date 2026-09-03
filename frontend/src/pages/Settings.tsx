import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getMe, updateProfile, deleteAccount } from "../api/client";
import { useAuthStore } from "../store/authStore";
import ConfirmModal from "../components/ConfirmModal";

export default function Settings() {
  const navigate = useNavigate();
  const { token, user, setUser } = useAuthStore();
  
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
      setErrorMsg(err.response?.data?.detail || "Failed to delete account.");
      setLoading(false);
      setDeleteModalOpen(false);
    }
  };

  const [formData, setFormData] = useState({
    name: "",
    role: "",
    company: "",
    industry: "",
    bio: ""
  });

  useEffect(() => {
    if (!token) {
      navigate("/");
      return;
    }
    
    // Load existing profile
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
  }, [token, navigate, setUser]);

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
      setSuccessMsg("Profile updated successfully! Your board is now personalized.");
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || "Failed to update profile.");
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
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Dashboard
        </button>

        <div className="mb-10">
          <h1 className="text-3xl font-bold mb-2">Profile & Settings</h1>
          <p className="text-slate-600 dark:text-slate-400">
            Customize your profile so the executive board can tailor their advice specifically to your industry, role, and company goals.
          </p>
        </div>

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
            <h2 className="text-lg font-semibold border-b border-slate-200 dark:border-white/5 pb-4 mb-6">Personal Details</h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Full Name</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all shadow-sm dark:shadow-none"
                  placeholder="e.g. Elon Musk"
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Your Role</label>
                <input
                  type="text"
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                  className="w-full bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all shadow-sm dark:shadow-none"
                  placeholder="e.g. CEO, Founder"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Company Name</label>
                <input
                  type="text"
                  name="company"
                  value={formData.company}
                  onChange={handleChange}
                  className="w-full bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all shadow-sm dark:shadow-none"
                  placeholder="e.g. SpaceX"
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Industry</label>
                <input
                  type="text"
                  name="industry"
                  value={formData.industry}
                  onChange={handleChange}
                  className="w-full bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all shadow-sm dark:shadow-none"
                  placeholder="e.g. Aerospace, SaaS"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Company Goals / Bio</label>
              <textarea
                name="bio"
                value={formData.bio}
                onChange={handleChange}
                rows={4}
                className="w-full bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition-all resize-none shadow-sm dark:shadow-none"
                placeholder="What is your company trying to achieve? (e.g. We are building reusable rockets to make life multi-planetary)"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 px-8 rounded-xl shadow-lg shadow-blue-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[150px]"
            >
              {loading ? (
                <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                "Save Profile"
              )}
            </button>
          </div>
        </form>

        {/* Account Actions / Danger Zone */}
        <div className="mt-12 space-y-6">
          <div className="glass-elevated rounded-2xl p-6 sm:p-8 space-y-6 border border-slate-200 dark:border-white/5">
            <h2 className="text-lg font-semibold border-b border-slate-200 dark:border-white/5 pb-4 mb-6">Account Actions</h2>
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-medium text-slate-900 dark:text-white">Sign Out</h3>
                <p className="text-sm text-slate-500">Sign out of your account on this device.</p>
              </div>
              <button
                type="button"
                onClick={() => setLogoutModalOpen(true)}
                className="px-6 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors font-medium text-sm"
              >
                Sign Out
              </button>
            </div>
          </div>

          <div className="glass-elevated rounded-2xl p-6 sm:p-8 space-y-6 border border-red-500/20 bg-red-50/50 dark:bg-red-500/5">
            <h2 className="text-lg font-semibold text-red-600 dark:text-red-400 border-b border-red-500/20 pb-4 mb-6">Danger Zone</h2>
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-medium text-red-700 dark:text-red-400">Delete Account</h3>
                <p className="text-sm text-red-600/70 dark:text-red-400/70">Permanently delete your account and all associated data.</p>
              </div>
              <button
                type="button"
                onClick={() => setDeleteModalOpen(true)}
                className="px-6 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white transition-colors font-medium text-sm shadow-lg shadow-red-500/25"
              >
                Delete Account
              </button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal 
        isOpen={logoutModalOpen}
        onClose={() => setLogoutModalOpen(false)}
        onConfirm={logout}
        title="Sign Out"
        description="Are you sure you want to sign out of Boardroom AI?"
        confirmText="Sign Out"
      />

      <ConfirmModal 
        isOpen={deleteModalOpen}
        onClose={() => { setDeleteModalOpen(false); setDeleteConfirmText(""); }}
        onConfirm={() => {
          if (deleteConfirmText === "DELETE") {
            handleDeleteAccount();
          } else {
            setErrorMsg("Please type DELETE to confirm account deletion.");
            setDeleteModalOpen(false);
          }
        }}
        title="Delete Account"
        description={<>
          <p className="mb-4 text-red-500 font-medium">Warning: This action cannot be undone.</p>
          <p className="mb-4">This will permanently delete your account, chats, and meetings.</p>
          <div className="mt-4">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Type <strong>DELETE</strong> to confirm:
            </label>
            <input 
              type="text" 
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white"
              placeholder="DELETE"
            />
          </div>
        </>}
        confirmText="Permanently Delete"
      />
    </div>
  );
}
