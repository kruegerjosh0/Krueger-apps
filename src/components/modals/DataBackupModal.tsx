import React, { useRef } from 'react';
import {
  Customer,
  FieldNote,
  ExpenseEntry,
  MileageEntry,
  ShoppingItem,
  PriceBookItem,
  PrintSettings,
  SystemConstants,
} from '../../types';

interface DataBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceData: {
    customers: Customer[];
    notes: FieldNote[];
    expenses: ExpenseEntry[];
    mileage: MileageEntry[];
    shoppingList: ShoppingItem[];
    priceBook: PriceBookItem[];
    settings: PrintSettings;
    constants: SystemConstants;
  };
  onApplyBackup: (payload: {
    customers?: Customer[];
    notes?: FieldNote[];
    expenses?: ExpenseEntry[];
    mileage?: MileageEntry[];
    shoppingList?: ShoppingItem[];
    priceBook?: PriceBookItem[];
    settings?: PrintSettings;
    constants?: SystemConstants;
  }) => void;
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

  if (!isOpen) return null;

  const totalJobs = workspaceData.customers.reduce((acc, c) => acc + (c.jobs?.length || 0), 0);

  const handleBackupDownloadJson = () => {
    try {
      const payload = {
        version: '2.0',
        appName: 'Krueger Painting OS',
        exportedAt: new Date().toISOString(),
        data: {
          customers: workspaceData.customers,
          notes: workspaceData.notes,
          expenses: workspaceData.expenses,
          mileage: workspaceData.mileage,
          shoppingList: workspaceData.shoppingList,
          priceBook: workspaceData.priceBook,
          settings: workspaceData.settings,
          constants: workspaceData.constants,
        },
      };

      const jsonStr = JSON.stringify(payload, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `krueger-painting-backup-${dateStr}.json`;

      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      localStorage.setItem('KMaster_LastBackupTS', Date.now().toString());
      onToast(`✔ Backup downloaded (${filename})`);
    } catch (err: any) {
      onToast(`Backup failed: ${err.message}`);
    }
  };

  const handleRestoreUploadJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const raw = event.target?.result as string;
        const parsed = JSON.parse(raw);
        const targetData = parsed.data || parsed;

        if (!targetData.customers && !targetData.notes && !targetData.expenses) {
          alert('This file does not appear to be a valid Krueger Painting JSON backup.');
          return;
        }

        const customerCount = targetData.customers?.length || 0;
        const confirmMsg = `Restore backup with ${customerCount} customers and all workspace data?`;

        if (confirm(confirmMsg)) {
          onApplyBackup(targetData);
          onToast(`✔ Restored ${customerCount} customers & workspace data`);
          onClose();
        }
      } catch (err: any) {
        alert('Failed to parse backup file: ' + err.message);
      } finally {
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
                Export or restore your workspace as a single .JSON file
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
            onClick={handleBackupDownloadJson}
            className="w-full py-3.5 px-4 bg-[#f1c40f] hover:bg-[#d4ac0d] text-[#111111] font-black text-xs uppercase tracking-wider rounded-xl shadow flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-95"
          >
            <span>📥</span>
            <span>Backup Data (Download JSON)</span>
          </button>
          <p className="text-[10.5px] text-[var(--text-muted)] text-center">
            Saves all customers, estimates, notes, expenses, and settings to a .json file.
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
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-3.5 px-4 bg-[#1c2e1f] hover:bg-[#253d29] border border-[#30d158]/60 text-[#30d158] font-black text-xs uppercase tracking-wider rounded-xl shadow flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-95"
          >
            <span>📤</span>
            <span>Restore Data (Upload JSON)</span>
          </button>
          <p className="text-[10.5px] text-[var(--text-muted)] text-center">
            Select a previously downloaded .json backup file to restore your records.
          </p>
        </div>
      </div>
    </div>
  );
};
