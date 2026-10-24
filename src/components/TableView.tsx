import React, { useState, useEffect } from "react";
import { 
  Table as TableIcon, 
  Plus, 
  Trash2, 
  Copy, 
  Check, 
  Download, 
  RotateCcw, 
  Search, 
  FileSpreadsheet, 
  ChevronDown, 
  ChevronUp, 
  Sparkles,
  ArrowDown,
  ArrowUp,
  FileText
} from "lucide-react";
import * as XLSX from "xlsx";
import { tableToCsv, tableToTsv, tableToMarkdown } from "../lib/tableUtils";

interface TableViewProps {
  initialData: string[][];
  onDataChange?: (newData: string[][]) => void;
  fileName?: string;
  isEditable?: boolean;
}

export const TableView: React.FC<TableViewProps> = ({
  initialData,
  onDataChange,
  fileName = "tableau_transcrit",
  isEditable = true,
}) => {
  const [data, setData] = useState<string[][]>(() => {
    if (!initialData || initialData.length === 0) {
      return [["En-tête 1", "En-tête 2"], ["Valeur 1", "Valeur 2"]];
    }
    return initialData.map(row => [...row]);
  });

  const [originalData] = useState<string[][]>(() => initialData.map(row => [...row]));
  const [searchTerm, setSearchTerm] = useState("");
  const [copiedFormat, setCopiedFormat] = useState<"tsv" | "markdown" | null>(null);
  const [hasHeaderRow, setHasHeaderRow] = useState(true);

  useEffect(() => {
    if (initialData && initialData.length > 0) {
      setData(initialData.map(row => [...row]));
    }
  }, [initialData]);

  const notifyChange = (updatedData: string[][]) => {
    setData(updatedData);
    if (onDataChange) {
      onDataChange(updatedData);
    }
  };

  // Cell Change
  const handleCellChange = (rowIndex: number, colIndex: number, value: string) => {
    const updated = data.map((row, rIdx) => {
      if (rIdx === rowIndex) {
        const newRow = [...row];
        newRow[colIndex] = value;
        return newRow;
      }
      return row;
    });
    notifyChange(updated);
  };

  // Add Row
  const handleAddRow = (atIndex?: number) => {
    const maxCols = data.length > 0 ? Math.max(...data.map(r => r.length), 1) : 2;
    const newRow = Array(maxCols).fill("");
    const updated = [...data];
    if (typeof atIndex === "number") {
      updated.splice(atIndex + 1, 0, newRow);
    } else {
      updated.push(newRow);
    }
    notifyChange(updated);
  };

  // Delete Row
  const handleDeleteRow = (rowIndex: number) => {
    if (data.length <= 1) {
      alert("Le tableau doit contenir au moins une ligne.");
      return;
    }
    const updated = data.filter((_, idx) => idx !== rowIndex);
    notifyChange(updated);
  };

  // Move Row
  const handleMoveRow = (rowIndex: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? rowIndex - 1 : rowIndex + 1;
    if (targetIndex < 0 || targetIndex >= data.length) return;

    const updated = [...data];
    const [movedRow] = updated.splice(rowIndex, 1);
    updated.splice(targetIndex, 0, movedRow);
    notifyChange(updated);
  };

  // Add Column
  const handleAddColumn = () => {
    const updated = data.map((row, rIdx) => [
      ...row,
      rIdx === 0 && hasHeaderRow ? `Colonne ${row.length + 1}` : ""
    ]);
    notifyChange(updated);
  };

  // Delete Column
  const handleDeleteColumn = (colIndex: number) => {
    const colCount = Math.max(...data.map(r => r.length));
    if (colCount <= 1) {
      alert("Le tableau doit contenir au moins une colonne.");
      return;
    }
    const updated = data.map(row => row.filter((_, cIdx) => cIdx !== colIndex));
    notifyChange(updated);
  };

  // Reset Table
  const handleReset = () => {
    if (confirm("Voulez-vous réinitialiser le tableau avec les données originales extraites par l'IA ?")) {
      const reset = originalData.map(row => [...row]);
      notifyChange(reset);
    }
  };

  // Copy to Clipboard (TSV / Excel-friendly)
  const handleCopyTSV = () => {
    const tsv = tableToTsv(data);
    navigator.clipboard.writeText(tsv);
    setCopiedFormat("tsv");
    setTimeout(() => setCopiedFormat(null), 2500);
  };

  // Copy Markdown
  const handleCopyMarkdown = () => {
    const md = tableToMarkdown(data);
    navigator.clipboard.writeText(md);
    setCopiedFormat("markdown");
    setTimeout(() => setCopiedFormat(null), 2500);
  };

  // Export Excel
  const handleExportExcel = () => {
    try {
      const ws = XLSX.utils.aoa_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Tableau Extrai");
      XLSX.writeFile(wb, `${fileName}.xlsx`);
    } catch (err) {
      console.error("Export Excel error:", err);
      alert("Échec de l'exportation Excel.");
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    try {
      const csvContent = tableToCsv(data);
      const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${fileName}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Export CSV error:", err);
      alert("Échec de l'exportation CSV.");
    }
  };

  // Calculate Column Count
  const columnCount = data.length > 0 ? Math.max(...data.map(r => r.length)) : 0;
  const rowCount = data.length;

  // Search Filter
  const filteredRowIndices = data
    .map((row, idx) => ({ row, idx }))
    .filter(({ row }) => {
      if (!searchTerm.trim()) return true;
      const query = searchTerm.toLowerCase();
      return row.some(cell => String(cell || "").toLowerCase().includes(query));
    })
    .map(({ idx }) => idx);

  // Helper for column letters (A, B, C...)
  const getColLetter = (index: number) => {
    let letter = "";
    while (index >= 0) {
      letter = String.fromCharCode((index % 26) + 65) + letter;
      index = Math.floor(index / 26) - 1;
    }
    return letter;
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-900/60 dark:bg-slate-900/80 rounded-2xl border border-teal-500/20 shadow-2xl overflow-hidden backdrop-blur-md">
      {/* Header Bar */}
      <div className="px-5 py-3.5 bg-black/40 border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-teal-500/10 text-teal-400 rounded-xl border border-teal-500/20">
            <TableIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-wide">Vue Tableau Interactif</h3>
              <span className="px-2 py-0.5 bg-teal-500/20 text-teal-300 text-[10px] font-semibold rounded-full border border-teal-500/30 flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Détecté par l'IA
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {rowCount} ligne{rowCount > 1 ? "s" : ""} × {columnCount} colonne{columnCount > 1 ? "s" : ""} • Cliquez sur une cellule pour l'éditer directement
            </p>
          </div>
        </div>

        {/* Toolbar Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* Search Field */}
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-black/50 border border-white/10 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-teal-500/50 w-28 sm:w-36 transition-all"
            />
          </div>

          {/* Add Row Button */}
          {isEditable && (
            <button
              onClick={() => handleAddRow()}
              className="px-3 py-1.5 bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/30 rounded-xl font-medium flex items-center gap-1.5 transition-all"
              title="Ajouter une ligne au tableau"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Ligne</span>
            </button>
          )}

          {/* Add Column Button */}
          {isEditable && (
            <button
              onClick={handleAddColumn}
              className="px-3 py-1.5 bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/30 rounded-xl font-medium flex items-center gap-1.5 transition-all"
              title="Ajouter une colonne au tableau"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Colonne</span>
            </button>
          )}

          {/* Copy TSV Button */}
          <button
            onClick={handleCopyTSV}
            className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 rounded-xl font-medium flex items-center gap-1.5 transition-all"
            title="Copier pour coller directement dans Excel ou Google Sheets"
          >
            {copiedFormat === "tsv" ? (
              <>
                <Check className="w-3.5 h-3.5 text-teal-400" />
                <span className="text-teal-400 font-bold">Copié Excel</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copier</span>
              </>
            )}
          </button>

          {/* Export Excel Button */}
          <button
            onClick={handleExportExcel}
            className="px-3.5 py-1.5 bg-teal-500 hover:bg-teal-400 text-black font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-teal-500/20"
            title="Télécharger au format Microsoft Excel (.xlsx)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Excel (.xlsx)</span>
          </button>

          {/* Export CSV */}
          <button
            onClick={handleExportCSV}
            className="p-1.5 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 rounded-xl transition-all"
            title="Exporter au format CSV"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          {/* Reset Button */}
          {isEditable && (
            <button
              onClick={handleReset}
              className="p-1.5 bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-300 border border-white/10 hover:border-red-500/30 rounded-xl transition-all"
              title="Réinitialiser aux valeurs d'origine de l'IA"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Table Container */}
      <div className="flex-1 overflow-auto p-4 no-scrollbar">
        <div className="min-w-full inline-block align-middle">
          <div className="overflow-hidden border border-white/10 rounded-xl shadow-inner">
            <table className="min-w-full divide-y divide-white/10 text-xs border-collapse">
              {/* Table Column Headers (A, B, C...) */}
              <thead className="bg-slate-950/80 text-slate-300 font-mono text-[11px] select-none">
                <tr>
                  {/* Row Number Column Header */}
                  <th className="w-10 px-2 py-2 text-center text-slate-500 border-r border-white/10 font-normal">
                    #
                  </th>

                  {/* Column Letter & Column Delete Headers */}
                  {Array.from({ length: columnCount }).map((_, colIdx) => (
                    <th
                      key={colIdx}
                      className="px-3 py-2 text-left font-semibold border-r border-white/10 min-w-[120px] max-w-[280px] bg-slate-900/60"
                    >
                      <div className="flex items-center justify-between gap-1 group">
                        <span className="text-teal-400 font-mono text-[10px] tracking-wider uppercase">
                          {getColLetter(colIdx)}
                        </span>
                        {isEditable && columnCount > 1 && (
                          <button
                            onClick={() => handleDeleteColumn(colIdx)}
                            className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-red-400 transition-opacity rounded hover:bg-red-500/10"
                            title={`Supprimer la colonne ${getColLetter(colIdx)}`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </th>
                  ))}

                  {/* Actions Column Header */}
                  {isEditable && (
                    <th className="w-16 px-2 py-2 text-center text-slate-500 font-normal">
                      Actions
                    </th>
                  )}
                </tr>
              </thead>

              {/* Table Body */}
              <tbody className="divide-y divide-white/5 bg-black/20 text-slate-200">
                {filteredRowIndices.length === 0 ? (
                  <tr>
                    <td
                      colSpan={columnCount + (isEditable ? 2 : 1)}
                      className="px-6 py-10 text-center text-slate-400 italic text-xs"
                    >
                      Aucune ligne ne correspond à votre recherche "{searchTerm}".
                    </td>
                  </tr>
                ) : (
                  filteredRowIndices.map((rowIndex) => {
                    const row = data[rowIndex] || [];
                    const isHeader = rowIndex === 0 && hasHeaderRow;

                    return (
                      <tr
                        key={rowIndex}
                        className={`transition-colors hover:bg-teal-500/5 ${
                          isHeader ? "bg-teal-950/30 font-semibold text-white" : ""
                        }`}
                      >
                        {/* Row Index Number */}
                        <td className="w-10 px-2 py-2 text-center text-slate-500 font-mono text-[10px] border-r border-white/10 select-none bg-slate-950/40">
                          {rowIndex + 1}
                        </td>

                        {/* Cell Inputs */}
                        {Array.from({ length: columnCount }).map((_, colIdx) => {
                          const cellValue = row[colIdx] ?? "";

                          return (
                            <td
                              key={colIdx}
                              className={`px-1 py-1 border-r border-white/10 ${
                                isHeader ? "border-b border-teal-500/20 bg-teal-500/5" : ""
                              }`}
                            >
                              {isEditable ? (
                                <input
                                  type="text"
                                  value={cellValue}
                                  onChange={(e) =>
                                    handleCellChange(rowIndex, colIdx, e.target.value)
                                  }
                                  className={`w-full px-2.5 py-1.5 bg-transparent rounded-lg text-xs leading-relaxed outline-none transition-all placeholder:text-slate-600 focus:bg-slate-900 focus:border focus:border-teal-500/80 focus:ring-1 focus:ring-teal-500/50 ${
                                    isHeader
                                      ? "font-bold text-teal-300"
                                      : "text-slate-200"
                                  }`}
                                  placeholder={`Cellule ${getColLetter(colIdx)}${rowIndex + 1}`}
                                />
                              ) : (
                                <div
                                  className={`px-2.5 py-1.5 text-xs ${
                                    isHeader ? "font-bold text-teal-300" : "text-slate-200"
                                  }`}
                                >
                                  {cellValue || "—"}
                                </div>
                              )}
                            </td>
                          );
                        })}

                        {/* Row Action Controls */}
                        {isEditable && (
                          <td className="w-16 px-2 py-1 text-center bg-slate-950/20">
                            <div className="flex items-center justify-center gap-1">
                              {/* Move Row Up */}
                              {rowIndex > 0 && (
                                <button
                                  onClick={() => handleMoveRow(rowIndex, "up")}
                                  className="p-1 text-slate-500 hover:text-white rounded hover:bg-white/10 transition-colors"
                                  title="Monter la ligne"
                                >
                                  <ArrowUp className="w-3 h-3" />
                                </button>
                              )}

                              {/* Move Row Down */}
                              {rowIndex < data.length - 1 && (
                                <button
                                  onClick={() => handleMoveRow(rowIndex, "down")}
                                  className="p-1 text-slate-500 hover:text-white rounded hover:bg-white/10 transition-colors"
                                  title="Descendre la ligne"
                                >
                                  <ArrowDown className="w-3 h-3" />
                                </button>
                              )}

                              {/* Delete Row */}
                              <button
                                onClick={() => handleDeleteRow(rowIndex)}
                                className="p-1 text-slate-500 hover:text-red-400 rounded hover:bg-red-500/10 transition-colors"
                                title="Supprimer cette ligne"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Footer Info & Quick Controls */}
      <div className="px-5 py-2.5 bg-black/40 border-t border-white/10 flex flex-wrap items-center justify-between text-[11px] text-slate-400 gap-2">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1.5 cursor-pointer select-none hover:text-slate-200">
            <input
              type="checkbox"
              checked={hasHeaderRow}
              onChange={(e) => setHasHeaderRow(e.target.checked)}
              className="accent-teal-500 rounded border-white/20 bg-slate-800"
            />
            <span>Première ligne en en-tête</span>
          </label>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleCopyMarkdown}
            className="hover:text-teal-300 flex items-center gap-1 transition-colors"
            title="Copier au format tableau Markdown"
          >
            <FileText className="w-3 h-3" />
            <span>Format Markdown</span>
          </button>
          <span>•</span>
          <span className="text-slate-500">
            Modifications sauvegardées automatiquement
          </span>
        </div>
      </div>
    </div>
  );
};

export default TableView;
