import { useTranslation } from "../i18n";

export interface LocalizedBrandProps {
  className?: string;
  firstClassName?: string;
  aiClassName?: string;
  forceLang?: string;
  forceUrdu?: boolean;
}

/**
 * LocalizedBrand — Pixel-perfect brand presentation.
 * In Urdu: renders "مشورہ" on the right, "AI" on the left, with an isolated,
 * non-collapsing gap-1.5 between them.
 * In English / Roman Urdu: renders "Mashwara AI".
 */
export function LocalizedBrand({
  className = "",
  firstClassName = "text-[#0F172A] dark:text-white font-extrabold",
  aiClassName = "text-[#2563EB] font-sans font-black",
  forceLang,
  forceUrdu,
}: LocalizedBrandProps) {
  const { language } = useTranslation();
  const activeLang = forceUrdu ? "ur" : forceLang || language;

  if (activeLang === "ur") {
    return (
      <span dir="rtl" className={`inline-flex items-baseline gap-1.5 ${className}`}>
        <span className={`font-urdu ${firstClassName}`}>مشورہ</span>
        <span
          dir="ltr"
          style={{ unicodeBidi: "isolate" }}
          className={`${aiClassName} font-sans`}
        >
          AI
        </span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-baseline ${className}`}>
      <span className={firstClassName}>Mashwara</span>
      <span className={aiClassName}>AI</span>
    </span>
  );
}

export default LocalizedBrand;
