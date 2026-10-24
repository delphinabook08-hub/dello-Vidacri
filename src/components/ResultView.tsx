import React, { useState, useRef } from "react";
import { 
  Check, Copy, Edit2, Save, FileText, Table as TableIcon, 
  Share2, RotateCcw, Trash2, X, Download, Sparkles, Undo2,
  Send, Mail, MessageSquare, Printer, CheckCircle2, ExternalLink,
  Languages, Volume2, VolumeX, Play, Pause, Square, BookOpen,
  ListChecks, ArrowRight, ArrowLeft, RefreshCw, Layers,
  AlignLeft, AlignCenter, AlignJustify, Type, SlidersHorizontal,
  WrapText, Palette, Bold, Baseline, Eye, FileSpreadsheet
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import confetti from "canvas-confetti";
import { TranscriptionResult } from "../lib/gemini";
import { sanitizeAndFixAlurConjugation } from "../lib/alurConjugation";
import { unwrapLinesExceptParagraphs } from "../lib/textUtils";
import { Document, Packer, Paragraph, TextRun, PageBreak } from "docx";
import { saveAs } from "file-saver";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import TableView from "./TableView";
import { parseMarkdownTable, tableToCsv } from "../lib/tableUtils";
import { getTranslations } from "../lib/translations";

interface ResultViewProps {
  images: string[];
  result: TranscriptionResult;
  onReset: () => void;
  activeTab?: "ocr" | "voice";
  selectedLanguage?: string;
  theme?: "dark" | "light";
}

async function safeJsonFetch<T = any>(response: Response, defaultErrorMsg: string): Promise<T> {
  const text = await response.text().catch(() => "");
  const trimmed = text.trim();

  if (
    trimmed.startsWith("<!doctype") || 
    trimmed.startsWith("<html") || 
    trimmed.includes("Please wait while your application starts") ||
    trimmed.includes("Starting Server") ||
    trimmed.includes("503 Service Unavailable") ||
    trimmed.includes("504 Gateway")
  ) {
    if (response.status === 503 || trimmed.includes("503") || trimmed.includes("high demand") || trimmed.includes("UNAVAILABLE")) {
      throw new Error("Les serveurs d'IA sont temporairement très sollicités. Veuillez relancer l'action dans quelques secondes.");
    }
    throw new Error("Le serveur est en cours de synchronisation. Veuillez patienter un instant et réessayer.");
  }

  if (!response.ok) {
    let errDetail = defaultErrorMsg;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && parsed.error) {
        errDetail = parsed.error;
        try {
          const nested = JSON.parse(errDetail);
          if (nested?.error?.message) {
            errDetail = nested.error.message;
          }
        } catch (_) {}
      }
    } catch (_) {}
    throw new Error(errDetail);
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch (e) {
    throw new Error("Réponse du serveur invalide. Veuillez réessayer.");
  }
}

export default function ResultView({ images, result, onReset, activeTab, selectedLanguage, theme = "dark" }: ResultViewProps) {
  const isDark = theme !== "light";
  const t = getTranslations(selectedLanguage || "French");
  const [editableText, setEditableText] = useState(result.text);

  // Table Data & Active View Mode State
  const [tableData, setTableData] = useState<string[][] | null>(() => {
    if (result.tableData && result.tableData.length > 0) {
      return result.tableData;
    }
    const parsed = parseMarkdownTable(result.text);
    return parsed && parsed.length > 0 ? parsed : null;
  });

  const [activeViewMode, setActiveViewMode] = useState<"text" | "table" | "preview">(() => {
    if ((result.tableData && result.tableData.length > 0) || parseMarkdownTable(result.text)) {
      return "table";
    }
    return "text";
  });
  const [fileName, setFileName] = useState(`Scan_${new Date().toLocaleDateString().replace(/\//g, '-')}`);
  const [isCopied, setIsCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [pendingFormat, setPendingFormat] = useState<"word" | "pdf" | "excel" | "csv" | null>(null);
  const [saveModalTab, setSaveModalTab] = useState<"table" | "settings">("table");
  const [previewSubTab, setPreviewSubTab] = useState<"table" | "document">("table");

  // Helper to automatically generate or reconstruct table data from text
  const handleAutoGenerateTable = () => {
    const parsed = parseMarkdownTable(editableText);
    if (parsed && parsed.length > 0) {
      setTableData(parsed);
      setActiveViewMode("table");
      confetti({ particleCount: 50 });
      return;
    }

    const lines = editableText.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      const defaultData = [
        ["N°", "Contenu Numérisé", "Observations"],
        ["1", "Ligne 1", "Validé"],
        ["2", "Ligne 2", "Validé"]
      ];
      setTableData(defaultData);
      setActiveViewMode("table");
      return;
    }

    const hasPipes = lines.some(l => l.includes("|"));
    if (hasPipes) {
      const rows = lines.map(l => l.split("|").map(c => c.trim()).filter(Boolean));
      if (rows.length > 0) {
        setTableData(rows);
        setActiveViewMode("table");
        confetti({ particleCount: 50 });
        return;
      }
    }

    const hasTabs = lines.some(l => l.includes("\t"));
    if (hasTabs) {
      const rows = lines.map(l => l.split("\t").map(c => c.trim()));
      setTableData(rows);
      setActiveViewMode("table");
      confetti({ particleCount: 50 });
      return;
    }

    const hasSemicolons = lines.some(l => l.includes(";"));
    if (hasSemicolons) {
      const rows = lines.map(l => l.split(";").map(c => c.trim()));
      setTableData(rows);
      setActiveViewMode("table");
      confetti({ particleCount: 50 });
      return;
    }

    // Default intelligent row extractor
    const generated: string[][] = [["N°", "Élément Extrait", "Détail / Statut"]];
    lines.forEach((line, idx) => {
      if (line.includes(":") && !line.startsWith("http")) {
        const parts = line.split(":");
        generated.push([`${idx + 1}`, parts[0].trim(), parts.slice(1).join(":").trim()]);
      } else if (line.includes(" - ")) {
        const parts = line.split(" - ");
        generated.push([`${idx + 1}`, parts[0].trim(), parts.slice(1).join(" - ").trim()]);
      } else {
        generated.push([`${idx + 1}`, line, "Extrait OCR"]);
      }
    });

    setTableData(generated);
    setActiveViewMode("table");
    confetti({ particleCount: 60 });
  };

  // States for automatic AI formatting & Typographic layout
  const [isFormatMenuOpen, setIsFormatMenuOpen] = useState(false);
  const [isFormatting, setIsFormatting] = useState(false);
  const [previousTexts, setPreviousTexts] = useState<string[]>([]);
  const [textSize, setTextSize] = useState<"sm" | "base" | "lg" | "xl">("lg");
  const [lineSpacing, setLineSpacing] = useState<"normal" | "relaxed" | "loose">("relaxed");
  const [textAlign, setTextAlign] = useState<"left" | "center" | "justify">("left");
  
  // Custom Typography & Text Color Presets (Couleur des écrits & Mise en forme)
  const [fontFamily, setFontFamily] = useState<"sans" | "serif" | "mono">("sans");
  const [isBold, setIsBold] = useState(false);
  const [textColor, setTextColor] = useState<"default" | "high-contrast" | "slate" | "emerald" | "indigo" | "sepia">("default");
  const [isColorMenuOpen, setIsColorMenuOpen] = useState(false);

  // States for Direct Send / Numérisation & Envoi Direct
  const [isDirectSendOpen, setIsDirectSendOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [emailSubject, setEmailSubject] = useState(`[AbookScan] ${fileName}`);
  const [customNote, setCustomNote] = useState("");
  const [sendSuccessMessage, setSendSuccessMessage] = useState<string | null>(null);

  // FEATURE 3: Translation states
  const [isTranslateOpen, setIsTranslateOpen] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [selectedTargetLang, setSelectedTargetLang] = useState("Anglais");
  const [translationSuccess, setTranslationSuccess] = useState<string | null>(null);

  // FEATURE 4: AI Summary (Résumé & Points Clés Executif)
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryData, setSummaryData] = useState<{ summary?: string; keyPoints?: string[]; actionItems?: string[] } | null>(null);

  // FEATURE: Text-To-Speech (Lecteur Audio Synthèse Vocale)
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isPausedAudio, setIsPausedAudio] = useState(false);
  const [speechRate, setSpeechRate] = useState(1);

  // Audio Speech Handler
  const handlePlayAudio = () => {
    if (!('speechSynthesis' in window)) {
      alert("La synthèse vocale n'est pas prise en charge par ce navigateur.");
      return;
    }

    if (isPausedAudio) {
      window.speechSynthesis.resume();
      setIsPlayingAudio(true);
      setIsPausedAudio(false);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(editableText);
    utterance.rate = speechRate;
    utterance.lang = "fr-FR";

    utterance.onend = () => {
      setIsPlayingAudio(false);
      setIsPausedAudio(false);
    };

    utterance.onerror = (e) => {
      console.error("Speech synthesis error:", e);
      setIsPlayingAudio(false);
      setIsPausedAudio(false);
    };

    window.speechSynthesis.speak(utterance);
    setIsPlayingAudio(true);
    setIsPausedAudio(false);
  };

  const handlePauseAudio = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.pause();
      setIsPlayingAudio(false);
      setIsPausedAudio(true);
    }
  };

  const handleStopAudio = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsPlayingAudio(false);
      setIsPausedAudio(false);
    }
  };

  // Translation Handler
  const handleTranslateText = async (lang: string) => {
    if (isTranslating || !editableText.trim()) return;
    setIsTranslating(true);
    setTranslationSuccess(null);

    try {
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: editableText,
          targetLanguage: lang,
        }),
      });

      const data = await safeJsonFetch<{ translatedText?: string }>(response, "Échec du service de traduction.");
      if (data.translatedText) {
        setPreviousTexts(prev => [...prev, editableText]);
        setEditableText(data.translatedText);
        setTranslationSuccess(`Document traduit avec succès en ${lang} !`);
        confetti({ particleCount: 70 });
        setTimeout(() => setIsTranslateOpen(false), 1200);
      }
    } catch (err: any) {
      alert(err.message || "Erreur lors de la traduction du document.");
    } finally {
      setIsTranslating(false);
    }
  };

  // Summary Handler
  const handleGenerateSummary = async () => {
    setIsSummaryOpen(true);
    if (summaryData || isSummarizing || !editableText.trim()) return;
    setIsSummarizing(true);

    try {
      const response = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: editableText,
          language: "French",
        }),
      });

      const data = await safeJsonFetch(response, "Échec de la génération de la synthèse.");
      setSummaryData(data);
      confetti({ particleCount: 60 });
    } catch (err: any) {
      alert(err.message || "Erreur lors de la création de la synthèse.");
    } finally {
      setIsSummarizing(false);
    }
  };

  const handlePlaySummaryAudio = () => {
    if (!('speechSynthesis' in window)) {
      alert("La synthèse vocale n'est pas prise en charge par ce navigateur.");
      return;
    }

    if (isPausedAudio) {
      window.speechSynthesis.resume();
      setIsPlayingAudio(true);
      setIsPausedAudio(false);
      return;
    }

    window.speechSynthesis.cancel();
    const textToRead = summaryData
      ? `Résumé : ${summaryData.summary}. Points clés : ${summaryData.keyPoints?.join(". ") || ""}`
      : editableText;

    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.rate = speechRate;
    utterance.lang = "fr-FR";

    utterance.onend = () => {
      setIsPlayingAudio(false);
      setIsPausedAudio(false);
    };

    utterance.onerror = (e) => {
      console.error("Speech synthesis error:", e);
      setIsPlayingAudio(false);
      setIsPausedAudio(false);
    };

    window.speechSynthesis.speak(utterance);
    setIsPlayingAudio(true);
    setIsPausedAudio(false);
  };

  const openDirectSendModal = () => {
    setEmailSubject(`[Document Numérisé] ${fileName}`);
    setIsDirectSendOpen(true);
    setSendSuccessMessage(null);
  };

  const handleDirectEmailSend = (e: React.FormEvent) => {
    e.preventDefault();
    const fullBody = `${customNote ? customNote + "\n\n-------------------------\n\n" : ""}TEXTE DU DOCUMENT NUMÉRISÉ (${new Date().toLocaleDateString()}) :\n\n${editableText}\n\n---\nNumérisé et transmis via AbookScan AI`;
    
    const mailtoUrl = `mailto:${encodeURIComponent(recipientEmail)}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(fullBody)}`;
    window.location.href = mailtoUrl;

    setSendSuccessMessage("Client e-mail ouvert avec le document numérisé prêt à l'envoi !");
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 }
    });
  };

  const handleWhatsAppSend = () => {
    const message = `*${emailSubject}*\n\n${editableText}`;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(waUrl, "_blank");

    setSendSuccessMessage("Document prêt pour envoi instantané sur WhatsApp !");
    confetti({ particleCount: 60 });
  };

  const handlePrintDirect = () => {
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${fileName}</title>
            <style>
              body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 40px; color: #111; line-height: 1.6; }
              h1 { border-bottom: 2px solid #0d9488; padding-bottom: 8px; font-size: 20px; }
              .meta { font-size: 12px; color: #666; margin-bottom: 24px; }
              .content { white-space: pre-wrap; font-size: 14px; }
              .footer { margin-top: 40px; border-top: 1px solid #ddd; padding-top: 10px; font-size: 10px; color: #888; }
            </style>
          </head>
          <body>
            <h1>${fileName}</h1>
            <div class="meta">Document numérisé le ${new Date().toLocaleString()} - AbookScan AI</div>
            <div class="content">${editableText.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
            <div class="footer">Numérisation et transcription haute définition AbookScan</div>
            <script>
              window.onload = function() { window.print(); }
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  const handleAIFormatting = async (style: string) => {
    if (isFormatting) return;
    setIsFormatting(true);
    setIsFormatMenuOpen(false);

    try {
      const response = await fetch("/api/format", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: editableText,
          style: style,
        }),
      });

      const data = await safeJsonFetch<{ formattedText?: string }>(
        response, 
        "Impossible de communiquer avec le serveur pour la mise en forme."
      );
      if (data.formattedText) {
        setPreviousTexts(prev => [...prev, editableText]);
        setEditableText(data.formattedText);
        confetti({
          particleCount: 100,
          spread: 80,
          colors: ["#14b8a6", "#3b82f6", "#ffffff"]
        });
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || "Impossible de réaliser la mise en forme de texte par l'IA.");
    } finally {
      setIsFormatting(false);
    }
  };

  const handleUndo = () => {
    if (previousTexts.length === 0) return;
    const prevText = previousTexts[previousTexts.length - 1];
    setEditableText(prevText);
    setPreviousTexts(prev => prev.slice(0, prev.length - 1));
  };

  const handleUnwrapLinesOnly = () => {
    if (!editableText) return;
    const unwrapped = unwrapLinesExceptParagraphs(editableText);
    setPreviousTexts(prev => [...prev, editableText]);
    setEditableText(unwrapped);
    confetti({
      particleCount: 70,
      spread: 60,
      colors: ["#14b8a6", "#38bdf8", "#ffffff"]
    });
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(editableText);
    setIsCopied(true);
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
    });
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleExportInitiation = (format: "word" | "pdf" | "excel" | "csv") => {
    setPendingFormat(format);
    setIsSaveModalOpen(true);
  };

  const handleDownloadRawScanImages = () => {
    if (!images || images.length === 0) {
      alert("Aucune image de numérisation d'origine disponible.");
      return;
    }
    images.forEach((imgBase64, idx) => {
      const link = document.createElement("a");
      link.href = imgBase64;
      link.download = `${fileName}_page_${idx + 1}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
    confetti({ particleCount: 50 });
  };

  const executeExport = async () => {
    setIsSaveModalOpen(false);
    
    if (pendingFormat === "word") {
      const paragraphs: Paragraph[] = [];
      const lines = editableText.split("\n");

      lines.forEach((line, idx) => {
        const isPageMarker = line.trim().startsWith("[--- Page") || line.trim().startsWith("[---");
        
        if (isPageMarker && idx > 0) {
          // Insert page break before subsequent page headers
          paragraphs.push(new Paragraph({ children: [new PageBreak()] }));
        }

        paragraphs.push(new Paragraph({
          children: [
            new TextRun({
              text: line,
              bold: isPageMarker,
              size: isPageMarker ? 28 : 24, // 14pt for page markers, 12pt for regular text
              color: isPageMarker ? "0D9488" : "000000", // Teal accent for headers
            })
          ],
          spacing: { after: 120 }
        }));
      });

      const doc = new Document({
        sections: [{
          properties: {},
          children: paragraphs,
        }],
      });

      const blob = await Packer.toBlob(doc);
      saveAs(blob, `${fileName}.docx`);
    } else if (pendingFormat === "pdf") {
      const doc = new jsPDF();
      if (images && images.length > 0) {
        images.forEach((imgBase64, index) => {
          if (index > 0) doc.addPage();
          try {
            doc.addImage(imgBase64, "JPEG", 10, 10, 190, 240);
            doc.setFontSize(8);
            doc.setTextColor(100);
            doc.text(`AbookScan - Document Numérisé Original - Page ${index + 1} sur ${images.length}`, 10, 255);
          } catch (err) {
            console.error("Error embedding scan image in PDF:", err);
          }
        });
        
        // Add full multi-page transcribed text with automatic pagination
        doc.addPage();
        doc.setFontSize(14);
        doc.setTextColor(20, 184, 166);
        doc.text("Transcription Complète Multipage", 15, 15);
        doc.setFontSize(10);
        doc.setTextColor(30);
        
        const splitText = doc.splitTextToSize(editableText, 180);
        let cursorY = 25;
        const pageHeight = 275;
        const lineHeight = 6;

        splitText.forEach((line: string) => {
          if (cursorY + lineHeight > pageHeight) {
            doc.addPage();
            cursorY = 20;
          }
          doc.text(line, 15, cursorY);
          cursorY += lineHeight;
        });
      } else {
        const splitText = doc.splitTextToSize(editableText, 180);
        let cursorY = 20;
        const pageHeight = 275;
        const lineHeight = 6;

        splitText.forEach((line: string) => {
          if (cursorY + lineHeight > pageHeight) {
            doc.addPage();
            cursorY = 20;
          }
          doc.text(line, 15, cursorY);
          cursorY += lineHeight;
        });
      }
      doc.save(`${fileName}.pdf`);
    } else if (pendingFormat === "excel") {
      let rows: string[][] = [];
      if (tableData && tableData.length > 0) {
        rows = tableData;
      } else {
        // Fallback: convert transcribed text into tabular rows by lines
        rows = [["Ligne", "Contenu Numérisé"]];
        const lines = editableText.split("\n").filter(l => l.trim().length > 0);
        lines.forEach((l, idx) => {
          rows.push([`Ligne ${idx + 1}`, l]);
        });
      }
      const ws = XLSX.utils.aoa_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Transcription_Numérisée");
      XLSX.writeFile(wb, `${fileName}.xlsx`);
    } else if (pendingFormat === "csv") {
      let rows: string[][] = [];
      if (tableData && tableData.length > 0) {
        rows = tableData;
      } else {
        rows = [["Ligne", "Contenu Numérisé"]];
        const lines = editableText.split("\n").filter(l => l.trim().length > 0);
        lines.forEach((l, idx) => {
          rows.push([`Ligne ${idx + 1}`, l]);
        });
      }
      const csvContent = tableToCsv(rows);
      const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
      saveAs(blob, `${fileName}.csv`);
    }
    confetti({ particleCount: 50 });
  };

  const shareNative = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Document AbookScan',
          text: editableText,
        });
      } catch (err) {}
    } else {
      copyToClipboard();
    }
  };

  const wordCount = editableText.trim() === "" ? 0 : editableText.trim().split(/\s+/).length;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full h-full flex flex-col gap-6 pb-12 px-4"
    >
      {/* Save Modal */}
      <AnimatePresence>
        {isSaveModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
              onClick={() => setIsSaveModalOpen(false)} 
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-2xl bg-zinc-900 border border-teal-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto no-scrollbar"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-teal-500/20 text-teal-400 rounded-2xl border border-teal-500/30">
                    <Save className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                      Enregistrement du Document
                    </h3>
                    <p className="text-xs text-slate-400">Vérifiez le tableau de résultat et configurez votre export</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsSaveModalOpen(false)}
                  className="p-2 hover:bg-white/10 text-slate-400 hover:text-white rounded-full transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Tabs inside Save Modal: Tableau de Résultat vs Paramètres */}
              <div className="flex items-center gap-2 bg-black/40 border border-white/10 p-1 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setSaveModalTab("table")}
                  className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                    saveModalTab === "table"
                      ? "bg-teal-500 text-black shadow-md shadow-teal-500/20"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <TableIcon className="w-4 h-4" />
                  <span>Tableau de Résultat (Aperçu)</span>
                  {tableData && tableData.length > 0 && (
                    <span className="px-1.5 py-0.2 bg-black/30 text-[10px] rounded-full">
                      {tableData.length - 1}L
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setSaveModalTab("settings")}
                  className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                    saveModalTab === "settings"
                      ? "bg-teal-500 text-black shadow-md shadow-teal-500/20"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Format & Titre</span>
                </button>
              </div>

              {/* Tab 1: Preview Result Table before Saving */}
              {saveModalTab === "table" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs text-slate-300">
                    <span className="font-semibold flex items-center gap-1.5 text-teal-400">
                      <Sparkles className="w-3.5 h-3.5" />
                      Tableau extrait prêt pour enregistrement :
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsSaveModalOpen(false);
                        setActiveViewMode("table");
                      }}
                      className="text-teal-400 hover:underline flex items-center gap-1 text-[11px]"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>Modifier dans l'éditeur complet</span>
                    </button>
                  </div>

                  {tableData && tableData.length > 0 ? (
                    <div className="max-h-64 overflow-auto border border-white/10 rounded-2xl bg-black/50 p-2 no-scrollbar shadow-inner">
                      <table className="min-w-full divide-y divide-white/10 text-xs text-left">
                        <thead className="bg-slate-900/90 text-teal-300 sticky top-0 font-semibold font-mono text-[10px]">
                          <tr>
                            <th className="px-3 py-2 w-8 text-center text-slate-500 border-r border-white/10">#</th>
                            {tableData[0]?.map((head, hIdx) => (
                              <th key={hIdx} className="px-3 py-2 border-r border-white/10 whitespace-nowrap">
                                {head || `Col ${hIdx + 1}`}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-slate-200">
                          {tableData.slice(1).map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-white/5 transition-colors">
                              <td className="px-3 py-1.5 text-center text-slate-500 font-mono text-[10px] border-r border-white/10 bg-black/30">
                                {rIdx + 1}
                              </td>
                              {row.map((cell, cIdx) => (
                                <td key={cIdx} className="px-3 py-1.5 border-r border-white/10 whitespace-nowrap max-w-[200px] truncate text-slate-300">
                                  {cell || "—"}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-6 bg-black/40 border border-white/10 rounded-2xl text-center space-y-3">
                      <TableIcon className="w-8 h-8 text-slate-500 mx-auto" />
                      <p className="text-xs text-slate-300">Aucun tableau structuré n'a encore été généré.</p>
                      <button
                        type="button"
                        onClick={handleAutoGenerateTable}
                        className="px-4 py-2 bg-teal-500 hover:bg-teal-400 text-black font-bold text-xs rounded-xl shadow-md transition-all inline-flex items-center gap-1.5"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Générer automatiquement le tableau maintenant</span>
                      </button>
                    </div>
                  )}

                  <div className="p-3 bg-teal-500/10 border border-teal-500/20 rounded-xl text-[11px] text-teal-300 flex items-center justify-between">
                    <span>Format sélectionné : <strong className="uppercase font-mono">{pendingFormat || "excel"}</strong></span>
                    <button
                      type="button"
                      onClick={() => setSaveModalTab("settings")}
                      className="text-white hover:underline text-[10px] uppercase font-bold"
                    >
                      Changer de format &gt;
                    </button>
                  </div>
                </div>
              )}

              {/* Tab 2: Settings & Formats */}
              {saveModalTab === "settings" && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                      Nom du fichier :
                    </label>
                    <input 
                      type="text"
                      value={fileName}
                      onChange={(e) => setFileName(e.target.value)}
                      className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-teal-500"
                      autoFocus
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                      Choisissez le format de sortie :
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                      {[
                        { id: "excel", label: "Excel (.xlsx)", desc: "Tableau complet", icon: FileSpreadsheet, color: "text-emerald-400" },
                        { id: "pdf", label: "PDF Pro", desc: "Scan HD & texte", icon: FileText, color: "text-red-400" },
                        { id: "word", label: "Word (.docx)", desc: "Rapport modifiable", icon: FileText, color: "text-blue-400" },
                        { id: "csv", label: "Fichier CSV", desc: "Données brutes", icon: TableIcon, color: "text-amber-400" },
                      ].map((fmt) => {
                        const Icon = fmt.icon;
                        const isSelected = (pendingFormat || "excel") === fmt.id;
                        return (
                          <button
                            key={fmt.id}
                            type="button"
                            onClick={() => setPendingFormat(fmt.id as any)}
                            className={`p-3 rounded-2xl border text-left transition-all flex flex-col gap-1 ${
                              isSelected
                                ? "bg-teal-500/20 border-teal-500 text-white shadow-lg shadow-teal-500/10"
                                : "bg-black/40 border-white/10 hover:border-white/20 text-slate-300"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <Icon className={`w-4 h-4 ${fmt.color}`} />
                              {isSelected && <Check className="w-3.5 h-3.5 text-teal-400" />}
                            </div>
                            <span className="text-xs font-bold">{fmt.label}</span>
                            <span className="text-[9px] text-slate-400">{fmt.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsSaveModalOpen(false)}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl text-xs uppercase font-bold text-slate-400 hover:text-white transition-all"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={executeExport}
                  className="flex-1 py-3 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-black rounded-xl text-xs uppercase font-bold tracking-wider shadow-lg shadow-teal-500/20 transition-all flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  <span>Enregistrer & Télécharger</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Direct Send Modal (Numérisation pour Envoi Direct) */}
      <AnimatePresence>
        {isDirectSendOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/70 backdrop-blur-md" 
              onClick={() => setIsDirectSendOpen(false)} 
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-zinc-900 border border-teal-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto no-scrollbar"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-teal-500/20 text-teal-400 rounded-2xl border border-teal-500/30">
                    <Send className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                      Envoi Direct du Document
                    </h3>
                    <p className="text-xs text-slate-400">Transmettez votre numérisation en 1 clic sans intermédiaire</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsDirectSendOpen(false)}
                  className="p-2 hover:bg-white/10 text-slate-400 hover:text-white rounded-full transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {sendSuccessMessage && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs rounded-xl flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{sendSuccessMessage}</span>
                </motion.div>
              )}

              {/* Form Email Direct Send */}
              <form onSubmit={handleDirectEmailSend} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-teal-400" />
                    <span>E-mail du destinataire</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="exemple@entreprise.com ou destinataire@domaine.fr"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Objet du message</label>
                  <input
                    type="text"
                    required
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Note ou message d'accompagnement (facultatif)</label>
                  <textarea
                    rows={2}
                    placeholder="Ex: Veuillez trouver ci-joint le compte-rendu de la réunion numérisé ce jour..."
                    value={customNote}
                    onChange={(e) => setCustomNote(e.target.value)}
                    className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-white text-xs focus:outline-none focus:border-teal-500 resize-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-black font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-teal-500/20 flex items-center justify-center gap-2 transition-all"
                >
                  <Mail className="w-4 h-4" />
                  <span>Envoyer par E-mail Direct</span>
                </button>
              </form>

              {/* Alternative Instant Dispatch Channels */}
              <div className="pt-2 border-t border-white/10 space-y-3">
                <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400 block">Autres Canaux d'Envoi Direct :</span>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={handleWhatsAppSend}
                    className="p-3 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition-all"
                  >
                    <MessageSquare className="w-4 h-4 text-emerald-400" />
                    <span>WhatsApp Direct</span>
                  </button>

                  <button
                    type="button"
                    onClick={handlePrintDirect}
                    className="p-3 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-xl text-xs font-medium flex items-center justify-center gap-2 transition-all"
                  >
                    <Printer className="w-4 h-4 text-indigo-400" />
                    <span>Impression Directe</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* FEATURE 3: Translation Modal */}
      <AnimatePresence>
        {isTranslateOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/75 backdrop-blur-md" 
              onClick={() => !isTranslating && setIsTranslateOpen(false)} 
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-zinc-900 border border-indigo-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto no-scrollbar"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-2xl border border-indigo-500/30">
                    <Languages className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                      Traduction Instantanée IA
                    </h3>
                    <p className="text-xs text-slate-400">Traduisez le texte de votre document en +10 langues</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsTranslateOpen(false)}
                  disabled={isTranslating}
                  className="p-2 hover:bg-white/10 text-slate-400 hover:text-white rounded-full transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {translationSuccess && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs rounded-xl flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{translationSuccess}</span>
                </motion.div>
              )}

              <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider block">
                  Sélectionnez la langue cible :
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {[
                    { code: "Français", label: "Français 🇫🇷" },
                    { code: "Anglais", label: "English 🇬🇧" },
                    { code: "Dhu Alur", label: "Dhu Alur (Mahagi) 🇨🇩🇺🇬" },
                    { code: "Lingala", label: "Lingala 🇨🇩" },
                    { code: "Swahili", label: "Kiswahili 🇰🇪" },
                    { code: "Tshiluba", label: "Tshiluba (Ciluba) 🇨🇩" },
                    { code: "Kikongo", label: "Kikongo (Kikongo ya Leta) 🇨🇩" },
                    { code: "Espagnol", label: "Español 🇪🇸" },
                    { code: "Português", label: "Português 🇵🇹" },
                    { code: "Allemand", label: "Deutsch 🇩🇪" },
                    { code: "Italien", label: "Italiano 🇮🇹" },
                    { code: "Arabe", label: "العربية 🇸🇦" },
                    { code: "Chinois", label: "中文 🇨🇳" },
                    { code: "Japonais", label: "日本語 🇯🇵" },
                  ].map((item) => (
                    <button
                      key={item.code}
                      type="button"
                      disabled={isTranslating}
                      onClick={() => {
                        setSelectedTargetLang(item.code);
                        handleTranslateText(item.code);
                      }}
                      className={`p-3 rounded-2xl border text-xs font-semibold transition-all flex items-center justify-between ${
                        selectedTargetLang === item.code
                        ? "bg-indigo-500/20 border-indigo-500 text-indigo-300 shadow-lg shadow-indigo-500/10"
                        : "bg-black/40 border-white/10 hover:border-white/20 text-slate-300 hover:text-white"
                      }`}
                    >
                      <span>{item.label}</span>
                      {selectedTargetLang === item.code && isTranslating && (
                        <RefreshCw className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {isTranslating && (
                <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl flex items-center gap-3">
                  <RefreshCw className="w-5 h-5 text-indigo-400 animate-spin shrink-0" />
                  <div className="text-xs">
                    <p className="font-bold text-indigo-300">Traduction en cours par Gemini AI...</p>
                    <p className="text-slate-400 text-[10px]">Préservation du sens et de la structure originale</p>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* FEATURE 4: AI Summary & Key Takeaways Modal */}
      <AnimatePresence>
        {isSummaryOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/75 backdrop-blur-md" 
              onClick={() => {
                handleStopAudio();
                setIsSummaryOpen(false);
              }} 
            />
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="relative w-full max-w-xl bg-zinc-900 border border-teal-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto no-scrollbar"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-teal-500/20 text-teal-400 rounded-2xl border border-teal-500/30">
                    <BookOpen className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                      Synthèse Exécutive & Points Clés
                    </h3>
                    <p className="text-xs text-slate-400">Analyse synthétique intelligente de votre document numérisé</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    handleStopAudio();
                    setIsSummaryOpen(false);
                  }}
                  className="p-2 hover:bg-white/10 text-slate-400 hover:text-white rounded-full transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {isSummarizing ? (
                <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="w-16 h-16 bg-teal-500/10 border border-teal-500/20 rounded-full flex items-center justify-center animate-pulse">
                    <Sparkles className="w-8 h-8 text-teal-400 animate-spin" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-white">Analyse du document en cours...</h4>
                    <p className="text-xs text-slate-400">Gemini extrait les points clés et rédige un résumé clair</p>
                  </div>
                </div>
              ) : summaryData ? (
                <div className="space-y-5">
                  {/* Executive Summary Audio Reader Controls */}
                  <div className="p-3 bg-black/60 border border-teal-500/30 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-teal-500/20 text-teal-400 rounded-xl">
                        <Volume2 className="w-4 h-4" />
                      </div>
                      <div>
                        <span className="font-bold text-white text-xs block">Lecture Vocale du Résumé</span>
                        <span className="text-[9px] text-slate-400">Écoutez la synthèse vocale IA du résumé</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isPlayingAudio ? (
                        <button
                          type="button"
                          onClick={handlePauseAudio}
                          className="px-3 py-1.5 bg-amber-500/20 border border-amber-500/30 text-amber-300 rounded-xl font-bold flex items-center gap-1.5 hover:bg-amber-500/30 transition-all text-xs"
                        >
                          <Pause className="w-3.5 h-3.5" />
                          <span>Pause</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handlePlaySummaryAudio}
                          className="px-3 py-1.5 bg-teal-500 hover:bg-teal-400 text-black font-bold rounded-xl flex items-center gap-1.5 transition-all text-xs shadow-lg shadow-teal-500/20"
                        >
                          <Play className="w-3.5 h-3.5 fill-black" />
                          <span>{isPausedAudio ? "Reprendre" : "Écouter le Résumé"}</span>
                        </button>
                      )}

                      {(isPlayingAudio || isPausedAudio) && (
                        <button
                          type="button"
                          onClick={handleStopAudio}
                          className="p-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 rounded-xl transition-all"
                          title="Arrêter la lecture"
                        >
                          <Square className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <div className="flex items-center bg-black/50 border border-white/10 rounded-xl p-1 gap-1">
                        {[0.8, 1, 1.25, 1.5].map((rate) => (
                          <button
                            key={rate}
                            type="button"
                            onClick={() => setSpeechRate(rate)}
                            className={`px-1.5 py-0.5 rounded-lg text-[9px] font-bold ${
                              speechRate === rate
                              ? "bg-teal-500 text-black"
                              : "text-slate-400 hover:text-white"
                            }`}
                          >
                            {rate}x
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Executive Summary Card */}
                  <div className="p-4 bg-teal-500/10 border border-teal-500/25 rounded-2xl space-y-2">
                    <div className="flex items-center gap-2 text-teal-400 text-xs font-bold uppercase tracking-wider">
                      <Sparkles className="w-4 h-4" />
                      <span>Résumé Exécutif</span>
                    </div>
                    <p className="text-xs text-slate-200 leading-relaxed font-sans">
                      {summaryData.summary}
                    </p>
                  </div>

                  {/* Key Points */}
                  {summaryData.keyPoints && summaryData.keyPoints.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-white text-xs font-bold uppercase tracking-wider">
                        <ListChecks className="w-4 h-4 text-emerald-400" />
                        <span>Points Clés Importants</span>
                      </div>
                      <div className="space-y-2">
                        {summaryData.keyPoints.map((point, idx) => (
                          <div key={idx} className="p-3 bg-black/40 border border-white/5 rounded-xl flex items-start gap-2.5 text-xs text-slate-300">
                            <span className="w-5 h-5 rounded-full bg-teal-500/20 text-teal-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                              {idx + 1}
                            </span>
                            <span className="leading-relaxed">{point}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action Items */}
                  {summaryData.actionItems && summaryData.actionItems.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider">
                        <ArrowRight className="w-4 h-4" />
                        <span>Actions & Décisions</span>
                      </div>
                      <div className="space-y-1.5">
                        {summaryData.actionItems.map((item, idx) => (
                          <div key={idx} className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-200 flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => {
                        const summaryText = `RÉSUMÉ EXÉCUTIF (${fileName}):\n${summaryData.summary}\n\nPOINTS CLÉS:\n${summaryData.keyPoints?.map(p => `• ${p}`).join("\n")}`;
                        navigator.clipboard.writeText(summaryText);
                        confetti({ particleCount: 50 });
                        alert("Synthèse copiée dans le presse-papier !");
                      }}
                      className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all"
                    >
                      <Copy className="w-4 h-4" />
                      <span>Copier la Synthèse</span>
                    </button>
                  </div>
                </div>
              ) : null}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <button 
            onClick={onReset} 
            className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl ${
              isDark 
                ? "bg-zinc-900/90 hover:bg-teal-500/20 text-slate-300 hover:text-teal-300 border-white/10 hover:border-teal-500/40" 
                : "bg-white hover:bg-teal-50 text-slate-700 hover:text-teal-700 border-slate-200 hover:border-teal-300 shadow-sm"
            } border transition-all text-xs font-bold font-mono group shadow-lg`}
            title="Retourner au Scanner"
          >
            <ArrowLeft className="w-4 h-4 text-teal-500 group-hover:-translate-x-1 transition-transform" />
            <span>Retour</span>
          </button>
          <div className="space-y-1">
            <input 
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              className={`text-xl font-display font-light ${isDark ? "text-white" : "text-slate-900"} bg-transparent border-none outline-none focus:ring-1 focus:ring-teal-500/50 rounded-lg px-2`}
            />
            <div className="flex items-center gap-2 px-2 flex-wrap">
              <span className={`text-[8px] uppercase font-mono ${isDark ? "text-slate-500" : "text-slate-400"} tracking-widest`}>{wordCount} mots</span>
              <div className={`w-1 h-1 ${isDark ? "bg-slate-700" : "bg-slate-300"} rounded-full`} />
              <div className={`flex items-center gap-1.5 ${isDark ? "text-teal-400 bg-teal-500/10 border-teal-500/20" : "text-teal-800 bg-teal-50 border-teal-200"} px-2 py-0.5 rounded-full border`}>
                <Layers className="w-3 h-3 text-teal-500" />
                <span className="text-[8px] uppercase font-mono tracking-widest font-bold">
                  {images.length > 1 ? `Dossier Multi-Pages (${images.length} pages)` : "Document Unique"}
                </span>
              </div>
              <div className={`w-1 h-1 ${isDark ? "bg-slate-700" : "bg-slate-300"} rounded-full`} />
              <div className={`flex items-center gap-1.5 ${isEditing ? "text-teal-500" : (isDark ? "text-slate-500" : "text-slate-400")}`}>
                <div className={`w-1 h-1 rounded-full ${isEditing ? "bg-teal-400 animate-pulse" : (isDark ? "bg-slate-700" : "bg-slate-300")}`} />
                <span className="text-[8px] uppercase font-mono tracking-widest font-bold">
                  {isEditing ? "Mode Édition" : "Mode Lecture OCR"}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {previousTexts.length > 0 && (
            <button
              onClick={handleUndo}
              title="Annuler le dernier formatage IA"
              className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 border border-red-500/25 text-red-400 rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all shadow-md"
            >
              <Undo2 className="w-4 h-4" /> Annuler IA
            </button>
          )}

          <div className="relative">
            <button 
              onClick={() => setIsFormatMenuOpen(!isFormatMenuOpen)} 
              disabled={isFormatting}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${
                isFormatMenuOpen || isFormatting
                ? "bg-teal-500 text-black shadow-[0_0_20px_rgba(20,184,166,0.4)]" 
                : (isDark ? "bg-teal-500/15 border border-teal-500/30 text-teal-400 hover:bg-teal-500/30" : "bg-teal-50 border border-teal-300 text-teal-800 hover:bg-teal-100")
              }`}
            >
              <Sparkles className={`w-4 h-4 ${isFormatting ? "animate-spin" : "animate-pulse"}`} />
              {isFormatting ? "Formatage..." : "Mise en forme IA"}
            </button>

              <AnimatePresence>
                {isFormatMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsFormatMenuOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className={`absolute right-0 mt-2 w-72 ${isDark ? "bg-zinc-900 border-white/10" : "bg-white border-slate-200 shadow-2xl"} border rounded-2xl p-4 shadow-2xl z-50 space-y-2.5 text-left`}
                    >
                      <div className={`pb-2 border-b ${isDark ? "border-white/5" : "border-slate-100"}`}>
                        <h4 className="text-[10px] uppercase tracking-widest font-bold text-teal-500 font-sans">Mettre en forme automatiquement</h4>
                        <p className={`text-[9px] ${isDark ? "text-slate-400" : "text-slate-500"} leading-normal`}>Optimisez la présentation de vos écrits par l'IA</p>
                      </div>

                      <button
                        onClick={() => {
                          handleUnwrapLinesOnly();
                          setIsFormatMenuOpen(false);
                        }}
                        className={`w-full text-left p-2.5 ${isDark ? "bg-teal-500/10 hover:bg-teal-500/20 border-teal-500/30" : "bg-teal-50 hover:bg-teal-100 border-teal-200"} border rounded-xl transition-all flex flex-col items-start gap-0.5`}
                      >
                        <div className={`flex items-center gap-1.5 text-xs ${isDark ? "text-teal-300" : "text-teal-800"} font-bold`}>
                          <WrapText className="w-3.5 h-3.5 text-teal-500" />
                          <span>Supprimer sauts de ligne (Paragraphes purs)</span>
                        </div>
                        <span className={`text-[9px] ${isDark ? "text-slate-300" : "text-slate-600"}`}>Fusionne les retours à la ligne intempestifs en phrases continues, préserve uniquement les vrais paragraphes</span>
                      </button>

                      <button
                        onClick={() => handleAIFormatting("standard")}
                        className={`w-full text-left p-2 ${isDark ? "hover:bg-white/5" : "hover:bg-slate-100"} rounded-xl transition-all flex flex-col items-start gap-0.5 bg-transparent`}
                      >
                        <span className={`text-xs ${isDark ? "text-white" : "text-slate-900"} font-medium`}>Standard (Aéré & Propre)</span>
                        <span className={`text-[9px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>Paragraphes fluides, correction orthographique robuste</span>
                      </button>

                      <button
                        onClick={() => handleAIFormatting("bullets")}
                        className={`w-full text-left p-2 ${isDark ? "hover:bg-white/5" : "hover:bg-slate-100"} rounded-xl transition-all flex flex-col items-start gap-0.5 bg-transparent`}
                      >
                        <span className={`text-xs ${isDark ? "text-white" : "text-slate-900"} font-medium`}>Liste à puces logique</span>
                        <span className={`text-[9px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>Convertit le texte en points clés et tirets lisibles</span>
                      </button>

                      <button
                        onClick={() => handleAIFormatting("resume")}
                        className={`w-full text-left p-2 ${isDark ? "hover:bg-white/5" : "hover:bg-slate-100"} rounded-xl transition-all flex flex-col items-start gap-0.5 bg-transparent`}
                      >
                        <span className={`text-xs ${isDark ? "text-white" : "text-slate-900"} font-medium`}>Structure Rapport / Synthèse</span>
                        <span className={`text-[9px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>Ajout d'en-têtes, divisions claires et sections</span>
                      </button>

                      <button
                        onClick={() => handleAIFormatting("paragraphs")}
                        className={`w-full text-left p-2 ${isDark ? "hover:bg-white/5" : "hover:bg-slate-100"} rounded-xl transition-all flex flex-col items-start gap-0.5 bg-transparent`}
                      >
                        <span className={`text-xs ${isDark ? "text-white" : "text-slate-900"} font-medium`}>Paragraphes & Espacement Aéré</span>
                        <span className={`text-[9px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>Découpage net en paragraphes distincts avec double interligne</span>
                      </button>

                      <button
                        onClick={() => handleAIFormatting("formal")}
                        className={`w-full text-left p-2 ${isDark ? "hover:bg-white/5" : "hover:bg-slate-100"} rounded-xl transition-all flex flex-col items-start gap-0.5 bg-transparent`}
                      >
                        <span className={`text-xs ${isDark ? "text-white" : "text-slate-900"} font-medium`}>Courrier & E-mail Formel</span>
                        <span className={`text-[9px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>S'adapte au format lettre officielle polie</span>
                      </button>
                      
                      <div className={`pt-2 text-center border-t ${isDark ? "border-white/5" : "border-slate-100"}`}>
                        <span className={`text-[7px] uppercase tracking-widest font-mono ${isDark ? "text-slate-500" : "text-slate-400"}`}>AbookScan AI Auto-formatting</span>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

          {/* FEATURE 3: Traduction Instantanée IA Button */}
          <button
            onClick={() => setIsTranslateOpen(true)}
            className={`flex items-center gap-2 px-5 py-2.5 ${isDark ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500 hover:text-white" : "bg-indigo-50 border-indigo-300 text-indigo-800 hover:bg-indigo-600 hover:text-white"} border rounded-full text-[10px] font-bold uppercase tracking-widest transition-all shadow-md`}
            title="Traduire le document numérisé en d'autres langues"
          >
            <Languages className="w-4 h-4 text-indigo-500" />
            <span>Traduire IA</span>
          </button>

          {/* FEATURE 4: Résumé Exécutif & Points Clés Button */}
          <button
            onClick={handleGenerateSummary}
            className={`flex items-center gap-2 px-5 py-2.5 ${isDark ? "bg-teal-500/15 border-teal-500/30 text-teal-300 hover:bg-teal-500 hover:text-black" : "bg-teal-50 border-teal-300 text-teal-800 hover:bg-teal-500 hover:text-white"} border rounded-full text-[10px] font-bold uppercase tracking-widest transition-all shadow-md`}
            title="Générer un résumé synthétique du document"
          >
            <BookOpen className="w-4 h-4 text-teal-500" />
            <span>Résumé IA</span>
          </button>

          <button 
            onClick={() => setIsEditing(!isEditing)} 
            className={`flex items-center gap-2 px-6 py-2.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${
              isEditing 
              ? "bg-teal-500 text-black shadow-[0_0_20px_rgba(20,184,166,0.3)]" 
              : (isDark ? "bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10" : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm")
            }`}
          >
            {isEditing ? <Check className="w-4 h-4" /> : <Edit2 className="w-4 h-4" />}
            {isEditing ? "Terminer" : "Éditer"}
          </button>
          <div className={`w-px h-10 ${isDark ? "bg-white/10" : "bg-slate-200"} mx-1`} />
          <button 
            onClick={copyToClipboard} 
            className={`flex items-center gap-2 px-6 py-2.5 ${isDark ? "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm"} border rounded-full text-[10px] font-bold uppercase tracking-widest transition-all`}
          >
            {isCopied ? <Check className="w-4 h-4 text-teal-500" /> : <Copy className="w-4 h-4" />}
            {isCopied ? "Copié" : "Copier"}
          </button>
          <button 
            onClick={openDirectSendModal}
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-500 text-black font-bold rounded-full text-[10px] uppercase tracking-widest hover:scale-105 shadow-lg shadow-teal-500/20 transition-all"
          >
            <Send className="w-4 h-4" /> Envoi Direct
          </button>
          <button 
            onClick={shareNative} 
            className="flex items-center gap-2 px-6 py-2.5 bg-teal-500/10 border border-teal-500/20 text-teal-400 rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-teal-500 hover:text-black transition-all"
          >
            <Share2 className="w-4 h-4" /> Partager
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1 min-h-0">
        <div className={`lg:col-span-4 flex flex-col gap-4 transition-all duration-500 ${isEditing ? "opacity-30 grayscale-[0.8] scale-95 pointer-events-none" : "opacity-100"}`}>
          <div className="bg-zinc-900 border border-white/5 rounded-3xl overflow-hidden flex-1 relative flex flex-col p-4 shadow-xl">
             <div className="relative w-full aspect-[3/4] bg-white rounded-xl shadow-lg overflow-hidden mb-4">
               <img src={images[activeImageIndex]} title="Aperçu original" alt="Aperçu original" className="w-full h-full object-contain" />
             </div>
             {images.length > 1 && (
               <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar justify-center">
                 {images.map((img, idx) => (
                   <button 
                     key={idx} 
                     onClick={() => setActiveImageIndex(idx)} 
                     className={`w-10 h-14 border-2 transition-all rounded-lg overflow-hidden shrink-0 ${activeImageIndex === idx ? "border-teal-500 ring-2 ring-teal-500/20" : "border-transparent opacity-50 hover:opacity-80"}`}
                   >
                     <img src={img} alt={`Source ${idx + 1}`} className="w-full h-full object-cover" />
                   </button>
                 ))}
               </div>
             )}
          </div>
        </div>

        <div className={`flex flex-col gap-6 transition-all duration-500 ${isEditing ? "lg:col-span-12" : "lg:col-span-8"}`}>
          <div className={`flex-1 overflow-hidden flex flex-col relative transition-all duration-300 ${
            isEditing 
            ? (isDark ? "bg-zinc-950 border-2 border-teal-500/30 rounded-[2.5rem] shadow-[0_0_50px_rgba(20,184,166,0.1)]" : "bg-white border-2 border-teal-500/40 rounded-[2.5rem] shadow-2xl")
            : (isDark ? "bg-zinc-900 shadow-xl border border-white/5 rounded-3xl" : "bg-white shadow-xl border border-slate-200 rounded-3xl")
          }`}>
            <AnimatePresence>
              {isFormatting && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-black/75 backdrop-blur-sm z-30 flex flex-col items-center justify-center gap-4 text-center p-6 rounded-3xl"
                >
                  <div className="relative">
                    <div className="w-16 h-16 border-t-2 border-b-2 border-teal-500 rounded-full animate-spin" />
                    <Sparkles className="w-6 h-6 text-teal-400 absolute inset-0 m-auto animate-pulse" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-white tracking-tight">Mise en forme IA en cours...</p>
                    <p className="text-xs text-slate-400 leading-relaxed font-light">
                      L'IA de haute précision réorganise et corrige l'écriture manuscrite...
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Prominent Tab Switcher Navigation */}
            <div className={`px-4 sm:px-6 py-3 border-b ${isDark ? "border-white/10 bg-slate-950/80" : "border-slate-200 bg-slate-100/90"} flex flex-wrap items-center justify-between gap-3`}>
              <div className={`flex items-center gap-1.5 ${isDark ? "bg-black/60 border-white/10" : "bg-white border-slate-200 shadow-sm"} p-1.5 rounded-2xl border`}>
                {/* Tab 1: Texte Numérisé */}
                <button
                  type="button"
                  onClick={() => setActiveViewMode("text")}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                    activeViewMode === "text"
                      ? "bg-teal-500 text-black shadow-md shadow-teal-500/20"
                      : (isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900")
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  <span>Texte Numérisé</span>
                </button>

                {/* Tab 2: Tableau de Résultat */}
                <button
                  type="button"
                  onClick={() => {
                    if (!tableData || tableData.length === 0) {
                      handleAutoGenerateTable();
                    } else {
                      setActiveViewMode("table");
                    }
                  }}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                    activeViewMode === "table"
                      ? "bg-teal-500 text-black shadow-md shadow-teal-500/20"
                      : (isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900")
                  }`}
                >
                  <TableIcon className="w-4 h-4" />
                  <span>Tableau de Résultat</span>
                  {tableData && tableData.length > 0 ? (
                    <span className={`px-1.5 py-0.5 ${activeViewMode === "table" ? "bg-black/30 text-black" : (isDark ? "bg-teal-500/20 text-teal-300 border-teal-500/30" : "bg-teal-100 text-teal-800 border-teal-300")} text-[10px] font-mono rounded-full border`}>
                      {tableData.length - 1}L
                    </span>
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-teal-400 animate-ping" />
                  )}
                </button>

                {/* Tab 3: Aperçu Avant Enregistrement */}
                <button
                  type="button"
                  onClick={() => setActiveViewMode("preview")}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                    activeViewMode === "preview"
                      ? "bg-teal-500 text-black shadow-md shadow-teal-500/20"
                      : (isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900")
                  }`}
                  title="Afficher le tableau de résultat et le document avant enregistrement"
                >
                  <Eye className="w-4 h-4" />
                  <span>Aperçu Avant Enregistrement</span>
                </button>
              </div>

              {/* Sub-header Context Controls */}
              {activeViewMode === "text" && (
                <div className="flex flex-wrap items-center gap-2">
                  {/* Font Family (Sans, Serif, Mono) */}
                  <div className={`flex items-center gap-1 ${isDark ? "bg-black/40 border-white/10" : "bg-white border-slate-200 shadow-sm"} p-1 rounded-xl border`} title="Police d'écriture">
                    {(["sans", "serif", "mono"] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setFontFamily(f)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase transition-all ${
                          fontFamily === f ? "bg-teal-500 text-black" : (isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900")
                        } ${f === "serif" ? "font-serif" : f === "mono" ? "font-mono" : "font-sans"}`}
                      >
                        {f === "sans" ? "Sans" : f === "serif" ? "Sérif" : "Mono"}
                      </button>
                    ))}
                  </div>

                  {/* Bold Toggle */}
                  <button
                    type="button"
                    onClick={() => setIsBold(!isBold)}
                    className={`p-1.5 rounded-xl border transition-all ${
                      isBold 
                        ? "bg-teal-500 text-black border-teal-500 font-bold shadow-sm" 
                        : (isDark ? "bg-black/40 border-white/10 text-slate-400 hover:text-white" : "bg-white border-slate-200 text-slate-600 hover:text-slate-900 shadow-sm")
                    }`}
                    title="Texte en gras pour une lisibilité accrue"
                  >
                    <Bold className="w-3.5 h-3.5" />
                  </button>

                  {/* Text Color / Contraste des écrits */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsColorMenuOpen(!isColorMenuOpen)}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-[10px] font-bold uppercase tracking-wider transition-all ${
                        isColorMenuOpen || textColor !== "default"
                          ? "bg-teal-500 text-black border-teal-400 shadow-sm"
                          : (isDark ? "bg-black/40 border-white/10 text-slate-300 hover:text-white" : "bg-white border-slate-200 text-slate-700 hover:text-slate-900 shadow-sm")
                      }`}
                      title="Couleur et contraste du texte"
                    >
                      <Palette className="w-3.5 h-3.5" />
                      <span>Couleur</span>
                    </button>

                    <AnimatePresence>
                      {isColorMenuOpen && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setIsColorMenuOpen(false)} />
                          <motion.div
                            initial={{ opacity: 0, y: 8, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 8, scale: 0.95 }}
                            className={`absolute right-0 mt-2 w-56 ${isDark ? "bg-zinc-900 border-white/10 text-white" : "bg-white border-slate-200 text-slate-900 shadow-2xl"} border rounded-2xl p-3 shadow-2xl z-50 space-y-1.5`}
                          >
                            <div className="text-[10px] font-bold uppercase tracking-wider text-teal-500 pb-1 border-b border-white/5">
                              Couleur des écrits
                            </div>
                            
                            <button
                              onClick={() => { setTextColor("default"); setIsColorMenuOpen(false); }}
                              className={`w-full flex items-center justify-between p-2 rounded-xl text-xs transition-all ${textColor === "default" ? "bg-teal-500/20 text-teal-400 font-bold" : (isDark ? "hover:bg-white/5 text-slate-300" : "hover:bg-slate-100 text-slate-700")}`}
                            >
                              <span>Standard Adaptatif</span>
                              <div className={`w-3.5 h-3.5 rounded-full ${isDark ? "bg-slate-200" : "bg-slate-800"}`} />
                            </button>

                            <button
                              onClick={() => { setTextColor("high-contrast"); setIsColorMenuOpen(false); }}
                              className={`w-full flex items-center justify-between p-2 rounded-xl text-xs transition-all ${textColor === "high-contrast" ? "bg-teal-500/20 text-teal-400 font-bold" : (isDark ? "hover:bg-white/5 text-slate-300" : "hover:bg-slate-100 text-slate-700")}`}
                            >
                              <span>Contraste Maximum</span>
                              <div className={`w-3.5 h-3.5 rounded-full ${isDark ? "bg-white" : "bg-black"}`} />
                            </button>

                            <button
                              onClick={() => { setTextColor("emerald"); setIsColorMenuOpen(false); }}
                              className={`w-full flex items-center justify-between p-2 rounded-xl text-xs transition-all ${textColor === "emerald" ? "bg-teal-500/20 text-teal-400 font-bold" : (isDark ? "hover:bg-white/5 text-slate-300" : "hover:bg-slate-100 text-slate-700")}`}
                            >
                              <span>Émeraude / Vert</span>
                              <div className="w-3.5 h-3.5 rounded-full bg-emerald-500" />
                            </button>

                            <button
                              onClick={() => { setTextColor("indigo"); setIsColorMenuOpen(false); }}
                              className={`w-full flex items-center justify-between p-2 rounded-xl text-xs transition-all ${textColor === "indigo" ? "bg-teal-500/20 text-teal-400 font-bold" : (isDark ? "hover:bg-white/5 text-slate-300" : "hover:bg-slate-100 text-slate-700")}`}
                            >
                              <span>Indigo / Bleu Royal</span>
                              <div className="w-3.5 h-3.5 rounded-full bg-indigo-500" />
                            </button>

                            <button
                              onClick={() => { setTextColor("sepia"); setIsColorMenuOpen(false); }}
                              className={`w-full flex items-center justify-between p-2 rounded-xl text-xs transition-all ${textColor === "sepia" ? "bg-teal-500/20 text-teal-400 font-bold" : (isDark ? "hover:bg-white/5 text-slate-300" : "hover:bg-slate-100 text-slate-700")}`}
                            >
                              <span>Sépia / Confort Livre</span>
                              <div className="w-3.5 h-3.5 rounded-full bg-amber-600" />
                            </button>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Font Size Selector */}
                  <div className={`flex items-center gap-1 ${isDark ? "bg-black/40 border-white/10" : "bg-white border-slate-200 shadow-sm"} p-1 rounded-xl border`} title="Taille de la police">
                    <Type className={`w-3.5 h-3.5 ${isDark ? "text-slate-400" : "text-slate-500"} ml-1.5`} />
                    {(["sm", "base", "lg", "xl"] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setTextSize(s)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase transition-all ${
                          textSize === s ? "bg-teal-500 text-black" : (isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900")
                        }`}
                      >
                        {s === "sm" ? "A-" : s === "base" ? "A" : s === "lg" ? "A+" : "A++"}
                      </button>
                    ))}
                  </div>

                  {/* Line Spacing / Interligne */}
                  <div className={`flex items-center gap-1 ${isDark ? "bg-black/40 border-white/10" : "bg-white border-slate-200 shadow-sm"} p-1 rounded-xl border`} title="Espacement des lignes et paragraphes">
                    {(["normal", "relaxed", "loose"] as const).map((spacing) => (
                      <button
                        key={spacing}
                        type="button"
                        onClick={() => setLineSpacing(spacing)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase transition-all ${
                          lineSpacing === spacing ? "bg-teal-500 text-black" : (isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900")
                        }`}
                      >
                        {spacing === "normal" ? "1.0" : spacing === "relaxed" ? "1.5" : "2.0"}
                      </button>
                    ))}
                  </div>

                  {/* Text Alignment */}
                  <div className={`flex items-center gap-1 ${isDark ? "bg-black/40 border-white/10" : "bg-white border-slate-200 shadow-sm"} p-1 rounded-xl border`} title="Alignement du texte">
                    <button
                      type="button"
                      onClick={() => setTextAlign("left")}
                      className={`p-1.5 rounded-lg transition-all ${textAlign === "left" ? "bg-teal-500 text-black" : (isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900")}`}
                      title="Aligner à gauche"
                    >
                      <AlignLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setTextAlign("center")}
                      className={`p-1.5 rounded-lg transition-all ${textAlign === "center" ? "bg-teal-500 text-black" : (isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900")}`}
                      title="Centrer le texte"
                    >
                      <AlignCenter className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setTextAlign("justify")}
                      className={`p-1.5 rounded-lg transition-all ${textAlign === "justify" ? "bg-teal-500 text-black" : (isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900")}`}
                      title="Justifier le texte"
                    >
                      <AlignJustify className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Clean line breaks button */}
                  <button
                    type="button"
                    onClick={handleUnwrapLinesOnly}
                    className={`flex items-center gap-1.5 px-3 py-1.5 ${isDark ? "bg-teal-500/10 border-teal-500/25 text-teal-300 hover:bg-teal-500 hover:text-black" : "bg-teal-50 border-teal-300 text-teal-800 hover:bg-teal-500 hover:text-white"} border rounded-xl text-[10px] font-bold tracking-wide transition-all shadow-sm group`}
                    title="Supprimer les sauts de ligne intempestifs et conserver uniquement les vrais paragraphes"
                  >
                    <WrapText className="w-3.5 h-3.5 text-teal-500 group-hover:text-inherit transition-colors" />
                    <span>Paragraphes Purs</span>
                  </button>
                </div>
              )}

              {activeViewMode === "table" && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAutoGenerateTable}
                    className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 transition-all ${
                      isDark ? "bg-teal-500/15 border-teal-500/30 text-teal-300 hover:bg-teal-500 hover:text-black" : "bg-teal-50 border-teal-300 text-teal-800 hover:bg-teal-100"
                    }`}
                    title="Régénérer le tableau à partir du texte numérisé"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Régénérer depuis le texte</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleExportInitiation("excel")}
                    className="px-3.5 py-1.5 bg-teal-500 hover:bg-teal-400 text-black text-[11px] font-bold rounded-xl flex items-center gap-1.5 shadow-md transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Enregistrer Excel</span>
                  </button>
                </div>
              )}

              {activeViewMode === "preview" && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleExportInitiation("excel")}
                    className="px-3.5 py-1.5 bg-teal-500 hover:bg-teal-400 text-black text-[11px] font-bold rounded-xl flex items-center gap-1.5 shadow-md transition-all"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Enregistrer le Résultat</span>
                  </button>
                </div>
              )}
            </div>

            {/* TAB CONTENT 1: Texte Numérisé */}
            {activeViewMode === "text" && (
              <div className="flex-1 flex flex-col min-h-[460px] relative overflow-hidden">
                {isEditing ? (
                  <textarea
                    value={editableText}
                    onChange={(e) => setEditableText(e.target.value)}
                    className={`flex-1 w-full p-6 bg-transparent outline-none resize-none leading-relaxed text-sm ${
                      fontFamily === "serif" ? "font-serif" : fontFamily === "mono" ? "font-mono" : "font-sans"
                    } ${isBold ? "font-bold" : "font-normal"} ${
                      textColor === "high-contrast" 
                        ? (isDark ? "text-white" : "text-black") 
                        : textColor === "emerald" 
                        ? (isDark ? "text-emerald-300" : "text-emerald-900")
                        : textColor === "indigo"
                        ? (isDark ? "text-indigo-300" : "text-indigo-900")
                        : textColor === "sepia"
                        ? (isDark ? "text-amber-200" : "text-amber-950")
                        : (isDark ? "text-slate-100" : "text-slate-900")
                    } custom-scrollbar`}
                    placeholder="Saisissez ou modifiez le texte du document ici..."
                  />
                ) : (
                  <div className="flex-1 flex flex-col justify-between overflow-hidden">
                    <div className="flex-1 p-6 overflow-y-auto custom-scrollbar">
                      {editableText.trim() === "" ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-500">
                          <FileText className="w-12 h-12 mb-3 opacity-40 text-teal-500" />
                          <p className="text-sm font-medium">Aucun texte extrait</p>
                          <p className="text-xs text-slate-400 mt-1">Activez le mode édition ou relancez une numérisation.</p>
                        </div>
                      ) : (
                        <div className={`whitespace-pre-wrap ${
                          fontFamily === "serif" ? "font-serif" : fontFamily === "mono" ? "font-mono" : "font-sans"
                        } ${
                          textSize === "sm" ? "text-xs sm:text-sm" : textSize === "base" ? "text-sm sm:text-base" : textSize === "lg" ? "text-base sm:text-lg" : "text-lg sm:text-xl"
                        } ${
                          lineSpacing === "normal" ? "leading-normal" : lineSpacing === "relaxed" ? "leading-relaxed" : "leading-loose"
                        } ${
                          textAlign === "center" ? "text-center" : textAlign === "justify" ? "text-justify" : "text-left"
                        } ${isBold ? "font-bold" : "font-normal"} ${
                          textColor === "high-contrast" 
                            ? (isDark ? "text-white" : "text-black") 
                            : textColor === "emerald" 
                            ? (isDark ? "text-emerald-300" : "text-emerald-900")
                            : textColor === "indigo"
                            ? (isDark ? "text-indigo-300" : "text-indigo-900")
                            : textColor === "sepia"
                            ? (isDark ? "text-amber-200" : "text-amber-950")
                            : (isDark ? "text-slate-100" : "text-slate-900")
                        }`}>
                          {editableText}
                        </div>
                      )}
                    </div>

                    {/* Integrated TTS Audio Reader Bar */}
                    <div className={`px-6 py-2.5 border-t ${isDark ? "border-white/5 bg-black/40" : "border-slate-200 bg-slate-50"} flex flex-wrap items-center justify-between gap-3 text-xs`}>
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-teal-500/10 text-teal-400 rounded-lg">
                          <Volume2 className="w-3.5 h-3.5" />
                        </div>
                        <span className={`text-[11px] font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                          Lecture vocale du texte
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {isPlayingAudio ? (
                          <button
                            type="button"
                            onClick={handlePauseAudio}
                            className="px-3 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg font-bold flex items-center gap-1.5 text-xs hover:bg-amber-500/30"
                          >
                            <Pause className="w-3 h-3" />
                            <span>Pause</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handlePlayAudio}
                            className="px-3 py-1 bg-teal-500 hover:bg-teal-400 text-black font-bold rounded-lg flex items-center gap-1.5 text-xs transition-all shadow-sm"
                          >
                            <Play className="w-3 h-3 fill-black" />
                            <span>{isPausedAudio ? "Reprendre" : "Écouter"}</span>
                          </button>
                        )}

                        {(isPlayingAudio || isPausedAudio) && (
                          <button
                            type="button"
                            onClick={handleStopAudio}
                            className="p-1 bg-red-500/20 text-red-300 border border-red-500/30 rounded-lg"
                            title="Arrêter"
                          >
                            <Square className="w-3 h-3" />
                          </button>
                        )}

                        <div className="flex items-center gap-1 bg-black/30 border border-white/10 rounded-lg p-0.5">
                          {[0.8, 1, 1.25].map((rate) => (
                            <button
                              key={rate}
                              type="button"
                              onClick={() => setSpeechRate(rate)}
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                speechRate === rate ? "bg-teal-500 text-black" : "text-slate-400 hover:text-white"
                              }`}
                            >
                              {rate}x
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB CONTENT 2: Tableau de Résultat */}
            {activeViewMode === "table" && (
              <div className="flex-1 w-full min-h-[500px] flex flex-col overflow-hidden p-2 sm:p-4">
                {tableData && tableData.length > 0 ? (
                  <TableView
                    initialData={tableData}
                    onDataChange={(newData) => setTableData(newData)}
                    fileName={fileName}
                    isEditable={true}
                  />
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-4">
                    <div className="w-16 h-16 rounded-3xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 shadow-xl">
                      <TableIcon className="w-8 h-8" />
                    </div>
                    <div className="space-y-1.5 max-w-md">
                      <h3 className="text-base font-bold text-white">Tableau de Résultat Non Généré</h3>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Extrayez et convertissez les colonnes et lignes du texte numérisé pour visualiser, éditer et exporter le tableau avant son enregistrement.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3 pt-2 justify-center">
                      <button
                        type="button"
                        onClick={handleAutoGenerateTable}
                        className="px-5 py-2.5 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-black font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-teal-500/20 flex items-center gap-2 transition-all"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>Générer automatiquement le tableau</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const sample = [
                            ["N°", "Désignation", "Quantité", "Montant / Note"],
                            ["1", "Article 1", "1", "10.00"],
                            ["2", "Article 2", "2", "25.50"],
                          ];
                          setTableData(sample);
                        }}
                        className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 rounded-xl text-xs font-semibold transition-all"
                      >
                        Créer un tableau vierge
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB CONTENT 3: Aperçu Avant Enregistrement */}
            {activeViewMode === "preview" && (
              <div className="flex-1 flex flex-col min-h-[480px] p-4 sm:p-6 space-y-5 overflow-y-auto no-scrollbar">
                {/* Header Summary Card */}
                <div className={`p-4 rounded-2xl border ${isDark ? "bg-black/40 border-teal-500/20" : "bg-teal-50/80 border-teal-200"} flex flex-wrap items-center justify-between gap-4`}>
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-teal-500/20 text-teal-400 rounded-2xl border border-teal-500/30">
                      <Eye className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white flex items-center gap-2">
                        <span>Aperçu de validation avant enregistrement</span>
                        <span className="px-2 py-0.5 bg-teal-500/20 text-teal-300 text-[10px] rounded-full">
                          Prêt pour export
                        </span>
                      </h4>
                      <p className="text-xs text-slate-400">
                        Document : <strong>{fileName}</strong> • {wordCount} mots {tableData ? `• Tableau : ${tableData.length - 1} lignes` : ""}
                      </p>
                    </div>
                  </div>

                  {/* Sub-toggle: Tableau vs Document */}
                  <div className="flex items-center gap-1.5 bg-black/50 border border-white/10 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setPreviewSubTab("table")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                        previewSubTab === "table" ? "bg-teal-500 text-black" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      <TableIcon className="w-3.5 h-3.5" />
                      <span>Tableau de Résultat</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewSubTab("document")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                        previewSubTab === "document" ? "bg-teal-500 text-black" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Document Complet</span>
                    </button>
                  </div>
                </div>

                {/* Sub-view: Result Table Preview */}
                {previewSubTab === "table" && (
                  <div className="space-y-4">
                    {tableData && tableData.length > 0 ? (
                      <div className="border border-white/10 rounded-2xl overflow-hidden bg-black/40 shadow-xl">
                        <div className="px-4 py-2.5 bg-slate-900/90 border-b border-white/10 flex items-center justify-between text-xs">
                          <span className="text-teal-400 font-bold flex items-center gap-2">
                            <TableIcon className="w-4 h-4" />
                            Tableau de Résultat ({tableData.length - 1} lignes × {tableData[0]?.length || 0} colonnes)
                          </span>
                          <button
                            type="button"
                            onClick={() => setActiveViewMode("table")}
                            className="text-xs text-teal-400 hover:underline flex items-center gap-1"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>Modifier les cellules</span>
                          </button>
                        </div>
                        <div className="overflow-x-auto max-h-72 p-2">
                          <table className="min-w-full divide-y divide-white/10 text-xs text-left">
                            <thead className="bg-slate-950/80 text-teal-300 font-mono text-[10px] uppercase">
                              <tr>
                                <th className="px-3 py-2 w-8 text-center text-slate-500 border-r border-white/10">#</th>
                                {tableData[0]?.map((col, cIdx) => (
                                  <th key={cIdx} className="px-3 py-2 border-r border-white/10 whitespace-nowrap">
                                    {col || `Col ${cIdx + 1}`}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 text-slate-200">
                              {tableData.slice(1).map((row, rIdx) => (
                                <tr key={rIdx} className={rIdx % 2 === 0 ? "bg-black/10" : "bg-white/[0.02]"}>
                                  <td className="px-3 py-1.5 text-center text-slate-500 font-mono text-[10px] border-r border-white/10">
                                    {rIdx + 1}
                                  </td>
                                  {row.map((cell, cIdx) => (
                                    <td key={cIdx} className="px-3 py-1.5 border-r border-white/10 whitespace-nowrap max-w-[200px] truncate text-slate-300">
                                      {cell || "—"}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div className="p-8 border border-white/10 rounded-2xl bg-black/30 text-center space-y-3">
                        <TableIcon className="w-8 h-8 text-slate-500 mx-auto" />
                        <p className="text-xs text-slate-400">Aucun tableau structuré n'a encore été créé pour ce scan.</p>
                        <button
                          type="button"
                          onClick={handleAutoGenerateTable}
                          className="px-4 py-2 bg-teal-500 hover:bg-teal-400 text-black font-bold text-xs rounded-xl shadow-md inline-flex items-center gap-1.5"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Générer le tableau maintenant</span>
                        </button>
                      </div>
                    )}

                    {/* Quick export shortcuts right from the preview tab */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => handleExportInitiation("excel")}
                        className="p-3 bg-teal-500/15 hover:bg-teal-500 hover:text-black border border-teal-500/30 text-teal-300 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 group shadow-md"
                      >
                        <FileSpreadsheet className="w-4 h-4 text-teal-400 group-hover:text-black" />
                        <span>Enregistrer Excel</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleExportInitiation("csv")}
                        className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                      >
                        <TableIcon className="w-4 h-4 text-amber-400" />
                        <span>Enregistrer CSV</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleExportInitiation("pdf")}
                        className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                      >
                        <FileText className="w-4 h-4 text-red-400" />
                        <span>Enregistrer PDF</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleExportInitiation("word")}
                        className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                      >
                        <FileText className="w-4 h-4 text-blue-400" />
                        <span>Enregistrer Word</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Sub-view: Transcribed Document Preview */}
                {previewSubTab === "document" && (
                  <div className="space-y-4">
                    <div className="p-5 border border-white/10 rounded-2xl bg-black/40 max-h-72 overflow-y-auto custom-scrollbar text-xs leading-relaxed text-slate-200 whitespace-pre-wrap font-sans">
                      {editableText}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => handleExportInitiation("pdf")}
                        className="p-3 bg-teal-500/15 hover:bg-teal-500 hover:text-black border border-teal-500/30 text-teal-300 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 group"
                      >
                        <FileText className="w-4 h-4 text-red-400 group-hover:text-black" />
                        <span>Enregistrer PDF</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleExportInitiation("word")}
                        className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                      >
                        <FileText className="w-4 h-4 text-blue-400" />
                        <span>Enregistrer Word (.docx)</span>
                      </button>

                      <button
                        type="button"
                        onClick={openDirectSendModal}
                        className="p-3 bg-emerald-500/15 hover:bg-emerald-500 hover:text-black border border-emerald-500/30 text-emerald-300 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 group"
                      >
                        <Send className="w-4 h-4 text-emerald-400 group-hover:text-black" />
                        <span>Envoi Direct</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {isEditing && activeViewMode === "text" && (
              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className={`absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-6 py-3 ${isDark ? "bg-zinc-900 border-white/10" : "bg-white border-slate-200"} border rounded-2xl shadow-2xl z-10`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-teal-500 rounded-full animate-pulse" />
                  <span className="text-[10px] uppercase font-bold tracking-widest text-teal-500">Sauvegarde automatique active</span>
                </div>
                <div className={`w-px h-4 ${isDark ? "bg-white/10" : "bg-slate-200"}`} />
                <button 
                  onClick={() => setIsEditing(false)}
                  className={`text-[10px] uppercase font-bold tracking-widest ${isDark ? "text-white hover:text-teal-400" : "text-slate-900 hover:text-teal-600"} transition-colors`}
                >
                  Valider les modifications
                </button>
              </motion.div>
            )}
          </div>

          <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 transition-all duration-300 ${isEditing ? "opacity-50 pointer-events-none" : "opacity-100"}`}>
            <button 
              onClick={openDirectSendModal}
              className="flex items-center justify-center gap-2 py-4 bg-teal-500/15 border border-teal-500/30 rounded-2xl hover:bg-teal-500 hover:text-black transition-all group text-teal-400 hover:text-black"
            >
              <Send className="w-4 h-4 text-teal-400 group-hover:text-black" />
              <span className="text-[10px] uppercase font-bold tracking-widest">Envoi Direct</span>
            </button>

            {images && images.length > 0 && (
              <button 
                onClick={handleDownloadRawScanImages}
                className="flex items-center justify-center gap-2 py-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl hover:bg-emerald-500/20 transition-all group text-emerald-400"
                title="Télécharger les numérisations HD d'origine"
              >
                <Download className="w-4 h-4 text-emerald-400" />
                <span className="text-[10px] uppercase font-bold tracking-widest">Images HD</span>
              </button>
            )}

            <button 
              onClick={() => handleExportInitiation("pdf")}
              className="flex items-center justify-center gap-2 py-4 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all group"
              title="Générer le PDF numérisé direct"
            >
              <FileText className="w-4 h-4 text-red-400" />
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-300 group-hover:text-white">PDF Scan</span>
            </button>

            <button 
              onClick={() => handleExportInitiation("word")}
              className="flex items-center justify-center gap-2 py-4 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all group"
              title="Exporter au format Microsoft Word (.docx)"
            >
              <FileText className="w-4 h-4 text-blue-400" />
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400 group-hover:text-white">DOCX</span>
            </button>

            <button 
              onClick={() => handleExportInitiation("excel")}
              className="flex items-center justify-center gap-2 py-4 border rounded-2xl transition-all group bg-teal-500/10 border-teal-500/30 text-teal-400 hover:bg-teal-500 hover:text-black shadow-md"
              title="Exporter le tableau extrait au format Excel (.xlsx)"
            >
              <TableIcon className="w-4 h-4 text-teal-400 group-hover:text-black" />
              <span className="text-[10px] uppercase font-bold tracking-widest text-teal-400 group-hover:text-black">EXCEL</span>
            </button>
          </div>

          {/* Bottom Back / Vas-et-Viens navigation bar */}
          <div className="pt-2 border-t border-white/5 flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={onReset}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-zinc-900 hover:bg-teal-500/20 text-slate-300 hover:text-teal-300 border border-white/10 hover:border-teal-500/40 transition-all text-xs font-mono font-bold group shadow-md"
            >
              <ArrowLeft className="w-4 h-4 text-teal-400 group-hover:-translate-x-1 transition-transform" />
              <span>Retourner au Scanner (Vas-et-viens)</span>
            </button>
            <span className="text-[10px] text-slate-500 font-mono">
              💡 Astuce : Votre texte reste conservé lorsque vous revenez au scanner
            </span>
          </div>
        </div>
      </div>


    </motion.div>
  );
}
