import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

interface PopoverProps {
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
  className: string;
  width?: number;
  side?: "top" | "bottom";
  align?: "start" | "end";
  label?: string;
}

/** An anchored menu that flips and stays inside the viewport, including above keyboards. */
export default function Popover({ anchorRef, onClose, children, className, width = 288, side = "bottom", align = "start", label }: PopoverProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [position, setPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const menu = menuRef.current;
    if (!anchor || !menu) return;
    let frame = 0;
    const update = () => {
      const inset = 12;
      const gap = 8;
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const rect = anchor.getBoundingClientRect();
      const menuWidth = Math.min(width, viewportWidth - inset * 2);
      const above = Math.max(0, rect.top - gap - inset);
      const below = Math.max(0, viewportHeight - rect.bottom - gap - inset);
      const preferAbove = side === "top";
      const showAbove = preferAbove ? above >= Math.min(menu.scrollHeight, 160) || above > below : below < Math.min(menu.scrollHeight, 160) && above > below;
      const maxHeight = Math.max(0, Math.min(384, viewportHeight - inset * 2, showAbove ? above : below));
      const height = Math.min(menu.scrollHeight, maxHeight);
      const rtl = getComputedStyle(anchor).direction === "rtl";
      const startAtLeft = (align === "start") !== rtl;
      const idealLeft = startAtLeft ? rect.left : rect.right - menuWidth;
      setPosition({
        top: Math.max(inset, Math.min(showAbove ? rect.top - gap - height : rect.bottom + gap, viewportHeight - height - inset)),
        left: Math.max(inset, Math.min(idealLeft, viewportWidth - menuWidth - inset)),
        width: menuWidth,
        maxHeight,
      });
    };
    const scheduleUpdate = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(menu);
    observer.observe(anchor);
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, true);
    window.visualViewport?.addEventListener("resize", scheduleUpdate);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
      window.visualViewport?.removeEventListener("resize", scheduleUpdate);
    };
  }, [anchorRef, width, side, align]);

  useEffect(() => {
    const anchor = anchorRef.current;
    const menu = menuRef.current;
    const frame = requestAnimationFrame(() => menu?.querySelector<HTMLElement>("button:not(:disabled), a[href]")?.focus({ preventScroll: true }));
    const outside = (event: PointerEvent) => {
      if (!menu?.contains(event.target as Node) && !anchor?.contains(event.target as Node)) closeRef.current();
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        anchor?.focus({ preventScroll: true });
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const items = [...menu?.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]") ?? []];
        const index = items.indexOf(document.activeElement as HTMLElement);
        const next = (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        if (items[next]) {
          event.preventDefault();
          items[next].focus();
        }
      } else if (event.key === "Tab") {
        const items = [...menu?.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]") ?? []];
        if ((event.shiftKey && document.activeElement === items[0]) || (!event.shiftKey && document.activeElement === items.at(-1))) {
          event.preventDefault();
          closeRef.current();
          anchor?.focus({ preventScroll: true });
        }
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", keyboard, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", keyboard, true);
      if (menu?.contains(document.activeElement)) anchor?.focus({ preventScroll: true });
    };
  }, [anchorRef]);

  return createPortal(
    <div ref={menuRef} data-ui-popover aria-label={label} className={`overscroll-contain custom-scrollbar [&_button]:min-h-11 ${className}`} style={{ position: "fixed", zIndex: 90, width: Math.min(width, window.innerWidth - 24), overflowY: "auto", visibility: position ? "visible" : "hidden", ...position }}>
      {children}
    </div>,
    document.body,
  );
}
