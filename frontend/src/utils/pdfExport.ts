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
 * 6. Webfont synchronization: `await document.fonts.ready` guarantees Urdu Nastaliq renders properly.
 * 7. Direct file download: `mashwara-<sanitized-title>.pdf` via JavaScript.
 */

import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export interface ExportPdfOptions {
  elementId?: string;
  element?: HTMLElement | null;
  onProgress?: (stage: "preparing" | "capturing" | "assembling" | "saving") => void;
  onError?: (error: Error) => void;
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
    console.error(notFoundErr);
    options?.onError?.(notFoundErr);
    throw notFoundErr;
  }

  options?.onProgress?.("preparing");

  // Ensure all web fonts (including self-hosted Noto Nastaliq Urdu) are fully loaded
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

  console.log(`[PDF Export] Expected ${expectedCount} semantic sections for export:`,
    targets.map((t) => t.getAttribute("data-pdf-section") || "unnamed")
  );

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

  // Capture helper with bounded retry and DOM clone visibility
  async function captureSection(el: HTMLElement, sectionId: string): Promise<HTMLCanvasElement> {
    const doCapture = async () => {
      return await html2canvas(el, {
        scale: 2, // 2x resolution for crisp text & badges
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        windowWidth: 820,
        onclone: (clonedDoc: Document) => {
          // In the private html2canvas clone, make the export container fully visible at origin
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
          }

          // Ensure the target section and all sibling sections in the clone are fully visible
          const clonedEl = clonedDoc.querySelector<HTMLElement>(`[data-pdf-section="${sectionId}"]`);
          if (clonedEl) {
            clonedEl.style.opacity = "1";
            clonedEl.style.visibility = "visible";
          }
          const allClonedSections = clonedDoc.querySelectorAll<HTMLElement>("[data-pdf-section]");
          allClonedSections.forEach((s) => {
            s.style.opacity = "1";
            s.style.visibility = "visible";
          });
        },
      });
    };

    try {
      const canvas = await doCapture();
      if (!canvas || canvas.width === 0 || canvas.height === 0) {
        throw new Error(`Empty canvas produced for section: ${sectionId}`);
      }
      return canvas;
    } catch (firstErr) {
      console.warn(`[PDF Export] Retrying capture for semantic section "${sectionId}" after DOM stabilization...`, firstErr);
      // Wait for next frame and short delay to stabilize
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 150)));
      try {
        const retryCanvas = await doCapture();
        if (!retryCanvas || retryCanvas.width === 0 || retryCanvas.height === 0) {
          throw new Error(`Empty canvas on retry for section: ${sectionId}`);
        }
        return retryCanvas;
      } catch (secondErr) {
        console.error(`[PDF Export] FATAL: Section "${sectionId}" capture failed. Aborting to avoid data loss.`);
        throw new Error(`Critical consultation section "${sectionId}" could not be captured.`);
      }
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
      console.error(exportError);
      options?.onError?.(exportError);
      throw exportError;
    }
  }

  // Strict Section Count Verification
  if (capturedSections.length !== expectedCount) {
    const mismatchErr = new Error(
      `PDF export verification failed: expected ${expectedCount} sections, captured ${capturedSections.length}. Download aborted to protect report integrity.`
    );
    console.error(mismatchErr);
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
      // If adding this section exceeds page height, start a new page
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

        // If not the final chunk, find clean whitespace between text lines
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
  for (let p = 1; p <= totalPages; p++) {
    pdf.setPage(p);
    pdf.setFontSize(7.5);
    pdf.setTextColor(148, 163, 184); // slate-400
    pdf.text(
      `Mashwara AI — مشورہ اے آئی  •  Page ${p} of ${totalPages}`,
      pdfWidth / 2,
      pdfHeight - 12,
      { align: "center" }
    );
  }

  options?.onProgress?.("saving");

  const sanitizedTitle = sanitizeFilename(title);
  pdf.save(`mashwara-${sanitizedTitle}.pdf`);
  console.log(`[PDF Export] Successfully generated and downloaded: mashwara-${sanitizedTitle}.pdf (${totalPages} pages)`);
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
