import { useLocaleStore, type SupportedLanguage } from "../store/localeStore";
import { ur } from "./translations/ur";
import { en } from "./translations/en";
import { romanUrdu } from "./translations/romanUrdu";
import type { TranslationSchema } from "./types";

const translations: Record<SupportedLanguage, TranslationSchema> = {
  ur,
  en,
  "roman-ur": romanUrdu,
};

export function getTranslations(lang: SupportedLanguage): TranslationSchema {
  return translations[lang] || translations.ur;
}

export function useTranslation() {
  const { language, setLanguage, isRTL, dir } = useLocaleStore();
  const t = getTranslations(language);

  return {
    t,
    language,
    setLanguage,
    isRTL,
    dir,
  };
}

export type { TranslationSchema, SupportedLanguage };
