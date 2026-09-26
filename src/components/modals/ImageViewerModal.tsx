import React from 'react';

interface ImageViewerModalProps {
  imageUrl: string | null;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export const ImageViewerModal: React.FC<ImageViewerModalProps> = ({
  imageUrl,
  onClose,
  onToast,
}) => {
  if (!imageUrl) return null;

  const isPdf = imageUrl.startsWith('data:application/pdf') || imageUrl.toLowerCase().includes('.pdf');

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = isPdf ? `Krueger_Document_${Date.now()}.pdf` : `Krueger_Photo_${Date.now()}.jpg`;
    a.click();
    onToast(isPdf ? '✔ Document Downloaded' : '✔ Photo Downloaded');
  };

  const handleOpenInNewTab = () => {
    const win = window.open(imageUrl, '_blank');
    if (!win) {
      handleDownload();
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/95 backdrop-blur-md flex flex-col p-3 sm:p-4 animate-in fade-in">
      <div className="flex justify-between items-center max-w-4xl w-full mx-auto mb-3">
        <span className="text-xs font-bold text-white/70">
          {isPdf ? '📄 Document Inspector' : '📸 Photo Inspector'}
        </span>
        <div className="flex items-center gap-2">
          {isPdf && (
            <button
              type="button"
              onClick={handleOpenInNewTab}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-3 py-1.5 rounded-lg cursor-pointer"
            >
              ↗ Open in Tab
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="bg-white/10 hover:bg-white/20 text-white font-bold text-xs px-3 py-1.5 rounded-lg border border-white/20 cursor-pointer"
          >
            ✕ Close
          </button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center max-w-4xl w-full mx-auto overflow-hidden">
        {isPdf ? (
          <iframe
            src={imageUrl}
            title="Document Viewer"
            className="w-full h-full min-h-[60vh] rounded-xl border border-white/10 bg-white"
          />
        ) : (
          <img
            src={imageUrl}
            alt="Full View"
            className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl border border-white/10"
          />
        )}
      </div>

      <div className="max-w-4xl w-full mx-auto pt-3 text-center">
        <button
          type="button"
          onClick={handleDownload}
          className="py-2.5 px-6 bg-[var(--accent-tertiary)] hover:opacity-95 text-white font-extrabold text-xs rounded-xl shadow cursor-pointer transition-transform active:scale-95 inline-flex items-center gap-2"
        >
          <span>💾</span>
          <span>{isPdf ? 'Download PDF Document' : 'Download High-Res Photo'}</span>
        </button>
      </div>
    </div>
  );
};
