import { create } from "zustand";

export type SupportedLanguage = "ur" | "roman-ur" | "en";

interface LocaleState {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  isRTL: boolean;
  dir: "rtl" | "ltr";
}

const STORAGE_KEY = "mashwara_language";

function applyDocumentLocale(lang: SupportedLanguage) {
  if (typeof document === "undefined") return;
  const isUrdu = lang === "ur";
  document.documentElement.dir = isUrdu ? "rtl" : "ltr";
  document.documentElement.lang = isUrdu ? "ur" : lang === "roman-ur" ? "ur-Latn" : "en";
  
  if (isUrdu) {
    document.documentElement.classList.add("lang-ur");
  } else {
    document.documentElement.classList.remove("lang-ur");
  }
}

function getInitialLanguage(): SupportedLanguage {
  if (typeof window === "undefined") return "ur";
  const stored = localStorage.getItem(STORAGE_KEY) as SupportedLanguage | null;
  // Default to Urdu for new users if not explicitly set
  if (stored === "ur" || stored === "en" || stored === "roman-ur") {
    return stored;
  }
  return "ur";
}

const initialLang = getInitialLanguage();
applyDocumentLocale(initialLang);

export const useLocaleStore = create<LocaleState>((set) => ({
  language: initialLang,
  isRTL: initialLang === "ur",
  dir: initialLang === "ur" ? "rtl" : "ltr",
  setLanguage: (language: SupportedLanguage) => {
    localStorage.setItem(STORAGE_KEY, language);
    applyDocumentLocale(language);
    set({
      language,
      isRTL: language === "ur",
      dir: language === "ur" ? "rtl" : "ltr",
    });
  },
}));
