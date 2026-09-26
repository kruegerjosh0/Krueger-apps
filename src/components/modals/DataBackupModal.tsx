import React, { useRef, useState } from 'react';
import { Customer, FieldNote, ExpenseEntry, MileageEntry, ShoppingItem, PriceBookItem, PrintSettings, SystemConstants } from '../../types';

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
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const totalJobs = workspaceData.customers.reduce((acc, c) => acc + (c.jobs?.length || 0), 0);

  const generateBackupPayload = () => {
    return {
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
  };

  // 1. Backup to Phone (Direct JSON Download)
  const handleBackupToPhone = () => {
    try {
      const payload = generateBackupPayload();
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

      onToast(`✔ Saved ${filename} to Phone Downloads!`);
    } catch (err: any) {
      onToast(`Backup failed: ${err.message}`);
    }
  };

  // 2. Backup to Google Drive (Web Share API to "Save to Drive" or Intent)
  const handleBackupToGoogleDrive = async () => {
    try {
      setIsProcessing(true);
      const payload = generateBackupPayload();
      const jsonStr = JSON.stringify(payload, null, 2);
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `krueger-painting-backup-${dateStr}.json`;
      const file = new File([jsonStr], filename, { type: 'application/json' });

      // If mobile supports native file sharing (Android Chrome share sheet has "Google Drive" / "Save to Drive")
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'Krueger Painting Backup',
          text: `Krueger Painting Customer & Project Database Backup (${dateStr})`,
          files: [file],
        });
        onToast('✔ Shared to Google Drive / Files!');
        setIsProcessing(false);
        return;
      }

      // Fallback: Download the file and offer to open Google Drive
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      onToast('✔ JSON downloaded! Opening Google Drive to upload...');
      window.open('https://drive.google.com', '_blank');
      setIsProcessing(false);
    } catch (err: any) {
      setIsProcessing(false);
      // If user cancelled share sheet, don't show error
      if (err.name !== 'AbortError') {
        handleBackupToPhone();
      }
    }
  };

  // 3. Restore from Phone / Google Drive JSON file
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const raw = event.target?.result as string;
        const parsed = JSON.parse(raw);

        // Support both { data: { customers... } } format and root { customers... } format
        const targetData = parsed.data || parsed;

        if (!targetData.customers && !targetData.notes && !targetData.expenses) {
          alert('This file does not appear to be a valid Krueger Painting backup.');
          return;
        }

        const customerCount = targetData.customers?.length || 0;
        const confirmMsg = `Restore backup with ${customerCount} customers and all projects? This will merge and update your local database.`;

        if (confirm(confirmMsg)) {
          onApplyBackup(targetData);
          onToast(`✔ Successfully restored ${customerCount} customers & all app data!`);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xs animate-in fade-in">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-md p-4 sm:p-6 shadow-2xl space-y-4">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">💾</span>
            <div>
              <h3 className="font-extrabold text-sm text-[var(--text)]">Backup &amp; Restore Database</h3>
              <p className="text-[10px] text-[var(--text-muted)] font-semibold">100% Local Phone Storage &amp; Google Drive</p>
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

        {/* Current Database Stats */}
        <div className="bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl p-3">
          <span className="text-[9px] font-extrabold uppercase tracking-wider text-[var(--accent)] block mb-2">
            Current Phone Database Contents
          </span>
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="bg-black/20 p-2 rounded-lg border border-[var(--border)]">
              <div className="text-base font-black text-white">{workspaceData.customers.length}</div>
              <div className="text-[8px] font-bold text-[var(--text-muted)] uppercase">Clients</div>
            </div>
            <div className="bg-black/20 p-2 rounded-lg border border-[var(--border)]">
              <div className="text-base font-black text-[var(--accent)]">{totalJobs}</div>
              <div className="text-[8px] font-bold text-[var(--text-muted)] uppercase">Projects</div>
            </div>
            <div className="bg-black/20 p-2 rounded-lg border border-[var(--border)]">
              <div className="text-base font-black text-emerald-400">{workspaceData.expenses.length}</div>
              <div className="text-[8px] font-bold text-[var(--text-muted)] uppercase">Expenses</div>
            </div>
            <div className="bg-black/20 p-2 rounded-lg border border-[var(--border)]">
              <div className="text-base font-black text-blue-400">{workspaceData.notes.length}</div>
              <div className="text-[8px] font-bold text-[var(--text-muted)] uppercase">Notes</div>
            </div>
          </div>
        </div>

        {/* Action 1: Backup to Phone */}
        <div className="space-y-2">
          <span className="text-[9px] font-extrabold uppercase tracking-wider text-[var(--text-muted)] block">
            Export &amp; Save Copies
          </span>

          <button
            type="button"
            onClick={handleBackupToPhone}
            className="w-full py-3 px-4 bg-[var(--surface-subtle)] hover:bg-[var(--border)] border border-[var(--border)] text-white font-extrabold text-xs rounded-xl shadow-xs flex items-center justify-between cursor-pointer transition-transform active:scale-98"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-base">📱</span>
              <div className="text-left">
                <div className="font-extrabold text-xs text-white">Backup to Phone (.JSON)</div>
                <div className="text-[9px] text-[var(--text-muted)] font-normal">Downloads a physical database file to your device</div>
              </div>
            </div>
            <span className="text-xs text-[var(--accent)] font-bold">📥 Download</span>
          </button>

          {/* Action 2: Backup to Google Drive */}
          <button
            type="button"
            onClick={handleBackupToGoogleDrive}
            disabled={isProcessing}
            className="w-full py-3 px-4 bg-[#1a2332] hover:bg-[#222f42] border border-blue-500/40 text-blue-300 font-extrabold text-xs rounded-xl shadow-xs flex items-center justify-between cursor-pointer transition-transform active:scale-98"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-base">☁️</span>
              <div className="text-left">
                <div className="font-extrabold text-xs text-white">Backup to Google Drive</div>
                <div className="text-[9px] text-blue-200/70 font-normal">Uploads JSON directly to your Google Drive account</div>
              </div>
            </div>
            <span className="text-xs text-blue-400 font-bold">Save to Drive ➔</span>
          </button>
        </div>

        {/* Action 3: Restore */}
        <div className="space-y-2 pt-1 border-t border-[var(--border)]">
          <span className="text-[9px] font-extrabold uppercase tracking-wider text-[var(--accent-tertiary)] block">
            Restore / Import Data
          </span>

          <input
            type="file"
            ref={fileInputRef}
            accept=".json,application/json"
            onChange={handleFileSelect}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full py-3 px-4 bg-[#1c2e1f] hover:bg-[#253d29] border border-[#30d158]/50 text-[#30d158] font-extrabold text-xs rounded-xl shadow-xs flex items-center justify-between cursor-pointer transition-transform active:scale-98"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-base">📤</span>
              <div className="text-left">
                <div className="font-extrabold text-xs text-white">Restore from Phone or Drive (.JSON)</div>
                <div className="text-[9px] text-emerald-200/70 font-normal">Select a previously saved backup file to restore</div>
              </div>
            </div>
            <span className="text-xs text-[#30d158] font-bold">Select File ➔</span>
          </button>
        </div>

        {/* Security & Privacy Footer */}
        <div className="text-[9px] text-[var(--text-muted)] text-center pt-1 font-medium">
          🔒 100% Private. No third-party servers or subscriptions. Your files stay in your own hands.
        </div>
      </div>
    </div>
  );
};
