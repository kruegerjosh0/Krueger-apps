import React from 'react';
import { JobProject } from '../../types';

interface DayPopupModalProps {
  dateStr: string;
  jobs: { customerName: string; customerId: number; job: JobProject }[];
  onOpenFolder: (customerId: number) => void;
  onClose: () => void;
}

export const DayPopupModal: React.FC<DayPopupModalProps> = ({
  dateStr,
  jobs,
  onOpenFolder,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--accent)]">
              Schedule Day Inspector
            </span>
            <h3 className="text-base font-black text-[var(--text)]">{dateStr}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="bg-[var(--surface-subtle)] text-[var(--text)] font-bold text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] cursor-pointer"
          >
            ✕ Close
          </button>
        </div>

        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {jobs.map((item, idx) => {
            const statusBg =
              item.job.status === 'ACTIVE'
                ? '#30d158'
                : item.job.status === 'SCHEDULED'
                ? '#0a84ff'
                : '#bf5af2';

            return (
              <div
                key={idx}
                className="bg-[var(--surface-subtle)] border border-[var(--border)] p-3 rounded-xl space-y-1.5"
                style={{ borderLeft: `4px solid ${statusBg}` }}
              >
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-sm text-[var(--text)]">{item.customerName}</span>
                  <span
                    style={{ backgroundColor: statusBg }}
                    className="text-[8px] font-black uppercase px-2 py-0.5 rounded text-white"
                  >
                    {item.job.status}
                  </span>
                </div>

                <div className="text-xs font-bold text-[var(--accent)]">
                  {item.job.title || 'General Scope Project'}
                </div>

                {item.job.scope && (
                  <p className="text-[11px] text-[var(--text-muted)] line-clamp-2 leading-relaxed">
                    {item.job.scope}
                  </p>
                )}

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenFolder(item.customerId);
                  }}
                  className="w-full py-1.5 mt-1 bg-[var(--accent-secondary)] text-white font-extrabold text-xs rounded-lg cursor-pointer"
                >
                  Open Customer Folder ➔
                </button>
              </div>
            );
          })}

          {jobs.length === 0 && (
            <div className="text-center py-8 text-xs text-[var(--text-muted)] bg-[var(--bg)] rounded-xl border border-[var(--border)]">
              No jobs or estimates scheduled for {dateStr}.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
