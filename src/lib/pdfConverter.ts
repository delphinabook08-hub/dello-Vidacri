import * as pdfjsLib from "pdfjs-dist";
// @ts-ignore
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.js?url";
import heic2any from "heic2any";

// Configure pdfjs worker to process PDF files client-side with multi-stage fallback
if (typeof window !== "undefined") {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl || `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
  } catch (_) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`;
  }
}

/**
 * Converts a PDF File object into an array of high-resolution JPEG Data URLs (one per page).
 */
export async function convertPdfToImageDataUrls(file: File): Promise<string[]> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    
    // Configure loading task with standard cMap for foreign characters & fallback
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
      cMapPacked: true,
    });
    
    const pdf = await loadingTask.promise;
    const pageImageUrls: string[] = [];

    // Limit max pages per PDF document to 20 for optimal performance & Gemini context
    const totalPages = Math.min(pdf.numPages, 20);

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const page = await pdf.getPage(pageNum);

      // Render at 2.0x scale for high resolution OCR & handwriting recognition
      const viewport = page.getViewport({ scale: 2.0 });

      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      const ctx = canvas.getContext("2d");
      if (ctx) {
        const renderContext = {
          canvasContext: ctx,
          viewport: viewport,
        };
        await page.render(renderContext).promise;

        const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
        pageImageUrls.push(dataUrl);
      }
    }

    if (pageImageUrls.length === 0) {
      throw new Error("Aucune page n'a pu être extraite de ce fichier PDF.");
    }

    return pageImageUrls;
  } catch (error: any) {
    console.error("PDF page rendering error:", error);
    throw new Error(error.message || "Impossible de lire le fichier PDF. Veuillez vérifier qu'il ne soit pas protégé par un mot de passe.");
  }
}

/**
 * Extracts text content from Word (.docx, .doc), RTF, or plain text files.
 */
async function extractTextFromFile(file: File): Promise<string> {
  const fileName = file.name.toLowerCase();

  if (fileName.endsWith(".docx")) {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const decoder = new TextDecoder("utf-8", { fatal: false });
      const content = decoder.decode(arrayBuffer);
      const matches = content.match(/<w:t[^>]*>(.*?)<\/w:t>/g);
      if (matches && matches.length > 0) {
        const textParts = matches.map(m =>
          m.replace(/<[^>]+>/g, "")
           .replace(/&lt;/g, "<")
           .replace(/&gt;/g, ">")
           .replace(/&amp;/g, "&")
           .replace(/&quot;/g, '"')
           .replace(/&apos;/g, "'")
        );
        const joined = textParts.join(" ");
        if (joined.trim().length > 5) {
          return joined;
        }
      }
    } catch (e) {
      console.warn("Failed docx XML extraction, trying raw text:", e);
    }
  }

  try {
    const rawText = await file.text();
    if (fileName.endsWith(".doc")) {
      const cleaned = rawText.replace(/[^\x20-\x7E\xA0-\xFF\n\r\t]/g, " ").replace(/\s+/g, " ");
      if (cleaned.trim().length > 5) return cleaned;
    }
    return rawText;
  } catch (err) {
    console.warn("File text read error:", err);
    return "";
  }
}

/**
 * Converts text file or extracted Word document content to clean image pages (multi-page support)
 */
function convertTextToImagePages(text: string): string[] {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 1600;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];

  const pages: string[] = [];
  const margin = 80;
  const maxWidth = canvas.width - margin * 2;
  const lineHeight = 38;
  const maxLinesPerPage = Math.floor((canvas.height - margin * 2) / lineHeight);

  const rawLines = text.split(/\r?\n/);
  const wrappedLines: string[] = [];

  ctx.font = "24px sans-serif";

  for (const line of rawLines) {
    if (!line.trim()) {
      wrappedLines.push("");
      continue;
    }
    const words = line.split(" ");
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && currentLine) {
        wrappedLines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      wrappedLines.push(currentLine);
    }
  }

  for (let i = 0; i < wrappedLines.length; i += maxLinesPerPage) {
    const pageLines = wrappedLines.slice(i, i + maxLinesPerPage);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#111827";
    ctx.font = "24px sans-serif";

    let y = margin + 20;
    for (const l of pageLines) {
      if (l) {
        ctx.fillText(l, margin, y);
      }
      y += lineHeight;
    }

    pages.push(canvas.toDataURL("image/jpeg", 0.88));
  }

  return pages.length > 0 ? pages : [canvas.toDataURL("image/jpeg", 0.88)];
}

/**
 * Safely converts an image File (JPEG, PNG, WEBP, HEIC, HEIF, etc.) to a high-resolution JPEG Data URL
 */
async function normalizeImageFileToJpegDataUrl(file: File): Promise<string> {
  let fileToProcess: Blob = file;
  const fileName = file.name.toLowerCase();
  const isHeic = file.type === "image/heic" || file.type === "image/heif" || fileName.endsWith(".heic") || fileName.endsWith(".heif");

  if (isHeic) {
    try {
      const converted = await heic2any({
        blob: file,
        toType: "image/jpeg",
        quality: 0.85,
      });
      fileToProcess = Array.isArray(converted) ? converted[0] : converted;
    } catch (e) {
      console.warn("heic2any conversion skipped or failed, using raw fallback:", e);
    }
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Format de fichier d'image illisible."));
        return;
      }

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          let width = img.width;
          let height = img.height;

          // Max dimension 1800px for optimal speed and high resolution OCR
          const maxDim = 1800;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve(result);
            return;
          }

          // White background (handles transparent PNGs)
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.88);
          resolve(jpegDataUrl);
        } catch (err) {
          resolve(result); // Fallback to raw data url
        }
      };

      img.onerror = () => {
        // Fallback to raw reader result if Image constructor fails
        resolve(result);
      };

      img.src = result;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(fileToProcess);
  });
}

/**
 * Processes an array of uploaded files (PDFs, Images, or Text) and returns image data URLs ready for OCR / Scan.
 */
export async function processUploadedDocumentFiles(files: File[]): Promise<string[]> {
  const imageResults: string[] = [];
  const errors: string[] = [];

  for (const file of files) {
    const fileName = file.name.toLowerCase();
    const isPdf = file.type === "application/pdf" || fileName.endsWith(".pdf");
    const isTextOrDoc = 
      file.type.startsWith("text/") || 
      fileName.endsWith(".txt") || 
      fileName.endsWith(".md") || 
      fileName.endsWith(".csv") ||
      fileName.endsWith(".rtf") ||
      fileName.endsWith(".doc") ||
      fileName.endsWith(".docx");

    if (isPdf) {
      try {
        const pdfImages = await convertPdfToImageDataUrls(file);
        imageResults.push(...pdfImages);
      } catch (err: any) {
        console.error("Failed to convert PDF:", file.name, err);
        errors.push(`Erreur PDF (${file.name}): ${err.message || "Fichier invalide"}`);
      }
    } else if (isTextOrDoc) {
      try {
        const text = await extractTextFromFile(file);
        if (text && text.trim()) {
          const imgUrls = convertTextToImagePages(text);
          if (imgUrls && imgUrls.length > 0) {
            imageResults.push(...imgUrls);
          }
        }
      } catch (err: any) {
        console.error("Failed to read text/doc file:", file.name, err);
        errors.push(`Erreur Document (${file.name}): ${err.message || "Impossible de lire le document"}`);
      }
    } else {
      // Regular image file (JPEG, PNG, WEBP, HEIC, GIF, BMP, etc.)
      try {
        const jpegDataUrl = await normalizeImageFileToJpegDataUrl(file);
        if (jpegDataUrl) {
          imageResults.push(jpegDataUrl);
        }
      } catch (err: any) {
        console.error("Failed to process image file:", file.name, err);
        errors.push(`Impossible de lire l'image: ${file.name}`);
      }
    }
  }

  if (imageResults.length === 0 && errors.length > 0) {
    throw new Error(errors.join(" | "));
  }

  return imageResults;
}
