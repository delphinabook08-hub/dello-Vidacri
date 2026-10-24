/**
 * Utility functions for table parsing, conversion, and formatting.
 */

/**
 * Parses markdown table formatted text into a 2D array of string cells.
 * Example input:
 * | Header 1 | Header 2 |
 * | --- | --- |
 * | Cell 1 | Cell 2 |
 */
export function parseMarkdownTable(text: string): string[][] | null {
  if (!text) return null;

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const tableRows: string[][] = [];

  for (const line of lines) {
    // Check if line looks like a markdown table row (starts and ends with | or contains multiple |)
    if (line.includes("|")) {
      // Ignore divider rows like |---|---| or | :--- | ---: |
      if (/^\|?\s*:?-+:?\s*(\|?\s*:?-+:?\s*)+\|?$/.test(line)) {
        continue;
      }

      // Split by pipe and remove empty leading/trailing items
      let cells = line.split("|").map(cell => cell.trim());
      
      // If the row started with '|', the first item is empty
      if (line.startsWith("|") && cells.length > 0 && cells[0] === "") {
        cells.shift();
      }
      // If the row ended with '|', the last item is empty
      if (line.endsWith("|") && cells.length > 0 && cells[cells.length - 1] === "") {
        cells.pop();
      }

      if (cells.length > 0) {
        tableRows.push(cells);
      }
    }
  }

  return tableRows.length > 0 ? tableRows : null;
}

/**
 * Converts a 2D array table representation back to a formatted markdown table string.
 */
export function tableToMarkdown(data: string[][]): string {
  if (!data || data.length === 0) return "";

  const colCount = Math.max(...data.map(row => row.length));
  if (colCount === 0) return "";

  // Normalize row lengths
  const normalized = data.map(row => {
    const r = [...row];
    while (r.length < colCount) r.push("");
    return r;
  });

  const header = normalized[0];
  const headerLine = `| ${header.map(c => c || " ").join(" | ")} |`;
  const dividerLine = `| ${header.map(() => "---").join(" | ")} |`;
  const bodyLines = normalized.slice(1).map(row => `| ${row.map(c => c || " ").join(" | ")} |`);

  return [headerLine, dividerLine, ...bodyLines].join("\n");
}

/**
 * Converts a 2D array to CSV format.
 */
export function tableToCsv(data: string[][]): string {
  if (!data || data.length === 0) return "";

  return data
    .map(row =>
      row
        .map(cell => {
          const str = String(cell || "");
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(",")
    )
    .join("\n");
}

/**
 * Converts a 2D array to TSV (Tab-Separated Values) format for clipboard copy.
 */
export function tableToTsv(data: string[][]): string {
  if (!data || data.length === 0) return "";

  return data
    .map(row => row.map(cell => String(cell || "").replace(/\t/g, " ")).join("\t"))
    .join("\n");
}
