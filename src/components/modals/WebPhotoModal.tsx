import React from 'react';
import { WebPhoto } from '../../types';

interface WebPhotoModalProps {
  photos: WebPhoto[];
  onUploadPhoto: (file: File) => void;
  onDeletePhoto: (id: number) => void;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export const WebPhotoModal: React.FC<WebPhotoModalProps> = ({
  photos,
  onUploadPhoto,
  onDeletePhoto,
  onClose,
  onToast,
}) => {
  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUploadPhoto(e.target.files[0]);
      e.target.value = '';
    }
  };

  const copySnippet = (snippet: string) => {
    navigator.clipboard.writeText(snippet);
    onToast('✔ HTML Image Snippet Copied');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex flex-col p-3 sm:p-5 overflow-y-auto animate-in fade-in">
      <div className="max-w-2xl w-full mx-auto bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4 my-auto">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--accent)]">
              Netlify Website Tools
            </span>
            <h2 className="text-base font-black text-[var(--text)]">Portfolio Photo Link Generator</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="bg-[var(--surface-subtle)] text-[var(--text)] font-bold text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] cursor-pointer"
          >
            ✕ Back
          </button>
        </div>

        <p className="text-[11px] text-[var(--text-muted)]">
          Upload finished work photos here to generate clean, self-contained HTML image tags ready for your Netlify portfolio website without needing external image hosting.
        </p>

        <label className="w-full py-3 bg-[var(--accent)] hover:opacity-95 text-white font-extrabold text-xs rounded-xl shadow flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-95">
          <span>📁</span>
          <span>Upload Portfolio Photo</span>
          <input type="file" accept="image/*" onChange={handleUpload} className="hidden" />
        </label>

        {/* Photos List */}
        <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
          {photos.map((p) => {
            const snippet = `<img src="${p.data}" alt="Krueger Painting Project" class="portfolio-img">`;
            return (
              <div
                key={p.id}
                className="bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[var(--text)] truncate">{p.name}</span>
                  <button
                    type="button"
                    onClick={() => onDeletePhoto(p.id)}
                    className="text-red-500 font-bold text-xs"
                  >
                    Delete
                  </button>
                </div>

                <img
                  src={p.data}
                  alt={p.name}
                  className="w-full h-32 object-cover rounded-lg border border-[var(--border)]"
                />

                <div>
                  <label className="text-[8px] uppercase font-bold text-[var(--text-muted)] block mb-1">
                    HTML Snippet (Tap to Copy)
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={snippet}
                    onClick={() => copySnippet(snippet)}
                    className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--accent-tertiary)] font-mono text-[10px] rounded-lg px-2.5 py-1.5 cursor-pointer outline-none"
                  />
                </div>
              </div>
            );
          })}

          {photos.length === 0 && (
            <div className="text-center py-8 text-xs text-[var(--text-muted)] bg-[var(--bg)] rounded-xl border border-[var(--border)]">
              No portfolio photos uploaded yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
