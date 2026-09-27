import React, { useRef, useState } from 'react';
import { Customer, FieldNote, ExpenseEntry, MileageEntry, ShoppingItem, PriceBookItem, PrintSettings, SystemConstants } from '../../types';
import { usePWAInstall } from '../../hooks/usePWAInstall';

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
  const [activeTab, setActiveTab] = useState<'app' | 'data'>('app');
  const [showInstallSteps, setShowInstallSteps] = useState(false);
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();

  if (!isOpen) return null;

  const totalJobs = workspaceData.customers.reduce((acc, c) => acc + (c.jobs?.length || 0), 0);

  // Helper to fetch standalone HTML and pre-seed with active client database
  const getPreSeededHtml = async (): Promise<string> => {
    let html = '';
    try {
      const res = await fetch('/api/export-single-html');
      if (!res.ok) throw new Error('API export response not ok');
      html = await res.text();
    } catch {
      // Fallback
      const res = await fetch('/standalone');
      html = await res.text();
    }

    // Safely encode JSON to prevent any '</script>' or '<' closing script tags prematurely
    const workspacePayload = {
      customers: workspaceData.customers,
      notes: workspaceData.notes,
      expenses: workspaceData.expenses,
      mileage: workspaceData.mileage,
      shoppingList: workspaceData.shoppingList,
      priceBook: workspaceData.priceBook,
      settings: workspaceData.settings,
      constants: workspaceData.constants,
    };

    const safeCustJson = JSON.stringify(workspaceData.customers).replace(/</g, '\\u003c');
    const safeWorkJson = JSON.stringify(workspacePayload).replace(/</g, '\\u003c');

    const dataScript = `<script>
  window.__INITIAL_KRUEGER_CUSTOMERS__ = ${safeCustJson};
  window.__INITIAL_KRUEGER_WORKSPACE__ = ${safeWorkJson};
</script>`;

    // CRITICAL: Insert immediately after the very first <head> tag (at the top of the HTML document)
    // NEVER use html.replace('</head>') because minified JavaScript contains the string '</head>'
    const headOpenIdx = html.indexOf('<head>');
    if (headOpenIdx !== -1) {
      html = html.slice(0, headOpenIdx + 6) + '\n    ' + dataScript + '\n' + html.slice(headOpenIdx + 6);
    } else {
      html = dataScript + '\n' + html;
    }

    return html;
  };

  // 1. Download Single-File HTML to Phone / PC
  const handleDownloadHtml = async () => {
    try {
      setIsProcessing(true);
      const htmlContent = await getPreSeededHtml();
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const filename = 'krueger-painting-app.html';

      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      onToast('✔ Downloaded krueger-painting-app.html! Check phone Downloads.');
      setIsProcessing(false);
    } catch (err: any) {
      setIsProcessing(false);
      onToast(`Download failed: ${err.message}`);
    }
  };

  // 2. Share HTML File via Android Native Share Sheet (Save to Files / Drive)
  const handleShareHtml = async () => {
    try {
      setIsProcessing(true);
      const htmlContent = await getPreSeededHtml();
      const filename = 'krueger-painting-app.html';
      const file = new File([htmlContent], filename, { type: 'text/html' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'Krueger Painting Offline App',
          text: 'Single-file offline HTML application for Android Chrome',
          files: [file],
        });
        onToast('✔ App shared! Select "Save to Files" or "Drive".');
        setIsProcessing(false);
        return;
      }

      // If navigator.share not supported, trigger download
      handleDownloadHtml();
    } catch (err: any) {
      setIsProcessing(false);
      if (err.name !== 'AbortError') {
        handleDownloadHtml();
      }
    }
  };

  // 3. Open Standalone in New Tab
  const handleOpenStandalone = () => {
    window.open('/standalone', '_blank');
    onToast('✔ Opened in new tab! Tap ⋮ > "Add to Home screen" to install.');
  };

  // 4. Copy Entire HTML Code to Clipboard
  const handleCopyHtmlCode = async () => {
    try {
      setIsProcessing(true);
      const htmlContent = await getPreSeededHtml();
      await navigator.clipboard.writeText(htmlContent);
      onToast('✔ Full HTML code copied to clipboard!');
      setIsProcessing(false);
    } catch (err: any) {
      setIsProcessing(false);
      onToast(`Failed to copy code: ${err.message}`);
    }
  };

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

  // 5. Backup to Phone (Direct JSON Download)
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

  // 6. Backup to Google Drive
  const handleBackupToGoogleDrive = async () => {
    try {
      setIsProcessing(true);
      const payload = generateBackupPayload();
      const jsonStr = JSON.stringify(payload, null, 2);
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `krueger-painting-backup-${dateStr}.json`;
      const file = new File([jsonStr], filename, { type: 'application/json' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: 'Krueger Painting Backup',
          text: `Krueger Painting Customer Database Backup (${dateStr})`,
          files: [file],
        });
        onToast('✔ Shared to Google Drive / Files!');
        setIsProcessing(false);
        return;
      }

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
      if (err.name !== 'AbortError') {
        handleBackupToPhone();
      }
    }
  };

  // 7. Restore from Phone / Google Drive JSON file
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const raw = event.target?.result as string;
        const parsed = JSON.parse(raw);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xs animate-in fade-in overflow-y-auto">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-lg p-4 sm:p-6 shadow-2xl space-y-4 my-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">📱</span>
            <div>
              <h3 className="font-black text-sm sm:text-base text-[var(--text)]">Download App &amp; Data Backup</h3>
              <p className="text-[10.5px] text-[var(--accent)] font-bold">100% Offline Standalone HTML &amp; Phone Storage</p>
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

        {/* Tab Toggle: Install App vs. JSON Data Backup */}
        <div className="flex bg-[var(--surface-subtle)] p-1 rounded-xl border border-[var(--border)] gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('app')}
            className={`flex-1 py-2 rounded-lg font-black text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'app'
                ? 'bg-amber-500 text-black shadow-md'
                : 'text-[var(--text-muted)] hover:text-white'
            }`}
          >
            <span>📱</span>
            <span>Install App & Offline</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('data')}
            className={`flex-1 py-2 rounded-lg font-black text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'data'
                ? 'bg-[var(--accent-secondary)] text-white shadow-md'
                : 'text-[var(--text-muted)] hover:text-white'
            }`}
          >
            <span>💾</span>
            <span>Customer Data (.JSON)</span>
          </button>
        </div>

        {/* TAB 1: INSTALL APP & OFFLINE ACCESS */}
        {activeTab === 'app' && (
          <div className="space-y-3 animate-in fade-in">
            {/* Direct Home Screen Installation Section */}
            {isInstalled ? (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3 flex items-center gap-2.5 text-emerald-400">
                <span className="text-xl">✔</span>
                <div>
                  <div className="font-black text-xs">App is Installed on This Device!</div>
                  <div className="text-[10px] text-emerald-300/80">
                    Running in standalone app mode with offline storage enabled.
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-gradient-to-br from-amber-500/15 via-yellow-500/10 to-amber-600/15 border border-amber-500/40 rounded-xl p-3.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <span>⭐ Recommended: Add to Home Screen</span>
                  </span>
                  <span className="text-[9.5px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-bold">
                    Fast & Offline
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text)] leading-relaxed">
                  Adds <strong>Krueger Painting OS</strong> directly to your phone screen as a full-screen app. No browser address bar, 100% offline access to your bids and client lists.
                </p>

                <button
                  type="button"
                  onClick={async () => {
                    if (isInstallable) {
                      const ok = await install();
                      if (ok) {
                        onToast('✔ Installing Krueger Painting OS to your home screen!');
                        return;
                      }
                    }
                    setShowInstallSteps(true);
                  }}
                  className="w-full py-3 px-4 bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-300 hover:to-yellow-400 text-black font-black text-xs sm:text-sm rounded-xl shadow-lg flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-98"
                >
                  <span className="text-base">📱</span>
                  <span>{isInstallable ? 'Install App to Home Screen' : 'Add App to Home Screen'}</span>
                </button>

                {(!isInstallable || showInstallSteps) && (
                  <div className="pt-2 border-t border-amber-500/20 space-y-1.5 text-[10.5px]">
                    <div className="font-bold text-amber-300">
                      How to install in Chrome on Android:
                    </div>
                    {isIOS ? (
                      <ol className="list-decimal list-inside space-y-1 text-[var(--text-muted)] bg-black/30 p-2 rounded-lg">
                        <li>Tap the <strong className="text-white">Share</strong> button in Safari toolbar.</li>
                        <li>Scroll down and tap <strong className="text-white">"Add to Home Screen"</strong>.</li>
                        <li>Tap <strong className="text-white">"Add"</strong> in the top right.</li>
                      </ol>
                    ) : (
                      <ol className="list-decimal list-inside space-y-1 text-[var(--text-muted)] bg-black/30 p-2 rounded-lg">
                        <li>Tap Chrome's menu: the <strong className="text-white">3 dots (⋮)</strong> in the top-right corner.</li>
                        <li>Tap <strong className="text-amber-300">"Install app"</strong> or <strong className="text-amber-300">"Add to Home screen"</strong>.</li>
                        <li>Tap <strong className="text-white">"Install"</strong> — the app icon will appear directly on your home screen!</li>
                      </ol>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Explanation of why raw HTML files showed code */}
            <div className="bg-black/30 border border-[var(--border)] rounded-xl p-2.5 text-[10.5px] text-[var(--text-muted)] leading-relaxed">
              <span className="font-bold text-amber-400 block mb-0.5">
                💡 Why did downloaded files previously show code?
              </span>
              <span>
                When opening a downloaded .html file on Android, the phone opens it using a basic code viewer instead of launching it as an interactive app. Adding to Home Screen above avoids file downloads completely and gives you a true full-screen app!
              </span>
            </div>

            {/* Offline File Backup Section */}
            <div className="border border-[var(--border)] bg-[var(--surface-subtle)] rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-extrabold text-white flex items-center gap-1.5">
                  <span>📥</span>
                  <span>Offline HTML File (For PC / Laptop Storage)</span>
                </span>
              </div>
              <p className="text-[10px] text-[var(--text-muted)]">
                Export an offline archive file with all customer data pre-seeded.
              </p>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleDownloadHtml}
                  disabled={isProcessing}
                  className="py-2 px-2.5 bg-black/40 hover:bg-black/60 border border-[var(--border)] rounded-lg text-[10.5px] font-bold text-white flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95"
                >
                  <span>💾</span>
                  <span>{isProcessing ? 'Generating...' : 'Save .html File'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenStandalone}
                  className="py-2 px-2.5 bg-black/40 hover:bg-black/60 border border-[var(--border)] rounded-lg text-[10.5px] font-bold text-amber-300 flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95"
                >
                  <span>🌐</span>
                  <span>Open in Tab</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: CUSTOMER DATA BACKUP & RESTORE */}
        {activeTab === 'data' && (
          <div className="space-y-3 animate-in fade-in">
            {/* Current Database Stats */}
            <div className="bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl p-3">
              <span className="text-[9px] font-extrabold uppercase tracking-wider text-[var(--accent)] block mb-2">
                Active Client Database Contents
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

            {/* Backup to Phone */}
            <button
              type="button"
              onClick={handleBackupToPhone}
              className="w-full py-3 px-4 bg-[var(--surface-subtle)] hover:bg-[var(--border)] border border-[var(--border)] text-white font-extrabold text-xs rounded-xl shadow-xs flex items-center justify-between cursor-pointer transition-transform active:scale-98"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-base">📱</span>
                <div className="text-left">
                  <div className="font-extrabold text-xs text-white">Backup Data to Phone (.JSON)</div>
                  <div className="text-[9px] text-[var(--text-muted)] font-normal">Saves customer records &amp; notes to phone Downloads</div>
                </div>
              </div>
              <span className="text-xs text-[var(--accent)] font-bold">📥 Save JSON</span>
            </button>

            {/* Backup to Google Drive */}
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

            {/* Restore from File */}
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
        )}

        {/* Security & Privacy Footer */}
        <div className="text-[9.5px] text-[var(--text-muted)] text-center pt-1 font-medium border-t border-[var(--border)]">
          🔒 100% Private &amp; Offline. No third-party servers. Your files stay in your own hands.
        </div>
      </div>
    </div>
  );
};
