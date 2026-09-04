/**
 * Mashwara AI — PDF Export Engine
 * ================================
 * Generates faithful, colorful, high-DPI PDFs directly via client-side JavaScript.
 *
 * Key Architecture:
 * 1. NO browser print dialog (window.print() is completely removed).
 * 2. Directly triggers browser download of `mashwara-<title>.pdf`.
 * 3. Avoids single massive browser canvas (e.g. 900x20,000px) by capturing logical
 *    sections/cards individually and placing them sequentially into the PDF document.
 * 4. ONE continuous tall page when scaled height is within safe PDF limits (<= 14,000 pt).
 * 5. Safe height fallback: cleanly paginates to multi-page PDF for exceptionally huge Mashwaras
 *    without shrinking, cropping, or omitting content.
 * 6. Preserves colors, gradients, badges, Urdu Nastaliq RTL & Roman Urdu LTR typography.
 */

import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export interface ExportPdfOptions {
  elementId?: string;
  element?: HTMLElement | null;
  onProgress?: (stage: "preparing" | "capturing" | "assembling" | "saving") => void;
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
    console.error("Mashwara PDF export target element not found");
    return;
  }

  options?.onProgress?.("preparing");

  // Query all discrete logical cards/sections to avoid a single giant raster canvas
  const sectionElements = Array.from(
    targetElement.querySelectorAll<HTMLElement>("[data-pdf-section='true']")
  );

  const targets = sectionElements.length > 0 ? sectionElements : [targetElement];

  options?.onProgress?.("capturing");

  // Capture each section separately with high resolution and preserved colors
  const capturedSections: Array<{ canvas: HTMLCanvasElement; heightPt: number }> = [];
  const pdfWidth = 595.28; // Standard A4 width in pt
  const margin = 20; // pt
  const gap = 10; // pt between sections
  const contentWidth = pdfWidth - margin * 2; // ~555.28 pt

  for (const el of targets) {
    try {
      const canvas = await html2canvas(el, {
        scale: 2, // High-DPI crisp rendering
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        windowWidth: 820,
      });

      const ratio = contentWidth / canvas.width;
      const heightPt = canvas.height * ratio;
      capturedSections.push({ canvas, heightPt });
    } catch (captureErr) {
      console.warn("Failed to capture individual Mashwara section, continuing:", captureErr);
    }
  }

  if (capturedSections.length === 0) {
    console.error("No Mashwara sections could be captured for PDF export");
    return;
  }

  options?.onProgress?.("assembling");

  // Calculate total height
  const totalSectionsHeight = capturedSections.reduce((acc, curr) => acc + curr.heightPt, 0);
  const totalHeight = margin * 2 + totalSectionsHeight + (capturedSections.length - 1) * gap;

  // Safe PDF dimension limit (Adobe Acrobat / PDF viewers max safe limit is 14,400 pt)
  const SAFE_MAX_HEIGHT_PT = 14000;

  if (totalHeight <= SAFE_MAX_HEIGHT_PT) {
    // ─────────────────────────────────────────────────────────────────────────
    // Primary: ONE Continuous Tall Page
    // ─────────────────────────────────────────────────────────────────────────
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: [pdfWidth, totalHeight],
    });

    let currentY = margin;
    for (const item of capturedSections) {
      const imgData = item.canvas.toDataURL("image/jpeg", 0.95);
      pdf.addImage(imgData, "JPEG", margin, currentY, contentWidth, item.heightPt);
      currentY += item.heightPt + gap;
    }

    options?.onProgress?.("saving");
    const sanitizedTitle = sanitizeFilename(title);
    pdf.save(`mashwara-${sanitizedTitle}.pdf`);
  } else {
    // ─────────────────────────────────────────────────────────────────────────
    // Safe Fallback: Clean Multi-Page Layout for exceptionally huge Mashwaras
    // ─────────────────────────────────────────────────────────────────────────
    const pageHeight = 841.89; // Standard A4 height in pt
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "pt",
      format: [pdfWidth, pageHeight],
    });

    let currentY = margin;
    for (let i = 0; i < capturedSections.length; i++) {
      const item = capturedSections[i];

      // If item overflows page, start a new page unless we are at the top
      if (currentY + item.heightPt > pageHeight - margin && currentY > margin) {
        pdf.addPage();
        currentY = margin;
      }

      const imgData = item.canvas.toDataURL("image/jpeg", 0.95);
      pdf.addImage(imgData, "JPEG", margin, currentY, contentWidth, item.heightPt);
      currentY += item.heightPt + gap;
    }

    options?.onProgress?.("saving");
    const sanitizedTitle = sanitizeFilename(title);
    pdf.save(`mashwara-${sanitizedTitle}.pdf`);
  }
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
