import { useEffect, useRef, type RefObject } from "react";

const openDialogs: HTMLElement[] = [];
let previousOverflow = "";

/** Focus, Escape, and scroll containment shared by modal surfaces, including nested ones. */
export function useDialog(
  isOpen: boolean,
  onClose?: () => void,
  suppliedRef?: RefObject<HTMLDivElement | null>,
) {
  const internalRef = useRef<HTMLDivElement>(null);
  const dialogRef = suppliedRef ?? internalRef;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!isOpen || !dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (openDialogs.length === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    openDialogs.push(dialog);
    const focusable = () => [...dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), a[href], input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
    )].filter(element => element.getClientRects().length > 0 && !element.closest("[inert]"));
    const frame = requestAnimationFrame(() => {
      if (!dialog.contains(document.activeElement)) {
        (dialog.querySelector<HTMLElement>("[data-autofocus]") ?? focusable()[0] ?? dialog).focus({ preventScroll: true });
      }
    });
    const handleKey = (event: KeyboardEvent) => {
      if (openDialogs.at(-1) !== dialog || event.defaultPrevented) return;
      if (document.activeElement instanceof Element && document.activeElement.closest("[data-ui-popover]")) return;
      if (event.key === "Escape" && closeRef.current) {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
      } else if (event.key === "Tab") {
        const controls = focusable();
        const first = controls[0];
        const last = controls.at(-1);
        if (!first) {
          event.preventDefault();
          dialog.focus();
        } else if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKey);
      const wasTopDialog = openDialogs.at(-1) === dialog;
      const index = openDialogs.indexOf(dialog);
      if (index !== -1) openDialogs.splice(index, 1);
      if (openDialogs.length === 0) document.body.style.overflow = previousOverflow;
      if (wasTopDialog && previousFocus?.isConnected && !previousFocus.closest("[inert]")) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [isOpen, dialogRef]);

  return dialogRef;
}
