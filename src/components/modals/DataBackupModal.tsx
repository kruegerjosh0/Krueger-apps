import React, { useRef, useState } from 'react';
import {
  WorkspaceStateSnapshot,
  NormalizedRestorePayload,
  buildFullBackupPayload,
  getFullBackupFilename,
  parseBackupJson,
} from '../../utils/db';

export interface RestoreSummary {
  customersCount: number;
  settingsGroupsRestored: number;
  rawKeysRestored: number;
  details: string[];
}

interface DataBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceData: WorkspaceStateSnapshot;
  onApplyBackup: (payload: NormalizedRestorePayload) => Promise<RestoreSummary>;
  onToast: (msg: string) => void;
}

export const DataBackupModal: React.FC<DataBackupModalProps> = ({
  isOpen,
  onClose,
  workspaceData,
  onApplyBackup,
  onToast,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  const totalJobs = workspaceData.customers.reduce((acc, c) => acc + (c.jobs?.length || 0), 0);

  const handleBackupDownloadJson = async () => {
    setBusy(true);
    try {
      const payload = await buildFullBackupPayload(workspaceData);
      const jsonStr = JSON.stringify(payload, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const filename = getFullBackupFilename();

      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      localStorage.setItem('KMaster_LastBackupTS', Date.now().toString());
      onToast(`✔ Full Portable Backup Downloaded (${filename})`);
    } catch (err: any) {
      onToast(`Backup failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreUploadJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      setBusy(true);
      try {
        const raw = event.target?.result as string;
        const parsed = JSON.parse(raw);
        const normalized = parseBackupJson(parsed);

        if (!normalized) {
          alert('This file does not appear to be a valid Krueger Painting JSON backup.');
          return;
        }

        const previewParts: string[] = [];
        if (normalized.customers) previewParts.push(`${normalized.customers.length} customers`);
        if (normalized.constants) previewParts.push('custom rates & presets');
        if (normalized.terms) previewParts.push('PDF header & contract terms');
        if (normalized.hasCustomLogo) previewParts.push('company logo');
        if (normalized.baseTheme || normalized.accent1) previewParts.push('theme & colors');
        if (normalized.priceBook?.length) previewParts.push(`${normalized.priceBook.length} price book items`);
        if (normalized.notes?.length) previewParts.push(`${normalized.notes.length} notes`);
        if (normalized.expenses?.length) previewParts.push(`${normalized.expenses.length} expenses`);
        if (normalized.mileage?.length) previewParts.push(`${normalized.mileage.length} mileage logs`);
        if (normalized.shoppingList?.length) previewParts.push(`${normalized.shoppingList.length} shopping items`);
        if (normalized.rawStorage) {
          const extraCount = Object.keys(normalized.rawStorage).length;
          if (extraCount > 0) previewParts.push(`${extraCount} extra app keys`);
        }

        const formatLabel =
          normalized.format === 'legacy-customers-array'
            ? 'Legacy Customer-Only Backup'
            : normalized.format === 'full-v2'
            ? 'Full App Backup (v2.0)'
            : 'Workspace Backup';

        const confirmMsg = `Restore ${formatLabel}?\n\nDetected: ${
          previewParts.length > 0 ? previewParts.join(', ') : 'workspace data'
        }.\n\nThis will immediately update your active app state and local storage.`;

        if (confirm(confirmMsg)) {
          const summary = await onApplyBackup(normalized);
          const totalSettings = summary.settingsGroupsRestored + summary.rawKeysRestored;
          onToast(
            `✔ Restored ${summary.customersCount} customer${
              summary.customersCount === 1 ? '' : 's'
            } & ${totalSettings} setting${totalSettings === 1 ? '' : 's'}/data group${
              totalSettings === 1 ? '' : 's'
            }!`
          );
          onClose();
        }
      } catch (err: any) {
        alert('Failed to parse backup file: ' + (err?.message || 'Invalid JSON'));
      } finally {
        setBusy(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xs animate-in fade-in overflow-y-auto">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-md p-4 sm:p-6 shadow-2xl space-y-4 my-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">💾</span>
            <div>
              <h3 className="font-black text-sm sm:text-base text-[var(--text)]">
                Backup &amp; Restore Data
              </h3>
              <p className="text-[10.5px] text-[var(--text-muted)]">
                100% portable full-app .JSON backup &amp; smart restore
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[var(--surface-subtle)] text-[var(--text-muted)] hover:text-white flex items-center justify-center font-bold text-xs cursor-pointer border border-[var(--border)]"
          >
            ✕
          </button>
        </div>

        {/* Compact Database Summary */}
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="bg-[var(--bg)] p-2 rounded-lg border border-[var(--border)]">
            <div className="text-base font-black text-[var(--text)]">{workspaceData.customers.length}</div>
            <div className="text-[8px] font-bold text-[var(--text-muted)] uppercase">Clients</div>
          </div>
          <div className="bg-[var(--bg)] p-2 rounded-lg border border-[var(--border)]">
            <div className="text-base font-black text-[#f1c40f]">{totalJobs}</div>
            <div className="text-[8px] font-bold text-[var(--text-muted)] uppercase">Projects</div>
          </div>
          <div className="bg-[var(--bg)] p-2 rounded-lg border border-[var(--border)]">
            <div className="text-base font-black text-emerald-400">{workspaceData.expenses.length}</div>
            <div className="text-[8px] font-bold text-[var(--text-muted)] uppercase">Expenses</div>
          </div>
          <div className="bg-[var(--bg)] p-2 rounded-lg border border-[var(--border)]">
            <div className="text-base font-black text-blue-400">{workspaceData.notes.length}</div>
            <div className="text-[8px] font-bold text-[var(--text-muted)] uppercase">Notes</div>
          </div>
        </div>

        {/* Backup Data (Download JSON) */}
        <div className="space-y-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={handleBackupDownloadJson}
            className="w-full py-3.5 px-4 bg-[#f1c40f] hover:bg-[#d4ac0d] text-[#111111] font-black text-xs uppercase tracking-wider rounded-xl shadow flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-95 disabled:opacity-50"
          >
            <span>📥</span>
            <span>{busy ? 'Preparing Full Backup...' : 'Backup Data (Download JSON)'}</span>
          </button>
          <p className="text-[10.5px] text-[var(--text-muted)] text-center">
            Exports all customers, jobs, custom rates, PDF terms, logo, theme, notes &amp; storage keys.
          </p>
        </div>

        {/* Restore Data (Upload JSON) */}
        <div className="space-y-1.5 pt-1">
          <input
            type="file"
            ref={fileInputRef}
            accept=".json,application/json"
            onChange={handleRestoreUploadJson}
            className="hidden"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-3.5 px-4 bg-[#1c2e1f] hover:bg-[#253d29] border border-[#30d158]/60 text-[#30d158] font-black text-xs uppercase tracking-wider rounded-xl shadow flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-95 disabled:opacity-50"
          >
            <span>📤</span>
            <span>{busy ? 'Restoring...' : 'Restore Data (Upload JSON)'}</span>
          </button>
          <p className="text-[10.5px] text-[var(--text-muted)] text-center">
            Supports full v2.0 backups and legacy customer-only JSON arrays with instant live apply.
          </p>
        </div>
      </div>
    </div>
  );
};
