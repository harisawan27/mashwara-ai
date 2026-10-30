import { useEffect } from "react";

/** Keep the app and dialogs inside the visible area when a mobile keyboard opens. */
export function useViewportHeight() {
  useEffect(() => {
    const viewport = window.visualViewport;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Preserve normal page zoom rather than resizing the UI around a pinch gesture.
        if (viewport && viewport.scale !== 1) return;
        document.documentElement.style.setProperty("--app-height", `${viewport?.height ?? window.innerHeight}px`);
      });
    };
    update();
    window.addEventListener("resize", update);
    viewport?.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      viewport?.removeEventListener("resize", update);
      document.documentElement.style.removeProperty("--app-height");
    };
  }, []);
}
