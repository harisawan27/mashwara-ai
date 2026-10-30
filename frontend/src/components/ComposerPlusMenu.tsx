/**
 * Mashwara AI — Composer Plus Menu
 * ==================================
 * The "+" button in the composer toolbar. Opens:
 * - Desktop and mobile: a compact anchored popover above the button
 *
 * Surfaces:
 *  📄 Documents — triggers docInputRef
 *  🖼️ Images    — triggers imgInputRef
 *  🌐 Web Research — inline Auto / On / Off sub-picker
 *
 * Keyboard:
 *  Escape closes, focus returns to + button.
 *  Tab navigates rows.
 */

import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "../i18n";
import Popover from "./Popover";

interface ComposerPlusMenuProps {
  docInputRef: React.RefObject<HTMLInputElement | null>;
  imgInputRef: React.RefObject<HTMLInputElement | null>;
  webSearchMode: "auto" | "on" | "off";
  onWebSearchModeChange: (mode: "auto" | "on" | "off") => void;
  disabled?: boolean;
}

export const ComposerPlusMenu: React.FC<ComposerPlusMenuProps> = ({
  docInputRef,
  imgInputRef,
  webSearchMode,
  onWebSearchModeChange,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [webSubOpen, setWebSubOpen] = useState(false);
  const plusButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Keep keyboard focus inside the active submenu as its content changes.
  useEffect(() => {
    if (isOpen && menuRef.current) {
      const firstBtn = menuRef.current.querySelector<HTMLButtonElement>("button");
      firstBtn?.focus();
    }
  }, [isOpen, webSubOpen]);

  const close = () => {
    setIsOpen(false);
    setWebSubOpen(false);
  };

  const handleDocClick = () => {
    close();
    setTimeout(() => docInputRef.current?.click(), 50);
  };

  const handleImgClick = () => {
    close();
    setTimeout(() => imgInputRef.current?.click(), 50);
  };

  const handleWebMode = (mode: "auto" | "on" | "off") => {
    onWebSearchModeChange(mode);
    close();
  };

  // ─── Row component ──────────────────────────────────────────────────────────
  const MenuRow = ({
    icon,
    label,
    onClick,
    active,
  }: {
    icon: string;
    label: string;
    onClick?: () => void;
    active?: boolean;
  }) => (
    <div>
      <button
        type="button"
        onClick={onClick}
        className={`w-full min-h-11 flex items-center gap-2.5 px-3 py-2 text-sm font-medium transition-colors text-start rounded-lg ${
          active
            ? "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300"
            : "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60"
        }`}
      >
        <span className="text-sm w-5 text-center flex-shrink-0">{icon}</span>
        <span className="flex-1 min-w-0 break-words">{label}</span>
        {active && <span className="text-blue-500 text-xs font-bold">✓</span>}
      </button>
    </div>
  );

  // ─── Web sub-picker ─────────────────────────────────────────────────────────
  const WebSubPicker = () => (
    <div>
      {(["auto", "on", "off"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => handleWebMode(mode)}
          className={`w-full min-h-11 flex items-center gap-2.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors text-start ${
            webSearchMode === mode
              ? "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 font-semibold"
              : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/50"
          }`}
        >
          <span className="w-3 h-3 rounded-full border-2 flex items-center justify-center flex-shrink-0 border-current">
            {webSearchMode === mode && (
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
            )}
          </span>
          <span className="flex-1 min-w-0 truncate">
            {mode === "auto"
              ? t.webSearch?.modeAuto || "Auto"
              : mode === "on"
              ? t.webSearch?.modeOn || "On"
              : t.webSearch?.modeOff || "Off"}
          </span>
          {webSearchMode === mode && <span className="flex-shrink-0 text-blue-500 text-xs font-bold">✓</span>}
        </button>
      ))}
    </div>
  );

  // ─── Menu content ────────────────────────────────────────────────────────────
  const MenuContent = () => (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Add context"
      className="p-1"
    >
      {webSubOpen ? (
        <>
          <button
            type="button"
            onClick={() => setWebSubOpen(false)}
            className="w-full min-h-11 flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60"
          >
            <span className="text-slate-400 rtl:rotate-180">‹</span>
            <span className="truncate">Web Research</span>
          </button>
          <div className="h-px bg-slate-100 dark:bg-white/[0.06] mx-2" />
          <WebSubPicker />
        </>
      ) : (
        <>
          <MenuRow icon="📄" label={t.attachments?.attachFiles || "Documents"} onClick={handleDocClick} />
          <MenuRow icon="🖼️" label={t.attachments?.attachImages || "Images"} onClick={handleImgClick} />
          <div className="h-px bg-slate-100 dark:bg-white/[0.06] mx-2" />
          <button
            type="button"
            onClick={() => setWebSubOpen(true)}
            className={`w-full min-h-11 flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-start ${
              webSearchMode !== "off"
                ? "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300"
                : "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60"
            }`}
          >
            <span className="text-sm w-5 text-center flex-shrink-0">🌐</span>
            <span className="flex-1 min-w-0 truncate">Web Research</span>
            <span className="flex-shrink-0 text-xs text-slate-400 rtl:rotate-180">›</span>
          </button>
        </>
      )}
    </div>
  );

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="relative flex-shrink-0">
      {/* Plus button */}
      <button
        ref={plusButtonRef}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((v) => !v)}
        aria-label="Add context"
        aria-expanded={isOpen}
        aria-haspopup="true"
        className={`ui-icon-button flex flex-shrink-0 items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
          isOpen
            ? "bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400"
            : disabled
            ? "text-slate-300 dark:text-slate-600 cursor-not-allowed"
            : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
        }`}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {isOpen && (
        <Popover
          anchorRef={plusButtonRef}
          onClose={close}
          side="top"
          width={248}
          className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl shadow-xl animate-fade-in"
        >
          <MenuContent />
        </Popover>
      )}
    </div>
  );
};

export default ComposerPlusMenu;
