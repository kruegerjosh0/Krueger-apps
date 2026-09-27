import React from 'react';

interface ToolsViewProps {
  onOpenTaxReport: () => void;
  onOpenCalc: () => void;
  onOpenPriceBook: () => void;
  onOpenColorDb: () => void;
  onOpenMileage: () => void;
  onOpenExpenses: () => void;
  onOpenShoppingList: () => void;
  onOpenWebPhotos: () => void;
  onOpenRegionalMap: () => void;
  onSyncCalendar: () => void;
  onOpenSettings: () => void;
  onOpenCloudSync?: () => void;
  onOpenApkInstaller?: () => void;
}

export const ToolsView: React.FC<ToolsViewProps> = ({
  onOpenTaxReport,
  onOpenCalc,
  onOpenPriceBook,
  onOpenColorDb,
  onOpenMileage,
  onOpenExpenses,
  onOpenShoppingList,
  onOpenWebPhotos,
  onOpenRegionalMap,
  onSyncCalendar,
  onOpenSettings,
  onOpenCloudSync,
  onOpenApkInstaller,
}) => {
  const triggerDownload = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportSingleHtml = () => {
    if (onOpenCloudSync) {
      onOpenCloudSync();
    } else {
      triggerDownload('/api/export-single-html', 'krueger-painting-app.html');
    }
  };

  const handleExportZip = () => {
    triggerDownload('/api/export-project-zip', 'krueger-painting-os.zip');
  };

  const tools = [
    { title: 'Install App (PWA)', icon: '📱', desc: '1-tap home screen app with offline caching', action: onOpenApkInstaller || onOpenSettings },
    { title: 'Backup & Restore', icon: '💾', desc: 'Save JSON to phone or Google Drive, or restore', action: onOpenCloudSync || onOpenSettings },
    { title: 'Offline HTML File', icon: '📄', desc: 'Download single-file archive for PC or laptop', action: handleExportSingleHtml },
    { title: 'Export Code (ZIP)', icon: '📦', desc: 'Download full app project for external editing', action: handleExportZip },
    { title: 'Tax Report', icon: '📊', desc: 'Monthly gross & IRS deductions', action: onOpenTaxReport },
    { title: 'Calculator', icon: '📐', desc: 'Net sqft & 2-coat paint gals', action: onOpenCalc },
    { title: 'Price Book', icon: '🏷️', desc: 'Sherwin & Menards prices', action: onOpenPriceBook },
    { title: 'Color DB', icon: '🎨', desc: 'Logged formulas & sheens', action: onOpenColorDb },
    { title: 'Mileage Log', icon: '🚗', desc: 'IRS 67¢/mi auto deduction', action: onOpenMileage },
    { title: 'Expenses & OCR', icon: '🧾', desc: 'Receipt scanner & ledger', action: onOpenExpenses },
    { title: 'Shopping List', icon: '🛒', desc: 'Tape, plastic & paint checklist', action: onOpenShoppingList },
    { title: 'Web Photos', icon: '🌐', desc: 'Netlify HTML portfolio tags', action: onOpenWebPhotos },
    { title: 'Regional Map', icon: '🗺️', desc: 'All client sites plotted', action: onOpenRegionalMap },
    { title: 'Sync Calendar', icon: '📅', desc: 'Export jobs to phone cal (.ICS)', action: onSyncCalendar },
    { title: 'Settings', icon: '⚙️', desc: 'Themes, rates & print terms', action: onOpenSettings },
  ];

  return (
    <div className="space-y-4 max-w-2xl mx-auto pb-20">
      <div>
        <h2 className="text-base font-extrabold uppercase tracking-wide text-[var(--accent)]">
          Contractor Suite & Pro Tools
        </h2>
        <p className="text-[11px] text-[var(--text-muted)]">
          Estimating, logistics, tax bookkeeping & field management
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-2.5">
        {tools.map((t) => (
          <button
            key={t.title}
            type="button"
            onClick={t.action}
            className="bg-[var(--surface)] hover:border-[var(--accent)] border border-[var(--border)] p-3 sm:p-4 rounded-xl flex flex-col items-center justify-center text-center gap-1 sm:gap-1.5 shadow-sm transition-all active:scale-95 cursor-pointer"
          >
            <span className="text-xl sm:text-2xl">{t.icon}</span>
            <span className="font-extrabold text-[11px] sm:text-xs uppercase tracking-wide text-[var(--text)] truncate max-w-full">
              {t.title}
            </span>
            <span className="text-[9.5px] sm:text-[10px] text-[var(--text-muted)] leading-tight line-clamp-2">
              {t.desc}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
