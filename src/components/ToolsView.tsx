import React from 'react';

interface ToolsViewProps {
  onOpenLetterhead?: () => void;
  onOpenBusinessCard?: () => void;
  onOpenTaxReport: () => void;
  onOpenCalc: () => void;
  onOpenPriceBook: () => void;
  onOpenColorDb: () => void;
  onOpenMileage: () => void;
  onOpenExpenses: () => void;
  onOpenShoppingList: () => void;
  onSyncCalendar: () => void;
  onOpenSettings: () => void;
  onOpenCloudSync?: () => void;
}

export const ToolsView: React.FC<ToolsViewProps> = ({
  onOpenLetterhead,
  onOpenBusinessCard,
  onOpenTaxReport,
  onOpenCalc,
  onOpenPriceBook,
  onOpenColorDb,
  onOpenMileage,
  onOpenExpenses,
  onOpenShoppingList,
  onSyncCalendar,
  onOpenSettings,
  onOpenCloudSync,
}) => {
  const tools = [
    { title: 'Share Business Card', icon: '💼', desc: 'Send card image or .vcf contact', action: onOpenBusinessCard || onOpenSettings },
    { title: 'Blank Letterhead PDF', icon: '📝', desc: 'Official black & yellow stationery PDF', action: onOpenLetterhead || onOpenSettings },
    { title: 'Backup & Restore', icon: '💾', desc: 'Download or upload .JSON data backup', action: onOpenCloudSync || onOpenSettings },
    { title: 'Sync Calendar', icon: '📅', desc: 'Zero-auth .ICS weekly batch sync', action: onSyncCalendar },
    { title: 'Tax Report', icon: '📊', desc: 'Monthly gross & IRS deductions', action: onOpenTaxReport },
    { title: 'Calculator', icon: '📐', desc: 'Net sqft & 2-coat paint gals', action: onOpenCalc },
    { title: 'Price Book', icon: '🏷️', desc: 'Sherwin & Menards prices', action: onOpenPriceBook },
    { title: 'Color DB', icon: '🎨', desc: 'Logged formulas & sheens', action: onOpenColorDb },
    { title: 'Mileage Log', icon: '🚗', desc: 'IRS 67¢/mi auto deduction', action: onOpenMileage },
    { title: 'Expenses & OCR', icon: '🧾', desc: 'Receipt scanner & ledger', action: onOpenExpenses },
    { title: 'Shopping List', icon: '🛒', desc: 'Tape, plastic & paint checklist', action: onOpenShoppingList },
    { title: 'Settings', icon: '⚙️', desc: 'Themes, rates & print terms', action: onOpenSettings },
  ];

  return (
    <div className="space-y-4 max-w-2xl mx-auto pb-20">
      <div>
        <h2 className="text-base font-extrabold uppercase tracking-wide text-[var(--accent)]">
          Contractor Suite &amp; Pro Tools
        </h2>
        <p className="text-[11px] text-[var(--text-muted)]">
          Estimating, logistics, tax bookkeeping &amp; field management
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
