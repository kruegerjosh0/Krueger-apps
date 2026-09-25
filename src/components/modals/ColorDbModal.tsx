import React from 'react';
import { Customer } from '../../types';

interface ColorDbModalProps {
  customers: Customer[];
  onClose: () => void;
}

export const ColorDbModal: React.FC<ColorDbModalProps> = ({ customers, onClose }) => {
  const colorMap: Record<string, { count: number; prod: string; sheen: string }> = {};

  customers.forEach((c) => {
    (c.jobs || []).forEach((j) => {
      (j.rooms || []).forEach((r) => {
        const col = (r.color || '').trim();
        if (col) {
          const key = col;
          if (!colorMap[key]) {
            colorMap[key] = { count: 0, prod: r.prod || '', sheen: r.sheen || '' };
          }
          colorMap[key].count += 1;
        }
      });
    });
  });

  const sorted = Object.keys(colorMap)
    .map((k) => ({
      name: k,
      ...colorMap[k],
    }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-purple-400">
              Paint Archives
            </span>
            <h2 className="text-base font-black text-[var(--text)]">Color & Sheen Database</h2>
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
          Automatically compiled from all project specifications logged across your customer files.
        </p>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {sorted.map((item, idx) => (
            <div
              key={idx}
              className="bg-[var(--surface-subtle)] border border-[var(--border)] p-3 rounded-xl flex items-center justify-between text-xs"
            >
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-black text-[var(--accent)]">#{idx + 1}</span>
                  <span className="font-extrabold text-[var(--text)]">{item.name}</span>
                </div>
                <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                  {[item.prod, item.sheen].filter(Boolean).join(' • ') || 'Standard finish'}
                </div>
              </div>

              <span className="bg-[var(--bg)] border border-[var(--border)] text-[var(--accent)] font-bold text-[10px] px-2 py-1 rounded-lg">
                Used {item.count}x
              </span>
            </div>
          ))}

          {sorted.length === 0 && (
            <div className="text-center py-8 text-xs text-[var(--text-muted)] bg-[var(--bg)] rounded-xl border border-[var(--border)]">
              No paint color codes entered in projects yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
