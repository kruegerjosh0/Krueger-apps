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

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = `Krueger_Photo_${Date.now()}.jpg`;
    a.click();
    onToast('✔ Photo Downloaded');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col p-4 animate-in fade-in">
      <div className="flex justify-between items-center max-w-4xl w-full mx-auto mb-3">
        <span className="text-xs font-bold text-white/70">Photo Inspector</span>
        <button
          type="button"
          onClick={onClose}
          className="bg-white/10 hover:bg-white/20 text-white font-bold text-xs px-3 py-1.5 rounded-lg border border-white/20 cursor-pointer"
        >
          ✕ Close
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center max-w-4xl w-full mx-auto overflow-hidden">
        <img
          src={imageUrl}
          alt="Full View"
          className="max-w-full max-h-[80vh] object-contain rounded-xl shadow-2xl border border-white/10"
        />
      </div>

      <div className="max-w-4xl w-full mx-auto pt-3 text-center">
        <button
          type="button"
          onClick={handleDownload}
          className="py-2.5 px-6 bg-[var(--accent-tertiary)] hover:opacity-95 text-white font-extrabold text-xs rounded-xl shadow cursor-pointer transition-transform active:scale-95 inline-flex items-center gap-2"
        >
          <span>💾</span>
          <span>Download High-Res Photo</span>
        </button>
      </div>
    </div>
  );
};
