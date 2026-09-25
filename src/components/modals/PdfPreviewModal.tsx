import React, { useState } from 'react';
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

  if (!pdfResult) return null;

  const handleDownload = () => {
    downloadPdfFile(pdfResult);
    onToast('✔ PDF Downloaded to Device');
  };

  const handleOpenInNewTab = () => {
    try {
      // Create a temporary anchor element pointing to the generated blob URL
      const link = document.createElement('a');
      link.href = pdfResult.blobUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      onToast('Opening full-page PDF in new window...');
      return;
    } catch {
      // If blocked by browser sandbox, fallback to direct download
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

  const handleEmailWithGmail = () => {
    const subject = encodeURIComponent(`Krueger Painting - ${pdfResult.fileName.replace('.pdf', '')}`);
    const body = encodeURIComponent(
      `Hi ${customer?.name || 'Customer'},\n\nPlease find your project document from Krueger Painting attached.\n\nProject Total: $${pdfResult.grossTotal}\nBalance Due: $${pdfResult.balanceDue}\n\nBest regards,\nJosh Krueger\nKrueger Painting\n(262) 443-1199`
    );
    const toEmail = encodeURIComponent(customer?.email || '');
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${toEmail}&su=${subject}&body=${body}`;

    // Download PDF first so user can attach it immediately
    handleDownload();
    window.open(gmailUrl, '_blank');
    onToast('✔ Opening Gmail compose with estimate details! (PDF downloaded to attach)');
  };

  const handleEmail = () => {
    handleEmailWithGmail();
  };

  const handlePrint = () => {
    // In sandboxed web apps/iframes, modern browsers restrict direct window.print() triggers.
    // We attempt direct print first, and automatically provide the downloaded PDF if restricted.
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
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex flex-col p-3 sm:p-5 animate-in fade-in">
      {/* Top Action Bar */}
      <div className="max-w-4xl w-full mx-auto flex items-center justify-between gap-2 border-b border-[var(--border)] pb-3 mb-3 text-[var(--text)]">
        <div>
          <h3 className="font-extrabold text-sm sm:text-base text-[#f1c40f] tracking-wide flex items-center gap-2">
            <span>📄</span>
            <span>{pdfResult.fileName}</span>
          </h3>
          <p className="text-[10px] text-[var(--text-muted)] font-mono">
            Official Krueger Vector PDF • {customer?.name || 'Client'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <div className="flex items-center bg-[#1c1d25] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-gray-300 gap-1.5">
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

          <button
            type="button"
            onClick={handleOpenInNewTab}
            className="bg-[#2c2317] hover:bg-[#3b2b1d] text-[#f1c40f] border border-[#f1c40f]/40 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
            title="Open native full-resolution vector PDF in a new window"
          >
            <span>🔍</span>
            <span>Open in Tab</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="bg-[var(--surface-subtle)] hover:bg-[var(--border)] text-[var(--text)] px-3 py-1.5 rounded-lg text-xs font-bold border border-[var(--border)] cursor-pointer"
          >
            ✕ Close
          </button>
        </div>
      </div>

      {/* PDF Viewer Frame with Native Object and IFrame Fallback */}
      <div className="max-w-4xl w-full mx-auto flex-1 bg-white rounded-xl overflow-hidden shadow-2xl border border-[var(--border)] mb-3 relative">
        <object
          data={pdfResult.blobUrl}
          type="application/pdf"
          className="w-full h-full"
          style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center', transition: 'transform 0.15s ease' }}
        >
          <iframe
            id="pdf-preview-iframe"
            src={pdfResult.blobUrl}
            title="PDF Preview"
            className="w-full h-full border-none"
            style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'top center', transition: 'transform 0.15s ease' }}
          />
        </object>
      </div>

      {/* Bottom Action Buttons */}
      <div className="max-w-4xl w-full mx-auto grid grid-cols-2 sm:grid-cols-5 gap-2">
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

      {/* Helpful environment guidance */}
      <div className="max-w-4xl w-full mx-auto text-center text-[10.5px] text-[var(--text-muted)] pt-1 flex items-center justify-center gap-2">
        <span>💡 <b>Save to Client File</b> keeps a copy right inside {customer?.name || 'this client'}&rsquo;s file cabinet in your app.</span>
        <span>•</span>
        <span>If browser iframe blocks direct print dialogs, <b>Download PDF</b> downloads the document instantly.</span>
      </div>
    </div>
  );
};
