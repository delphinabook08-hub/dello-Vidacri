/**
 * Utility functions for OCR text sanitization, paragraph reconstruction, 
 * and line-break unwrapping.
 */

/**
 * Comprehensive automatic formatting and punctuation correction engine.
 * Handles spoken punctuation conversion (e.g., "point", "virgule", "à la ligne"),
 * fixes punctuation spacing, repairs missing terminal punctuation, capitalizes sentence beginnings,
 * and formats clean, airy paragraphs.
 */
export function autoFormatAndPunctuateText(rawText: string, language: string = "French"): string {
  if (!rawText || typeof rawText !== "string") return "";

  let text = rawText.trim();
  if (!text) return "";

  // 1. Convert spoken punctuation commands into real punctuation marks (case-insensitive)
  // French dictation keywords
  text = text
    .replace(/\b(point à la ligne|point a la ligne)\b/gi, ".\n\n")
    .replace(/\b(nouveau paragraphe|nouveau bloc)\b/gi, "\n\n")
    .replace(/\b(à la ligne|a la ligne|nouvelle ligne)\b/gi, "\n\n")
    .replace(/\b(point d'interrogation|point d interrogation)\b/gi, "? ")
    .replace(/\b(point d'exclamation|point d exclamation)\b/gi, "! ")
    .replace(/\b(points de suspension|trois points)\b/gi, "... ")
    .replace(/\b(point virgule|point-virgule)\b/gi, "; ")
    .replace(/\b(deux points|deux-points)\b/gi, ": ")
    .replace(/\b(ouvrez les guillemets|ouvrir les guillemets|entre guillemets)\b/gi, ' "')
    .replace(/\b(fermez les guillemets|fermer les guillemets)\b/gi, '" ')
    .replace(/\b(ouvrez les parenthèses|ouvrir la parenthèse|ouvrez la parenthèse)\b/gi, " (")
    .replace(/\b(fermez les parenthèses|fermer la parenthèse|fermez la parenthèse)\b/gi, ") ")
    .replace(/\b(tiret du milieu|tiret du six)\b/gi, " - ")
    // Isolated spoken punctuation words
    .replace(/\s+\bvirgule\b\s*/gi, ", ")
    .replace(/\s+\bpoint\b\s*/gi, ". ")
    .replace(/\s+\bpoint\b$/gi, ".");

  // English dictation keywords (if English or mixed)
  text = text
    .replace(/\b(period|full stop)\b/gi, ". ")
    .replace(/\b(comma)\b/gi, ", ")
    .replace(/\b(question mark)\b/gi, "? ")
    .replace(/\b(exclamation mark|exclamation point)\b/gi, "! ")
    .replace(/\b(semicolon)\b/gi, "; ")
    .replace(/\b(colon)\b/gi, ": ")
    .replace(/\b(new line|new paragraph)\b/gi, "\n\n");

  // 2. Clean multiple duplicate punctuation marks (e.g., ",," -> ",", ".." -> "." unless "...")
  text = text
    .replace(/,{2,}/g, ",")
    .replace(/(?<!\.)\.\.(?!\.)/g, ".")
    .replace(/\?{2,}/g, "?")
    .replace(/!{2,}/g, "!")
    .replace(/;{2,}/g, ";")
    .replace(/:{2,}/g, ":");

  // 3. Fix spacing before and after punctuation
  // Remove space BEFORE comma, period, closing bracket/paren/quote
  text = text
    .replace(/\s+([,\.\)\]\}])/g, "$1")
    // Ensure standard space AFTER comma, period, question mark, exclamation, semicolon, colon
    .replace(/([,\.\?!;:](?!\d))([^\s\d\n\r"'\)\]\}])/g, "$1 $2")
    // Remove multiple spaces
    .replace(/[ \t]{2,}/g, " ");

  // 4. Split into paragraphs and format capitalizations and endings
  const paragraphs = text.split(/\n\s*\n+/);
  const formattedParagraphs = paragraphs.map(p => {
    let para = p.trim();
    if (!para) return "";

    // Capitalize the first letter of the paragraph
    para = para.charAt(0).toUpperCase() + para.slice(1);

    // Capitalize first letter after terminal punctuation (. ! ? ...)
    para = para.replace(/([.!?…]\s+)([a-zà-öø-ÿ])/g, (_, punc, letter) => punc + letter.toUpperCase());

    // Capitalize first letter inside dialogs or after quotes
    para = para.replace(/(["'«]\s*)([a-zà-öø-ÿ])/g, (_, quote, letter) => quote + letter.toUpperCase());

    // Automatic ending punctuation: if the paragraph does not end with punctuation, add a period
    if (!/[.!?…:;\-"'»\)]$/.test(para)) {
      para += ".";
    }

    return para;
  });

  let result = formattedParagraphs.filter(Boolean).join("\n\n");

  // 5. Ensure paragraph unwrapping doesn't break list items
  result = unwrapLinesExceptParagraphs(result);

  return result.trim();
}

/**
 * Removes artificial line breaks (caused by physical page margins or handwriting wraps)
 * while strictly preserving true paragraphs, headers, list items, and markdown tables.
 */
export function unwrapLinesExceptParagraphs(text: string): string {
  if (!text || typeof text !== "string") return "";

  // Normalize line endings to \n
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // First split by double or more newlines to identify explicit paragraph blocks
  const rawBlocks = normalized.split(/\n\s*\n+/);

  const processedBlocks: string[] = [];

  for (const block of rawBlocks) {
    const trimmedBlock = block.trim();
    if (!trimmedBlock) continue;

    // If block is a page marker like "[--- Page 1 ---]", keep as is
    if (/^\[---\s*Page\s*\d+\s*---\]$/i.test(trimmedBlock)) {
      processedBlocks.push(trimmedBlock);
      continue;
    }

    const lines = trimmedBlock.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    // 1. If block is a markdown table (contains | lines), preserve line structure
    if (lines.some(l => l.startsWith("|") && l.endsWith("|"))) {
      processedBlocks.push(lines.join("\n"));
      continue;
    }

    // 2. Process lines intelligently: reconstruct paragraphs
    const paragraphs: string[] = [];
    let currentParagraph = "";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check if line is a header or title
      const isHeader = /^#{1,6}\s+/i.test(line) || 
                       /^(CHAPITRE|SECTION|ARTICLE|TITRE|PARTIE|NOTE|ANNEXE|RAPPORT|RÉSUMÉ|PROCES-VERBAL|PV)\b/i.test(line);

      // Check if line is a list item (bullet or numbered)
      const isListItem = /^\s*([-*•+–—]|\d+[\.)]|[a-zA-Z][\.)])\s+/i.test(line);

      if (isHeader || isListItem) {
        if (currentParagraph) {
          paragraphs.push(currentParagraph.trim());
          currentParagraph = "";
        }
        paragraphs.push(line);
        continue;
      }

      if (!currentParagraph) {
        currentParagraph = line;
      } else {
        // Check if previous line ended with a hyphen (split word across margins)
        if (currentParagraph.endsWith("-") && !currentParagraph.endsWith(" -") && !currentParagraph.endsWith("--")) {
          currentParagraph = currentParagraph.slice(0, -1) + line;
        } else {
          // Check if previous line ended with terminal punctuation followed by a strong paragraph start
          const prevEndsWithTerminal = /[.?!:]\s*$/.test(currentParagraph);
          const nextStartsWithCapital = /^[A-ZÀ-ÖØ-ß0-9]/.test(line);
          const isShortPreviousLine = currentParagraph.length < 40;

          // If previous ended with terminal punctuation AND was short (likely title or intentional end of paragraph)
          if (prevEndsWithTerminal && (isShortPreviousLine || (prevEndsWithTerminal && nextStartsWithCapital && lines.length > 4))) {
            paragraphs.push(currentParagraph.trim());
            currentParagraph = line;
          } else {
            // Join seamlessly with a space
            currentParagraph += " " + line;
          }
        }
      }
    }

    if (currentParagraph) {
      paragraphs.push(currentParagraph.trim());
    }

    // Clean up spaces in each generated paragraph
    const cleanedParagraphs = paragraphs.map(p => {
      // Reconnect any remaining intra-word hyphenations
      return p
        .replace(/([a-zA-ZÀ-ÿ])- ([a-zA-ZÀ-ÿ])/g, "$1$2")
        .replace(/[ \t]+/g, " ")
        .trim();
    });

    processedBlocks.push(cleanedParagraphs.filter(Boolean).join("\n\n"));
  }

  return processedBlocks.filter(b => b.length > 0).join("\n\n");
}
