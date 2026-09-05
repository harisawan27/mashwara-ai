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
 *    while html2canvas-pro's internal clone is made visible at normal coordinates for 100% accurate layout.
 * 6. Modern CSS Color Compatibility: Uses html2canvas-pro with native CSS Color Module Level 4
 *    support (oklab, oklch, lab, lch, color-mix, variables) without fragile color sanitizers.
 * 7. Direct file download: `mashwara-<sanitized-title>.pdf` via JavaScript.
 */

import jsPDF from "jspdf";
import html2canvas from "html2canvas-pro";

export interface ExportPdfOptions {
  elementId?: string;
  element?: HTMLElement | null;
  onProgress?: (stage: "preparing" | "capturing" | "assembling" | "saving") => void;
  onError?: (error: Error) => void;
}

/**
 * Prepares the cloned document for html2canvas-pro:
 * - Makes the export container fully visible at origin within the isolated clone
 * - Ensures sections are visible
 * - Disables transitions and animations for instant static rasterization
 * Note: Modern CSS colors (oklab, oklch, color-mix) are natively parsed by html2canvas-pro.
 */
function prepareClonedDom(clonedDoc: Document, targetContainerId: string, sectionId: string) {
  // 1. Position and display the export container at normal origin coordinates inside the clone
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

  // 3. Disable animations and transitions for instant static rasterization
  const allCloned = clonedDoc.querySelectorAll<HTMLElement>("*");
  allCloned.forEach((node) => {
    node.style.animation = "none";
    node.style.transition = "none";
  });
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

  // Capture helper with single bounded retry and clean onclone preparation
  async function captureSection(el: HTMLElement, sectionId: string): Promise<HTMLCanvasElement> {
    const rect = el.getBoundingClientRect();
    const width = Math.ceil(rect.width || 820);
    const height = Math.ceil(rect.height || 400);
    console.log(`[PDF Export] Capturing section "${sectionId}" (${width}x${height})...`);

    const doPrimaryCapture = async () => {
      return await html2canvas(el, {
        scale: 2, // 2x resolution for crisp text & badges
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        windowWidth: 820,
        onclone: (clonedDoc: Document) => {
          prepareClonedDom(clonedDoc, targetContainerId, sectionId);
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

      console.warn(`[PDF Export] Retrying section capture for "${sectionId}"...`);
      try {
        const retryCanvas = await doPrimaryCapture();
        if (retryCanvas && retryCanvas.width > 0 && retryCanvas.height > 0) {
          return retryCanvas;
        }
      } catch (retryErr: any) {
        console.error(`[PDF Export] Retry failure for "${sectionId}": ${retryErr.message || retryErr}`);
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
      console.log(`[PDF Export] Captured "${sectionId}" (${i + 1}/${targets.length})`);
    } catch (err: any) {
      const exportError = new Error(`PDF export failed at section "${sectionId}": ${err.message || err}`);
      console.error("[PDF Export] Section capture error:", exportError);
      console.error(`[PDF Export] Save not reached: export aborted due to capture failure on section "${sectionId}"`);
      options?.onError?.(exportError);
      throw exportError;
    }
  }

  console.log(`[PDF Export] Captured all ${capturedSections.length}/${expectedCount} sections`);

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
  console.log("[PDF Export] Assembling PDF...");

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
  console.log("[PDF Export] Saving PDF...");

  const sanitizedTitle = sanitizeFilename(title);
  pdf.save(`mashwara-${sanitizedTitle}.pdf`);
  console.log(`[PDF Export] Successfully generated mashwara-${sanitizedTitle}.pdf (${totalPages} pages)`);
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
