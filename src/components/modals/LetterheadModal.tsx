import React, { useState } from 'react';
import { PrintSettings } from '../../types';
import {
  generateBlankLetterheadPdf,
  downloadPdfFile,
  openPdfDirectly,
  GeneratedPdfResult,
} from '../../utils/pdfGenerator';

interface LetterheadModalProps {
  settings: PrintSettings;
  customLogo?: string | null;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export const LetterheadModal: React.FC<LetterheadModalProps> = ({
  settings,
  customLogo,
  onClose,
  onToast,
}) => {
  const defaultDate = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const [documentTitle, setDocumentTitle] = useState('');
  const [dateStr, setDateStr] = useState(defaultDate);
  const [recipientName, setRecipientName] = useState('');
  const [recipientInfo, setRecipientInfo] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [showBlankLines, setShowBlankLines] = useState(false);
  const [includeSignatureLine, setIncludeSignatureLine] = useState(false);
  const [generating, setGenerating] = useState(false);

  const buildPdf = async (): Promise<GeneratedPdfResult> => {
    return generateBlankLetterheadPdf(
      {
        documentTitle,
        dateStr,
        recipientName,
        recipientInfo,
        bodyText,
        showBlankLines,
        includeSignatureLine,
      },
      settings,
      customLogo || undefined
    );
  };

  const handleOpenPdf = async () => {
    // Open window synchronously during user click to bypass popup blockers
    const preWin = window.open('', '_blank');
    setGenerating(true);
    try {
      const result = await buildPdf();
      openPdfDirectly(result, preWin);
      onToast('✔ Opened Official Letterhead PDF');
    } catch (err) {
      if (preWin && !preWin.closed) preWin.close();
      console.error('Letterhead PDF error:', err);
      onToast('Failed to generate letterhead PDF');
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadPdf = async () => {
    setGenerating(true);
    try {
      const result = await buildPdf();
      downloadPdfFile(result);
      onToast(`✔ Downloaded ${result.fileName}`);
    } catch (err) {
      console.error('Letterhead PDF download error:', err);
      onToast('Failed to download letterhead PDF');
    } finally {
      setGenerating(false);
    }
  };

  const handleClear = () => {
    setDocumentTitle('');
    setDateStr(defaultDate);
    setRecipientName('');
    setRecipientInfo('');
    setBodyText('');
    setShowBlankLines(false);
    setIncludeSignatureLine(false);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-sm flex flex-col p-2.5 sm:p-5 overflow-y-auto animate-in fade-in">
      <form
        autoComplete="off"
        onSubmit={(e) => e.preventDefault()}
        className="max-w-xl w-full mx-auto bg-[var(--surface)] border border-[#f1c40f]/50 rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4 my-auto"
      >
        {/* Branded Black-and-Yellow Header */}
        <div className="bg-[#111111] border-b-4 border-[#f1c40f] rounded-xl p-3.5 flex items-start justify-between gap-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-[#f1c40f]">
              Krueger Painting • Official Stationery
            </div>
            <h2 className="text-base sm:text-lg font-black text-white mt-0.5">
              Blank Business Letterhead PDF
            </h2>
            <p className="text-[10.5px] text-gray-300 mt-0.5">
              (262) 443-1199 • krueptg@gmail.com • kruegerpaintingwi.com
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="bg-white/10 hover:bg-white/20 text-white font-bold text-xs px-2.5 py-1.5 rounded-lg cursor-pointer shrink-0"
          >
            ✕ Close
          </button>
        </div>

        {/* Tip Banner */}
        <div className="bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl px-3 py-2 text-[11px] text-[var(--text-muted)]">
          💡 Leave fields blank for a clean printable letterhead, or type a custom letter/notice below.
        </div>

        {/* Title & Date */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="sm:col-span-2">
            <label className="text-[9.5px] uppercase font-bold text-[var(--text-muted)] tracking-wider block mb-1">
              Document Title (Optional)
            </label>
            <input
              type="text"
              autoComplete="off"
              value={documentTitle}
              onChange={(e) => setDocumentTitle(e.target.value)}
              placeholder="e.g. Change Order, Project Notice, Warranty Letter..."
              className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[#f1c40f] text-[var(--text)] rounded-lg px-3 py-2 text-xs outline-none"
            />
          </div>
          <div>
            <label className="text-[9.5px] uppercase font-bold text-[var(--text-muted)] tracking-wider block mb-1">
              Date (Optional)
            </label>
            <input
              type="text"
              autoComplete="off"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              placeholder="Leave blank to omit"
              className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[#f1c40f] text-[var(--text)] rounded-lg px-3 py-2 text-xs outline-none"
            />
          </div>
        </div>

        {/* Recipient Info (Optional) */}
        <div className="bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl p-3 space-y-2">
          <div className="text-[9.5px] uppercase font-extrabold text-[#f1c40f] tracking-wider">
            Recipient Info (Optional)
          </div>
          <input
            type="text"
            autoComplete="off"
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            placeholder="Recipient Name or Company (e.g. John & Sarah Miller)"
            className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[#f1c40f] text-[var(--text)] rounded-lg px-3 py-2 text-xs outline-none"
          />
          <textarea
            rows={2}
            autoComplete="off"
            value={recipientInfo}
            onChange={(e) => setRecipientInfo(e.target.value)}
            placeholder="Street address, phone, or email (optional)..."
            className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[#f1c40f] text-[var(--text)] rounded-lg px-3 py-2 text-xs outline-none"
          />
        </div>

        {/* Body Text */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[9.5px] uppercase font-bold text-[var(--text-muted)] tracking-wider">
              Body Text (Optional — leave blank for handwritten notes)
            </label>
            {(documentTitle || recipientName || recipientInfo || bodyText) && (
              <button
                type="button"
                onClick={handleClear}
                className="text-[10px] font-bold text-red-400 hover:underline cursor-pointer"
              >
                Reset / Clear
              </button>
            )}
          </div>
          <textarea
            rows={7}
            autoComplete="off"
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            placeholder="Type your custom letter, project memo, or special terms here — or leave empty for a clean blank Krueger Painting letterhead..."
            className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[#f1c40f] text-[var(--text)] rounded-xl p-3 text-xs leading-relaxed outline-none"
          />
        </div>

        {/* Formatting Toggles */}
        <div className="flex flex-wrap gap-3 text-xs bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl p-3">
          <label className="flex items-center gap-2 cursor-pointer text-[var(--text)] font-semibold">
            <input
              type="checkbox"
              checked={showBlankLines}
              onChange={(e) => setShowBlankLines(e.target.checked)}
              disabled={bodyText.trim().length > 0}
              className="w-4 h-4 accent-[#f1c40f]"
            />
            <span className={bodyText.trim().length > 0 ? 'opacity-50' : ''}>
              Add light ruled writing lines (blank mode)
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-[var(--text)] font-semibold">
            <input
              type="checkbox"
              checked={includeSignatureLine}
              onChange={(e) => setIncludeSignatureLine(e.target.checked)}
              className="w-4 h-4 accent-[#f1c40f]"
            />
            <span>Include signature &amp; date line at bottom</span>
          </label>
        </div>

        {/* Direct 1-Tap Action Buttons (No Intermediate Preview) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            disabled={generating}
            onClick={handleOpenPdf}
            className="py-3 bg-[#f1c40f] hover:bg-[#d4ac0d] text-[#111111] font-black uppercase tracking-wider text-xs rounded-xl shadow-lg cursor-pointer transition-transform active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <span>📄</span>
            <span>{generating ? 'Generating...' : 'Open PDF'}</span>
          </button>
          <button
            type="button"
            disabled={generating}
            onClick={handleDownloadPdf}
            className="py-3 bg-[#111111] hover:bg-[#1c1d25] text-[#f1c40f] border-2 border-[#f1c40f] font-black uppercase tracking-wider text-xs rounded-xl shadow cursor-pointer transition-transform active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <span>💾</span>
            <span>{generating ? 'Generating...' : 'Download PDF'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
