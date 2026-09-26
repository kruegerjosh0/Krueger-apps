import React, { useState, useEffect } from 'react';
import { GeneratedPdfResult, downloadPdfFile, sharePdfFile } from '../../utils/pdfGenerator';
import { Customer } from '../../types';

interface PdfPreviewModalProps {
  pdfResult: GeneratedPdfResult | null;
  customer?: Customer | null;
  onClose: () => void;
  onSaveToCustomerFiles?: (file: { name: string; data: string; tag: 'ESTIMATE' | 'BILL' }) => void;
  onToast: (msg: string) => void;
}

export const PdfPreviewModal: React.FC<PdfPreviewModalProps> = ({
  pdfResult,
  customer,
  onClose,
  onSaveToCustomerFiles,
  onToast,
}) => {
  const [archived, setArchived] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(100);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!pdfResult) return null;

  const handleDownload = () => {
    downloadPdfFile(pdfResult);
    onToast('✔ PDF Downloaded to Device');
  };

  const handleOpenInNewTab = () => {
    try {
      // In modern mobile browsers (especially Chrome on Android), window.open with a blob URL
      const win = window.open(pdfResult.blobUrl, '_blank', 'noopener,noreferrer');
      if (!win) {
        const link = document.createElement('a');
        link.href = pdfResult.blobUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      onToast('Opening full-page PDF in new window...');
    } catch {
      handleDownload();
      onToast('PDF downloaded! (Browser sandbox prevented new window popup)');
    }
  };

  const handleShare = async () => {
    const success = await sharePdfFile(
      pdfResult,
      pdfResult.fileName,
      `Krueger Painting Project Document for ${customer?.name || 'Client'}`
    );
    if (success) {
      onToast('✔ Shared PDF Document');
    }
  };

  const handleEmailClient = () => {
    const subject = encodeURIComponent(`Krueger Painting - ${pdfResult.fileName.replace('.pdf', '')}`);
    const body = encodeURIComponent(
      `Hi ${customer?.name || 'Customer'},\n\nPlease find your project document from Krueger Painting attached.\n\nProject Total: $${pdfResult.grossTotal}\nBalance Due: $${pdfResult.balanceDue}\n\nBest regards,\nJosh Krueger\nKrueger Painting\n(262) 443-1199`
    );
    const toEmail = encodeURIComponent(customer?.email || '');

    // Download PDF first so user can attach it immediately
    handleDownload();
    window.location.href = `mailto:${toEmail}?subject=${subject}&body=${body}`;
    onToast('✔ Opening email client with document details! (PDF downloaded to attach)');
  };

  const handleEmail = () => {
    handleEmailClient();
  };

  const handlePrint = () => {
    // In sandboxed web apps/iframes, modern browsers restrict direct window.print() triggers.
    try {
      const iframe = document.getElementById('pdf-preview-iframe') as HTMLIFrameElement;
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        onToast('Sent document to printer dialog');
        return;
      }
    } catch {
      // Browser sandbox restricted direct print
    }

    // Direct download ensures the contractor can open and print immediately from their computer/device
    handleDownload();
    onToast('✔ PDF downloaded for instant printing (browser blocked embedded print dialog)');
  };

  const handleArchive = () => {
    if (!onSaveToCustomerFiles || !customer) return;
    const tag = pdfResult.fileName.toLowerCase().includes('invoice') || pdfResult.fileName.toLowerCase().includes('bill') ? 'BILL' : 'ESTIMATE';
    onSaveToCustomerFiles({
      name: pdfResult.fileName,
      data: pdfResult.dataUrl,
      tag,
    });
    setArchived(true);
    onToast(`✔ Saved permanently to ${customer.name}'s file cabinet`);
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/90 backdrop-blur-md flex flex-col p-2 sm:p-4 text-[var(--text)] select-none animate-in fade-in overflow-hidden">
      {/* Top Action Bar - Guaranteed never to overflow on folded or narrow phones */}
      <div className="max-w-4xl w-full mx-auto border-b border-[var(--border)] pb-2.5 mb-2 shrink-0 space-y-1.5">
        {/* Row 1: Back/Close, Document Title, and View in Other Tab */}
        <div className="flex items-center justify-between gap-1.5 sm:gap-3">
          {/* Primary Back / Close button (Always on screen) */}
          <button
            type="button"
            onClick={onClose}
            className="bg-[var(--surface-subtle)] hover:bg-[var(--border)] active:scale-95 text-[var(--text)] px-2.5 sm:px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-extrabold border border-[var(--border)] flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs transition-transform"
            title="Go back to previous page"
          >
            <span className="text-sm">←</span>
            <span>Close</span>
          </button>

          {/* Title - truncated so it never pushes buttons off screen */}
          <div className="min-w-0 flex-1 px-1 sm:px-2">
            <h3
              className="font-extrabold text-xs sm:text-base text-[#f1c40f] tracking-wide flex items-center gap-1.5 truncate"
              title={pdfResult.fileName}
            >
              <span className="shrink-0">📄</span>
              <span className="truncate">{pdfResult.fileName}</span>
            </h3>
            <p className="text-[10px] text-[var(--text-muted)] font-mono truncate hidden sm:block">
              Official Krueger Vector PDF • {customer?.name || 'Client Document'}
            </p>
          </div>

          {/* Desktop Zoom controls */}
          <div className="hidden md:flex items-center bg-[#1c1d25] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-gray-300 gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setZoomLevel((prev) => Math.max(50, prev - 15))}
              className="px-1.5 hover:text-white font-bold cursor-pointer"
              title="Zoom out"
            >
              −
            </button>
            <span className="text-[10px] font-bold min-w-8 text-center">{zoomLevel}%</span>
            <button
              type="button"
              onClick={() => setZoomLevel((prev) => Math.min(200, prev + 15))}
              className="px-1.5 hover:text-white font-bold cursor-pointer"
              title="Zoom in"
            >
              +
            </button>
            {zoomLevel !== 100 && (
              <button
                type="button"
                onClick={() => setZoomLevel(100)}
                className="text-[9px] text-[#f1c40f] ml-1 hover:underline cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>

          {/* View in Other Tab Button (Always on screen) */}
          <button
            type="button"
            onClick={handleOpenInNewTab}
            className="bg-[#f1c40f] hover:bg-[#d4ac0d] active:scale-95 text-[#231709] px-2.5 sm:px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-black flex items-center gap-1.5 shrink-0 shadow-md cursor-pointer transition-transform whitespace-nowrap"
            title="Open native full-resolution vector PDF in a new window or tab"
          >
            <span>↗</span>
            <span className="hidden xs:inline sm:inline">View in Other Tab</span>
            <span className="xs:hidden sm:hidden">In Tab</span>
          </button>
        </div>

        {/* Row 2 on Mobile: Zoom controls and Customer Tag */}
        <div className="flex md:hidden items-center justify-between gap-2 pt-1 border-t border-[var(--border)]/40 text-xs">
          <div className="flex items-center bg-[#1c1d25] border border-[var(--border)] rounded-lg px-2 py-0.5 text-xs text-gray-300 gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setZoomLevel((prev) => Math.max(50, prev - 15))}
              className="px-1.5 hover:text-white font-bold cursor-pointer"
              title="Zoom out"
            >
              −
            </button>
            <span className="text-[10px] font-bold min-w-8 text-center">{zoomLevel}%</span>
            <button
              type="button"
              onClick={() => setZoomLevel((prev) => Math.min(200, prev + 15))}
              className="px-1.5 hover:text-white font-bold cursor-pointer"
              title="Zoom in"
            >
              +
            </button>
            {zoomLevel !== 100 && (
              <button
                type="button"
                onClick={() => setZoomLevel(100)}
                className="text-[9px] text-[#f1c40f] ml-1 hover:underline cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>

          <div className="text-[10px] text-[var(--text-muted)] font-mono truncate text-right">
            {customer?.name ? `Client: ${customer.name}` : 'Vector Document'}
          </div>
        </div>
      </div>

      {/* PDF Viewer Frame with Native Object and IFrame Fallback */}
      <div className="max-w-4xl w-full mx-auto flex-1 min-h-0 bg-neutral-900 rounded-xl overflow-hidden shadow-2xl border border-[var(--border)] mb-2 relative flex flex-col">
        {/* Mobile quick-helper strip */}
        <div className="bg-[#14151c] border-b border-[var(--border)] px-3 py-1.5 flex items-center justify-between text-[11px] text-gray-300 shrink-0">
          <span className="flex items-center gap-1.5 truncate">
            <span className="text-[#30d158]">●</span>
            <span className="truncate">Official Vector PDF Preview</span>
          </span>
          <button
            type="button"
            onClick={handleOpenInNewTab}
            className="text-[#f1c40f] hover:underline font-bold flex items-center gap-1 shrink-0 ml-2 cursor-pointer"
          >
            <span>Fullscreen ↗</span>
          </button>
        </div>

        <div className="flex-1 w-full h-full overflow-auto bg-[#525659] relative">
          <object
            data={pdfResult.blobUrl}
            type="application/pdf"
            className="w-full h-full min-h-[250px]"
            style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center', transition: 'transform 0.15s ease' }}
          >
            <iframe
              id="pdf-preview-iframe"
              src={pdfResult.blobUrl}
              title="PDF Preview"
              className="w-full h-full min-h-[250px] border-none"
              style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center', transition: 'transform 0.15s ease' }}
            />
          </object>
        </div>
      </div>

      {/* Bottom Action Buttons */}
      <div className="max-w-4xl w-full mx-auto shrink-0 space-y-1.5">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <button
            type="button"
            onClick={handleDownload}
            className="py-2.5 bg-[#30d158] hover:opacity-95 text-white font-extrabold text-xs rounded-xl shadow cursor-pointer flex items-center justify-center gap-1.5 transition-transform active:scale-95"
            title="Save the real PDF file directly onto your phone or computer"
          >
            <span>💾</span>
            <span>Download PDF</span>
          </button>

          <button
            type="button"
            onClick={handleShare}
            className="py-2.5 bg-[#f1c40f] hover:opacity-95 text-[#231709] font-extrabold text-xs rounded-xl shadow cursor-pointer flex items-center justify-center gap-1.5 transition-transform active:scale-95"
            title="Send via AirDrop, Text, or Messaging apps"
          >
            <span>📲</span>
            <span>Share PDF</span>
          </button>

          <button
            type="button"
            onClick={handleEmail}
            className="py-2.5 bg-[#0a84ff] hover:opacity-95 text-white font-extrabold text-xs rounded-xl shadow cursor-pointer flex items-center justify-center gap-1.5 transition-transform active:scale-95"
            title="Prepares an email to the client with invoice totals"
          >
            <span>📧</span>
            <span>Email Client</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="py-2.5 bg-[var(--surface-subtle)] hover:bg-[var(--border)] border border-[var(--border)] text-[var(--text)] font-extrabold text-xs rounded-xl shadow cursor-pointer flex items-center justify-center gap-1.5 transition-transform active:scale-95"
            title="Prints document (or downloads PDF for 1-click printer access if iframe blocks dialog)"
          >
            <span>🖨️</span>
            <span>Print PDF</span>
          </button>

          {onSaveToCustomerFiles && (
            <button
              type="button"
              onClick={handleArchive}
              disabled={archived}
              className={`col-span-2 sm:col-span-1 py-2.5 rounded-xl font-extrabold text-xs shadow flex items-center justify-center gap-1.5 transition-transform active:scale-95 cursor-pointer ${
                archived
                  ? 'bg-[#1c2e1f] text-[#30d158] border border-[#30d158]/50 cursor-default'
                  : 'bg-[#3b2b1d] hover:bg-[#4d3826] text-[#f1c40f] border border-[#f1c40f]/40'
              }`}
              title="Saves this PDF permanently inside this customer's digital folder in the app"
            >
              <span>📁</span>
              <span>{archived ? 'Saved to Cabinet' : 'Save to Client File'}</span>
            </button>
          )}
        </div>

        {/* Secondary Mobile Close Button so user never feels trapped */}
        <button
          type="button"
          onClick={onClose}
          className="w-full sm:hidden py-2 bg-[var(--surface-subtle)] hover:bg-[var(--border)] active:scale-95 text-[var(--text-muted)] hover:text-[var(--text)] text-xs font-bold rounded-xl border border-[var(--border)] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
        >
          <span>✕</span>
          <span>Close Document &amp; Return</span>
        </button>
      </div>

      {/* Helpful guidance note */}
      <div className="max-w-4xl w-full mx-auto text-center text-[10px] text-[var(--text-muted)] pt-1 shrink-0 hidden sm:flex items-center justify-center gap-2">
        <span>💡 <b>Save to Client File</b> keeps a copy right inside {customer?.name || 'this client'}&rsquo;s file cabinet.</span>
        <span>•</span>
        <span>Tap <b>View in Other Tab</b> to open full-page vector PDF in Chrome or your device browser.</span>
      </div>
    </div>
  );
};

