import React, { useEffect, useState } from 'react';
import {
  KRUEGER_BUSINESS_CARD,
  generateBusinessCardImageBlob,
  buildOwnerBusinessVcard,
  shareOwnerBusinessCard,
} from '../../utils/businessCard';

interface ShareBusinessCardModalProps {
  onClose: () => void;
  onToast: (msg: string) => void;
}

export const ShareBusinessCardModal: React.FC<ShareBusinessCardModalProps> = ({
  onClose,
  onToast,
}) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sharingMode, setSharingMode] = useState<'IMAGE' | 'VCARD' | null>(null);

  useEffect(() => {
    let active = true;
    generateBusinessCardImageBlob()
      .then(({ dataUrl }) => {
        if (active) setPreviewUrl(dataUrl);
      })
      .catch(() => {
        // Fallback text preview if canvas fails
      });
    return () => {
      active = false;
    };
  }, []);

  const handleShare = async (mode: 'IMAGE' | 'VCARD') => {
    setSharingMode(mode);
    try {
      const outcome = await shareOwnerBusinessCard(mode);
      if (outcome === 'SHARED') {
        onToast(
          mode === 'IMAGE'
            ? '✔ Shared Digital Business Card'
            : '✔ Shared Contact Card (.vcf)'
        );
      } else {
        onToast(
          mode === 'IMAGE'
            ? '✔ Downloaded Business Card Image'
            : '✔ Downloaded Contact Card (.vcf)'
        );
      }
    } catch (err: any) {
      console.error('Share business card error:', err);
      onToast('Unable to share right now — try Download below.');
    } finally {
      setSharingMode(null);
    }
  };

  const handleDirectDownloadVcf = () => {
    const { vcfContent, fileName } = buildOwnerBusinessVcard();
    const blob = new Blob([vcfContent], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    onToast('✔ Downloaded Joshua_Krueger_Krueger_Painting.vcf');
  };

  const handleDirectDownloadPng = async () => {
    try {
      const { blob, fileName } = await generateBusinessCardImageBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      onToast('✔ Downloaded Business Card Image');
    } catch {
      onToast('Failed to generate PNG');
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-md p-4 sm:p-5 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div>
            <span className="text-[9.5px] uppercase font-extrabold tracking-wider text-[#f1c40f] block">
              On-Demand Contact Sharing
            </span>
            <h2 className="text-sm sm:text-base font-black text-[var(--text)]">
              💼 Share My Business Card
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text)] px-2 py-1 rounded-lg bg-[var(--surface-subtle)] border border-[var(--border)] cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* High-DPI Digital Business Card Live Preview */}
        <div className="rounded-xl overflow-hidden border border-[#f1c40f]/45 bg-[#111111] shadow-lg">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Krueger Painting Digital Business Card"
              className="w-full h-auto block"
            />
          ) : (
            <div className="p-4 text-left space-y-1">
              <div className="text-sm font-black text-[#f1c40f] tracking-wide">
                {KRUEGER_BUSINESS_CARD.company.toUpperCase()}
              </div>
              <div className="text-xs font-bold text-white">{KRUEGER_BUSINESS_CARD.owner}</div>
              <div className="text-[11px] text-gray-300">{KRUEGER_BUSINESS_CARD.phoneDisplay}</div>
              <div className="text-[11px] text-gray-300">{KRUEGER_BUSINESS_CARD.email}</div>
              <div className="text-[11px] text-gray-300">{KRUEGER_BUSINESS_CARD.websiteDisplay}</div>
              <div className="text-[10px] text-gray-400">{KRUEGER_BUSINESS_CARD.addressLine}</div>
            </div>
          )}
        </div>

        {/* Primary Native Share Actions */}
        <div className="space-y-2">
          <button
            type="button"
            disabled={sharingMode !== null}
            onClick={() => handleShare('IMAGE')}
            className="w-full py-3 bg-[#f1c40f] hover:bg-[#e0b40e] text-[#111111] font-black text-xs rounded-xl shadow cursor-pointer transition-transform active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            <span>📤</span>
            <span>
              {sharingMode === 'IMAGE'
                ? 'Opening Share Sheet...'
                : 'Share Business Card Image'}
            </span>
          </button>

          <button
            type="button"
            disabled={sharingMode !== null}
            onClick={() => handleShare('VCARD')}
            className="w-full py-3 bg-[#111111] hover:bg-[#1c1d25] border border-[#f1c40f]/70 text-[#f1c40f] font-black text-xs rounded-xl shadow cursor-pointer transition-transform active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            <span>📇</span>
            <span>
              {sharingMode === 'VCARD'
                ? 'Opening Share Sheet...'
                : 'Share Contact Card (.vcf)'}
            </span>
          </button>
        </div>

        {/* Subtle Direct Download Fallbacks */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--border)]">
          <button
            type="button"
            onClick={handleDirectDownloadPng}
            className="py-2 bg-[var(--surface-subtle)] hover:bg-[var(--border)] border border-[var(--border)] text-[var(--text)] font-bold text-[10.5px] rounded-lg cursor-pointer"
          >
            💾 Save Card PNG
          </button>
          <button
            type="button"
            onClick={handleDirectDownloadVcf}
            className="py-2 bg-[var(--surface-subtle)] hover:bg-[var(--border)] border border-[var(--border)] text-[var(--text)] font-bold text-[10.5px] rounded-lg cursor-pointer"
          >
            💾 Save My .vcf
          </button>
        </div>
      </div>
    </div>
  );
};
