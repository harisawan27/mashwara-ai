/**
 * Mashwara AI — Composer Plus Menu
 * ==================================
 * The "+" button in the composer toolbar. Opens:
 * - Desktop: an anchored popover above the button
 * - Mobile (<= 640px): a bottom sheet with backdrop
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
  const { t, isRTL } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [webSubOpen, setWebSubOpen] = useState(false);
  const plusButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on Escape, return focus to + button
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setIsOpen(false);
        setWebSubOpen(false);
        plusButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen]);

  // Auto-focus first item when menu opens
  useEffect(() => {
    if (isOpen && menuRef.current) {
      const firstBtn = menuRef.current.querySelector<HTMLButtonElement>("button");
      firstBtn?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !plusButtonRef.current?.contains(target)) {
        setIsOpen(false);
        setWebSubOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

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
    children,
  }: {
    icon: string;
    label: string;
    onClick?: () => void;
    active?: boolean;
    children?: React.ReactNode;
  }) => (
    <div>
      <button
        type="button"
        onClick={onClick}
        className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors text-start min-h-[48px] ${
          active
            ? "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300"
            : "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60"
        }`}
      >
        <span className="text-base w-5 text-center">{icon}</span>
        <span className="flex-1">{label}</span>
        {active && <span className="text-blue-500 text-xs font-bold">✓</span>}
        {children && <span className="text-slate-400 text-xs">▸</span>}
      </button>
      {children}
    </div>
  );

  // ─── Web sub-picker ─────────────────────────────────────────────────────────
  const WebSubPicker = () => (
    <div className="border-t border-slate-100 dark:border-white/[0.06] bg-slate-50/80 dark:bg-slate-800/40">
      {(["auto", "on", "off"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => handleWebMode(mode)}
          className={`w-full flex items-center gap-3 px-6 py-2.5 text-xs font-medium transition-colors text-start min-h-[40px] ${
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
          <span>
            {mode === "auto"
              ? t.webSearch?.modeAuto || "Auto"
              : mode === "on"
              ? t.webSearch?.modeOn || "On"
              : t.webSearch?.modeOff || "Off"}
          </span>
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
      className="py-1"
    >
      <MenuRow
        icon="📄"
        label={t.attachments?.attachFiles || "Documents"}
        onClick={handleDocClick}
      />
      <MenuRow
        icon="🖼️"
        label={t.attachments?.attachImages || "Images"}
        onClick={handleImgClick}
      />
      <div className="h-px bg-slate-100 dark:bg-white/[0.06] mx-3" />
      <div>
        <button
          type="button"
          onClick={() => setWebSubOpen((v) => !v)}
          className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors text-start min-h-[48px] ${
            webSearchMode !== "off"
              ? "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300"
              : "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60"
          }`}
        >
          <span className="text-base w-5 text-center">🌐</span>
          <span className="flex-1">
            {t.webSearch?.tooltip
              ? "Web Research"
              : "Web Research"}
          </span>
          <span className="text-xs text-slate-400 font-normal mr-1">
            {webSearchMode === "auto"
              ? t.webSearch?.modeAuto || "Auto"
              : webSearchMode === "on"
              ? t.webSearch?.modeOn || "On"
              : t.webSearch?.modeOff || "Off"}
          </span>
          <svg
            className={`w-3.5 h-3.5 text-slate-400 transition-transform ${webSubOpen ? "rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        {webSubOpen && <WebSubPicker />}
      </div>
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
        className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
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
        <>
          {/* Click-outside backdrop */}
          <div className="fixed inset-0 z-30" onClick={close} aria-hidden="true" />

          {/* Desktop: anchored popover */}
          <div
            className={`hidden sm:block absolute z-40 bottom-full mb-2 ${
              isRTL ? "right-0" : "left-0"
            } w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden animate-fade-in`}
          >
            <MenuContent />
          </div>

          {/* Mobile: bottom sheet */}
          <div className="sm:hidden fixed inset-x-0 bottom-0 z-40 animate-slide-up">
            {/* Sheet backdrop */}
            <div className="fixed inset-0 bg-black/30 dark:bg-black/50" onClick={close} />
            <div className="relative bg-white dark:bg-slate-900 rounded-t-2xl shadow-2xl pb-safe overflow-hidden">
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
              </div>
              <p className="px-4 pb-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Add to message
              </p>
              <MenuContent />
              <div className="h-6 pb-[env(safe-area-inset-bottom)]" />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ComposerPlusMenu;
