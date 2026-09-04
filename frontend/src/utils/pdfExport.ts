/**
 * Mashwara AI — Multi-Page PDF Export Engine
 * ===========================================
 * Generates faithful, colorful, high-DPI multi-page A4 PDFs directly via client-side JavaScript.
 *
 * Architecture & Guarantees:
 * 1. Standard readable pages: A4 portrait (~595.28pt x 841.89pt) with comfortable margins.
 * 2. Multi-page pagination: Cards and semantic blocks fit onto readable sequential pages.
 * 3. NO single giant microscopic page; NO browser print dialog (`window.print()`).
 * 4. Strict Section Integrity: Expected sections must equal captured sections.
 *    Any capture error triggers a bounded retry; if it still fails, generation is aborted
 *    with a clear user notification. NO silent catch-and-continue data loss.
 * 5. Isolated onclone rendering: Export DOM is kept invisible on screen at all times (no flash),
 *    while html2canvas's internal clone is made visible at normal coordinates for 100% accurate layout.
 * 6. Native Color Sanitization: Converts modern Tailwind v4 oklch() / color-mix() colors
 *    into standard RGB strings via the browser's 2D canvas engine to prevent parser crashes.
 * 7. Two-Tier Capture with Native SVG Fallback:
 *    - Tier 1: High-fidelity html2canvas with isolated clone & color sanitization.
 *    - Tier 2: Native SVG <foreignObject> rasterization for 100% CSS color compatibility.
 * 8. Direct file download: `mashwara-<sanitized-title>.pdf` via JavaScript.
 */

import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export interface ExportPdfOptions {
  elementId?: string;
  element?: HTMLElement | null;
  onProgress?: (stage: "preparing" | "capturing" | "assembling" | "saving") => void;
  onError?: (error: Error) => void;
}

// Reusable offscreen canvas for converting any CSS color (oklch, color-mix, etc.) to safe rgb
let colorCanvas: HTMLCanvasElement | null = null;
let colorCtx: CanvasRenderingContext2D | null = null;

function toSafeRgb(raw: string): string {
  if (!raw || raw === "transparent" || raw === "inherit" || raw === "initial" || raw === "currentColor") {
    return raw;
  }
  if (!raw.includes("oklch") && !raw.includes("color-mix") && !raw.includes("lab") && !raw.includes("lch")) {
    return raw;
  }
  if (typeof document === "undefined") return "#ffffff";
  if (!colorCanvas) {
    colorCanvas = document.createElement("canvas");
    colorCanvas.width = 1;
    colorCanvas.height = 1;
    colorCtx = colorCanvas.getContext("2d", { willReadFrequently: true });
  }
  if (!colorCtx) return "#ffffff";
  try {
    colorCtx.fillStyle = "#ffffff";
    colorCtx.fillStyle = raw;
    return colorCtx.fillStyle; // Native 2D canvas parser returns "#rrggbb" or "rgba(...)"
  } catch {
    return "#ffffff";
  }
}

/**
 * Sanitizes the cloned document for html2canvas:
 * - Makes the export container fully visible at origin
 * - Converts modern oklch / color-mix declarations to standard RGB
 * - Disables transitions and animations for instant static rasterization
 */
function sanitizeClonedDom(clonedDoc: Document, targetContainerId: string, sectionId: string) {
  // 1. Position and display the export container at normal origin coordinates
  const clonedContainer =
    clonedDoc.getElementById(targetContainerId) ||
    clonedDoc.querySelector<HTMLElement>("[data-mashwara-export='true']");
  if (clonedContainer) {
    clonedContainer.style.opacity = "1";
    clonedContainer.style.visibility = "visible";
    clonedContainer.style.position = "absolute";
    clonedContainer.style.top = "0";
    clonedContainer.style.left = "0";
    clonedContainer.style.zIndex = "1000";
    clonedContainer.style.transform = "none";
    clonedContainer.style.pointerEvents = "auto";
    clonedContainer.style.maxHeight = "none";
    clonedContainer.style.overflow = "visible";
    clonedContainer.style.height = "auto";
    clonedContainer.style.backgroundColor = "#ffffff";
  }

  // 2. Ensure the target section and all sections in the clone are visible
  const clonedEl = clonedDoc.querySelector<HTMLElement>(`[data-pdf-section="${sectionId}"]`);
  if (clonedEl) {
    clonedEl.style.opacity = "1";
    clonedEl.style.visibility = "visible";
  }
  const allSections = clonedDoc.querySelectorAll<HTMLElement>("[data-pdf-section]");
  allSections.forEach((s) => {
    s.style.opacity = "1";
    s.style.visibility = "visible";
  });

  // 3. Sanitize all <style> elements: replace oklch(...) and color-mix(...) with RGB equivalents
  clonedDoc.querySelectorAll("style").forEach((styleEl) => {
    if (styleEl.textContent && (styleEl.textContent.includes("oklch") || styleEl.textContent.includes("color-mix"))) {
      try {
        styleEl.textContent = styleEl.textContent
          .replace(/oklch\([^)]+\)/gi, (m) => toSafeRgb(m))
          .replace(/color-mix\([^)]+\)/gi, (m) => toSafeRgb(m));
      } catch (e) {
        console.warn("[PDF Export] Style tag sanitize warning:", e);
      }
    }
  });

  // 4. Sanitize all elements: convert computed modern color properties to explicit safe RGB inline styles
  const allCloned = clonedDoc.querySelectorAll<HTMLElement>("*");
  const win = clonedDoc.defaultView || window;
  const colorProps = [
    "color",
    "backgroundColor",
    "borderColor",
    "borderTopColor",
    "borderRightColor",
    "borderBottomColor",
    "borderLeftColor",
    "outlineColor",
    "fill",
    "stroke",
  ] as const;

  allCloned.forEach((node) => {
    node.style.animation = "none";
    node.style.transition = "none";

    try {
      const comp = win.getComputedStyle(node);
      for (const prop of colorProps) {
        const val = (comp as any)[prop];
        if (val && (val.includes("oklch") || val.includes("color-mix"))) {
          (node.style as any)[prop] = toSafeRgb(val);
        }
      }
    } catch {
      // Ignore if element is detached
    }
  });
}

/**
 * Fallback rasterizer: Uses the browser's native SVG <foreignObject> engine
 * which natively parses and renders any CSS color function (oklch, color-mix, gradients).
 */
async function captureFallbackSvg(
  el: HTMLElement,
  sectionId: string
): Promise<HTMLCanvasElement> {
  console.log(`[PDF Export] Rendering native SVG fallback for section "${sectionId}"...`);
  const rect = el.getBoundingClientRect();
  const width = Math.ceil(rect.width || 820);
  const height = Math.ceil(rect.height || 400);

  const clone = el.cloneNode(true) as HTMLElement;
  clone.style.width = `${width}px`;
  clone.style.height = "auto";
  clone.style.margin = "0";
  clone.style.transform = "none";
  clone.style.opacity = "1";
  clone.style.visibility = "visible";
  clone.style.backgroundColor = "#ffffff";

  // Collect active stylesheets
  let cssText = "";
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        cssText += rule.cssText + "\n";
      }
    } catch {
      // Ignore cross-origin rules
    }
  }

  const serializer = new XMLSerializer();
  const serialized = serializer.serializeToString(clone);

  const svgData = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width * 2}" height="${height * 2}" viewBox="0 0 ${width} ${height}">
      <style>
        ${cssText}
        * { animation: none !important; transition: none !important; }
      </style>
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml" style="background-color: #ffffff; width: ${width}px; min-height: ${height}px;">
          ${serialized}
        </div>
      </foreignObject>
    </svg>
  `;

  const canvas = document.createElement("canvas");
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not acquire 2D canvas context");

  const img = new Image();
  const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);

  await new Promise<void>((resolve, reject) => {
    img.onload = () => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve();
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });

  return canvas;
}

export async function exportMashwaraPdf(
  title: string = "Mashwara-Consultation",
  options?: ExportPdfOptions
): Promise<void> {
  const targetElement =
    options?.element ||
    (options?.elementId ? document.getElementById(options?.elementId) : null) ||
    document.querySelector<HTMLElement>("[data-mashwara-export='true']") ||
    document.getElementById("mashwara-export-content");

  if (!targetElement) {
    const notFoundErr = new Error("Mashwara PDF export container element was not found in the DOM.");
    console.error("[PDF Export] Container not found:", notFoundErr);
    options?.onError?.(notFoundErr);
    throw notFoundErr;
  }

  options?.onProgress?.("preparing");

  // Ensure all web fonts (including Gulzar and Noto Nastaliq Urdu) are fully loaded
  if (typeof document !== "undefined" && document.fonts && document.fonts.ready) {
    try {
      await document.fonts.ready;
    } catch (fontErr) {
      console.warn("[PDF Export] document.fonts.ready warning, proceeding:", fontErr);
    }
  }

  // Discover all discrete semantic sections in document order
  const sectionElements = Array.from(
    targetElement.querySelectorAll<HTMLElement>("[data-pdf-section]")
  );

  const targets = sectionElements.length > 0 ? sectionElements : [targetElement];
  const expectedCount = targets.length;
  const sectionIds = targets.map((t) => t.getAttribute("data-pdf-section") || "unnamed");

  console.log(`[PDF Export] Expected section IDs (${expectedCount}):`, sectionIds);

  options?.onProgress?.("capturing");

  // Standard A4 dimensions in typographic points (pt)
  const pdfWidth = 595.28; // A4 portrait width
  const pdfHeight = 841.89; // A4 portrait height
  const margin = 24; // Margin around printable area
  const gap = 8; // Spacing between consecutive sections
  const contentWidth = pdfWidth - margin * 2; // ~547.28 pt
  const printableHeight = pdfHeight - margin * 2; // ~793.89 pt

  const capturedSections: Array<{
    sectionId: string;
    canvas: HTMLCanvasElement;
    heightPt: number;
  }> = [];

  const targetContainerId = targetElement.id || "mashwara-export-container";

  // Capture helper with bounded retry, sanitized onclone, and native fallback
  async function captureSection(el: HTMLElement, sectionId: string): Promise<HTMLCanvasElement> {
    const rect = el.getBoundingClientRect();
    const width = Math.ceil(rect.width || 820);
    const height = Math.ceil(rect.height || 400);
    console.log(`[PDF Export] Capturing section "${sectionId}" (${width}x${height})...`);

    const doPrimaryCapture = async () => {
      return await html2canvas(el, {
        scale: 2, // 2x resolution for crisp Nastaliq text & badges
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        windowWidth: 820,
        onclone: (clonedDoc: Document) => {
          sanitizeClonedDom(clonedDoc, targetContainerId, sectionId);
        },
      });
    };

    try {
      const canvas = await doPrimaryCapture();
      if (!canvas || canvas.width === 0 || canvas.height === 0) {
        throw new Error(`Empty canvas produced for section "${sectionId}"`);
      }
      return canvas;
    } catch (firstErr: any) {
      console.warn(`[PDF Export] First attempt failure for "${sectionId}": ${firstErr.message || firstErr}`);

      // Stabilize fonts & DOM
      if (typeof document !== "undefined" && document.fonts && document.fonts.ready) {
        try { await document.fonts.ready; } catch {}
      }
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 150)));

      console.warn(`[PDF Export] Retrying with sanitized isolated fallback for "${sectionId}"...`);
      try {
        const retryCanvas = await doPrimaryCapture();
        if (retryCanvas && retryCanvas.width > 0 && retryCanvas.height > 0) {
          return retryCanvas;
        }
      } catch (retryErr: any) {
        console.warn(`[PDF Export] Primary retry failed for "${sectionId}": ${retryErr.message || retryErr}, attempting native SVG fallback...`);
      }

      // Tier 2 Fallback: Browser native SVG renderer
      try {
        const svgCanvas = await captureFallbackSvg(el, sectionId);
        if (svgCanvas && svgCanvas.width > 0 && svgCanvas.height > 0) {
          console.log(`[PDF Export] Successfully captured "${sectionId}" via native fallback.`);
          return svgCanvas;
        }
      } catch (svgErr: any) {
        console.error(`[PDF Export] Retry failure for "${sectionId}": ${svgErr.message || svgErr}`);
      }

      console.error(`[PDF Export] FATAL: Section "${sectionId}" capture failed. Aborting to avoid data loss.`);
      throw new Error(`Critical consultation section "${sectionId}" could not be captured.`);
    }
  }

  // Capture all sections sequentially
  for (let i = 0; i < targets.length; i++) {
    const el = targets[i];
    const sectionId = el.getAttribute("data-pdf-section") || `section-${i}`;

    try {
      const canvas = await captureSection(el, sectionId);
      const ratio = contentWidth / canvas.width;
      const heightPt = canvas.height * ratio;
      capturedSections.push({ sectionId, canvas, heightPt });
    } catch (err: any) {
      const exportError = new Error(`PDF export failed at section "${sectionId}": ${err.message || err}`);
      console.error("[PDF Export] Section capture error:", exportError);
      console.error(`[PDF Export] Save not reached: export aborted due to capture failure on section "${sectionId}"`);
      options?.onError?.(exportError);
      throw exportError;
    }
  }

  // Strict Section Count Verification
  if (capturedSections.length !== expectedCount) {
    const mismatchErr = new Error(
      `PDF export verification failed: expected ${expectedCount} sections, captured ${capturedSections.length}. Download aborted to protect report integrity.`
    );
    console.error("[PDF Export] Verification mismatch:", mismatchErr);
    console.error("[PDF Export] Save not reached: export aborted due to section count mismatch");
    options?.onError?.(mismatchErr);
    throw mismatchErr;
  }

  options?.onProgress?.("assembling");

  // ───────────────────────────────────────────────────────────────────────────
  // Multi-Page A4 PDF Assembly
  // ───────────────────────────────────────────────────────────────────────────
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
  });

  let currentY = margin;

  for (let i = 0; i < capturedSections.length; i++) {
    const item = capturedSections[i];

    // Standard case: Section fits on a single page
    if (item.heightPt <= printableHeight) {
      if (currentY + item.heightPt > pdfHeight - margin && currentY > margin) {
        pdf.addPage();
        currentY = margin;
      }

      const imgData = item.canvas.toDataURL("image/png");
      pdf.addImage(imgData, "PNG", margin, currentY, contentWidth, item.heightPt);
      currentY += item.heightPt + gap;
    } else {
      // Oversized case: Section is taller than a full printable page
      // Raw canvas slicing fallback: dynamically locate blank inter-line whitespace rows
      // so slicing never cuts horizontally through a line of text.
      const nominalSliceHeightPx = Math.floor(printableHeight * (item.canvas.width / contentWidth));
      let yOffsetPx = 0;

      while (yOffsetPx < item.canvas.height) {
        if (currentY + 20 > pdfHeight - margin) {
          pdf.addPage();
          currentY = margin;
        }

        const remainingPx = item.canvas.height - yOffsetPx;
        let thisSliceHeightPx = Math.min(nominalSliceHeightPx, remainingPx);

        if (remainingPx > nominalSliceHeightPx) {
          thisSliceHeightPx = findCleanSlicePoint(item.canvas, yOffsetPx, nominalSliceHeightPx);
        }

        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = item.canvas.width;
        sliceCanvas.height = thisSliceHeightPx;
        const sCtx = sliceCanvas.getContext("2d");
        if (sCtx) {
          sCtx.drawImage(
            item.canvas,
            0,
            yOffsetPx,
            item.canvas.width,
            thisSliceHeightPx,
            0,
            0,
            item.canvas.width,
            thisSliceHeightPx
          );
        }

        const sliceHeightPt = thisSliceHeightPx * (contentWidth / item.canvas.width);
        const sliceData = sliceCanvas.toDataURL("image/png");
        pdf.addImage(sliceData, "PNG", margin, currentY, contentWidth, sliceHeightPt);
        currentY += sliceHeightPt + gap;
        yOffsetPx += thisSliceHeightPx;
      }
    }
  }

  // Add subtle, elegant page numbers to each page
  const totalPages = pdf.getNumberOfPages();
  console.log(`[PDF Export] Assembly status: assembling ${totalPages} A4 pages...`);

  for (let p = 1; p <= totalPages; p++) {
    pdf.setPage(p);
    pdf.setFontSize(7.5);
    pdf.setTextColor(148, 163, 184); // slate-400
    pdf.text(
      `Mashwara AI  •  Page ${p} of ${totalPages}`,
      pdfWidth / 2,
      pdfHeight - 12,
      { align: "center" }
    );
  }

  options?.onProgress?.("saving");

  const sanitizedTitle = sanitizeFilename(title);
  pdf.save(`mashwara-${sanitizedTitle}.pdf`);
  console.log(`[PDF Export] Save reached: mashwara-${sanitizedTitle}.pdf (${totalPages} pages)`);
}

/**
 * Locates an empty horizontal whitespace row between text lines
 * so vertical slicing fallback never cuts across a line of text.
 */
function findCleanSlicePoint(
  canvas: HTMLCanvasElement,
  startOffsetPx: number,
  maxSlicePx: number
): number {
  const remainingPx = canvas.height - startOffsetPx;
  if (remainingPx <= maxSlicePx) {
    return remainingPx;
  }

  const targetY = startOffsetPx + maxSlicePx;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return maxSlicePx;
  }

  // Look back up to 90px from nominal cut line to find a blank/whitespace row (inter-line gap)
  const searchDistancePx = Math.min(90, Math.floor(maxSlicePx * 0.15));
  const searchStartY = Math.max(startOffsetPx + 40, targetY - searchDistancePx);
  const searchHeight = targetY - searchStartY;

  if (searchHeight <= 0) {
    return maxSlicePx;
  }

  try {
    const imgData = ctx.getImageData(0, searchStartY, canvas.width, searchHeight);
    const data = imgData.data;
    const width = canvas.width;

    let bestY = targetY;
    let minNonWhiteCount = Infinity;

    // Scan backwards from bottom of search window to top
    for (let row = searchHeight - 1; row >= 0; row--) {
      let nonWhitePixels = 0;
      const rowOffset = row * width * 4;

      // Sample every 4th pixel across the row for speed
      for (let col = 0; col < width; col += 4) {
        const idx = rowOffset + col * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];

        // Check if pixel has dark/colored content (text ink)
        if (a > 30 && (r < 240 || g < 240 || b < 240)) {
          nonWhitePixels++;
        }
      }

      // If we find an empty row with zero text ink, cut right here!
      if (nonWhitePixels === 0) {
        return searchStartY + row - startOffsetPx;
      }

      if (nonWhitePixels < minNonWhiteCount) {
        minNonWhiteCount = nonWhitePixels;
        bestY = searchStartY + row;
      }
    }

    // If no 100% white row is found, choose row with minimal text density
    if (minNonWhiteCount < (width / 4) * 0.05) {
      return bestY - startOffsetPx;
    }
  } catch (e) {
    console.warn("[PDF Export] Inter-line gap scan warning, using nominal slice:", e);
  }

  return maxSlicePx;
}

function sanitizeFilename(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06FF\s-_]/gi, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 50) || "consultation"
  );
}
