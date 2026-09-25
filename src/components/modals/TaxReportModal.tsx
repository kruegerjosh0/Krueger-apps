import React, { useState } from 'react';
import { Customer, ExpenseEntry, MileageEntry, SystemConstants } from '../../types';

interface TaxReportModalProps {
  customers: Customer[];
  expenses: ExpenseEntry[];
  mileage: MileageEntry[];
  constants: SystemConstants;
  onClose: () => void;
}

export const TaxReportModal: React.FC<TaxReportModalProps> = ({
  customers,
  expenses,
  mileage,
  constants,
  onClose,
}) => {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);

  // Compute month's revenue from completed/paid/active jobs
  let grossRev = 0;
  const jobRows: { date: string; client: string; title: string; total: number; status: string }[] = [];

  customers.forEach((c) => {
    (c.jobs || []).forEach((j) => {
      const jDate = j.schedDate || j.date;
      if (jDate && jDate.startsWith(selectedMonth)) {
        const repairRate = Math.round(j.repairRate || constants.repairRate);
        let labor = 0;
        (j.rooms || []).forEach((r) => (labor += Math.round(Number(r.r) || 0)));
        let repH = 0;
        (j.repairs || []).forEach((r) => (repH += parseFloat(String(r.h)) || 0));
        const repCost = Math.round(repH * repairRate);

        const dVal = parseFloat(String(j.disc)) || 0;
        const dAmt = j.discType === 'PCT' ? Math.round(labor * (dVal / 100)) : Math.round(dVal);
        const mats = j.matsIncluded ? 0 : Math.round(parseFloat(String(j.matVal)) || 0);
        const sun = j.matsIncluded ? 0 : Math.round(parseFloat(String(j.sunVal)) || 0);

        const total = Math.round(labor - dAmt + repCost + mats + sun);
        grossRev += total;
        jobRows.push({
          date: jDate,
          client: c.name,
          title: j.title || 'Project',
          total,
          status: j.status,
        });
      }
    });
  });

  // Expenses for the month
  let totalExpenses = 0;
  const expRows: ExpenseEntry[] = [];
  expenses.forEach((e) => {
    if (e.date && e.date.startsWith(selectedMonth)) {
      totalExpenses += Math.round(e.amount);
      expRows.push(e);
    }
  });

  // Mileage for the month
  let totalMiles = 0;
  mileage.forEach((m) => {
    if (m.date && m.date.startsWith(selectedMonth)) {
      totalMiles += m.miles;
    }
  });

  const milesDeduction = Math.round(totalMiles * (constants.irsRate || 0.67));
  const netOperatingProfit = grossRev - totalExpenses - milesDeduction;

  const exportCsv = () => {
    let csv = `data:text/csv;charset=utf-8,Monthly Tax & Bookkeeping Report - ${selectedMonth}\n\nType,Date,Entity/Vendor,Details,Amount ($)\n`;

    jobRows.forEach((j) => {
      csv += `"REVENUE","${j.date}","${j.client.replace(/"/g, '""')}","${j.title.replace(/"/g, '""')} (${j.status})",${j.total}\n`;
    });

    expRows.forEach((e) => {
      csv += `"EXPENSE","${e.date}","${e.vendor.replace(/"/g, '""')}","${e.category}",-${Math.round(e.amount)}\n`;
    });

    if (totalMiles > 0) {
      csv += `"MILEAGE_DEDUCTION","${selectedMonth}-01","IRS Standard Mileage","${totalMiles.toFixed(1)} miles @ ${constants.irsRate}c/mi",-${milesDeduction}\n`;
    }

    const encodedUri = encodeURI(csv);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Krueger_Bookkeeping_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex flex-col p-3 sm:p-5 overflow-y-auto animate-in fade-in">
      <div className="max-w-2xl w-full mx-auto bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4 my-auto">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--accent)]">
              Tax & Bookkeeping
            </span>
            <h2 className="text-base font-black text-[var(--text)]">Monthly Operating Report</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="bg-[var(--surface-subtle)] text-[var(--text)] font-bold text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] cursor-pointer"
          >
            ✕ Back
          </button>
        </div>

        {/* Month Selector */}
        <div className="flex items-center justify-between gap-3 bg-[var(--surface-subtle)] p-3 rounded-xl border border-[var(--border)]">
          <label className="text-xs font-bold text-[var(--text)]">Select Report Month:</label>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg px-3 py-1.5 text-xs outline-none font-bold"
          />
        </div>

        {/* 4 Summary Cards */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="bg-[var(--surface-subtle)] border-l-4 border-l-[var(--accent-tertiary)] p-3 rounded-xl border border-[var(--border)] shadow-sm">
            <span className="text-[9px] uppercase font-bold text-[var(--text-muted)]">Gross Revenue</span>
            <div className="text-xl font-black text-[var(--accent-tertiary)] mt-0.5">${grossRev}</div>
          </div>
          <div className="bg-[var(--surface-subtle)] border-l-4 border-l-red-500 p-3 rounded-xl border border-[var(--border)] shadow-sm">
            <span className="text-[9px] uppercase font-bold text-[var(--text-muted)]">Logged Expenses</span>
            <div className="text-xl font-black text-red-500 mt-0.5">${totalExpenses}</div>
          </div>
          <div className="bg-[var(--surface-subtle)] border-l-4 border-l-[var(--accent-secondary)] p-3 rounded-xl border border-[var(--border)] shadow-sm">
            <span className="text-[9px] uppercase font-bold text-[var(--text-muted)]">
              IRS Mileage ({totalMiles.toFixed(1)} mi)
            </span>
            <div className="text-xl font-black text-[var(--accent-secondary)] mt-0.5">${milesDeduction}</div>
          </div>
          <div className="bg-[var(--surface-subtle)] border-l-4 border-l-[var(--accent)] p-3 rounded-xl border border-[var(--border)] shadow-sm">
            <span className="text-[9px] uppercase font-bold text-[var(--text-muted)]">Net Operating Profit</span>
            <div className="text-xl font-black text-[var(--accent)] mt-0.5">${netOperatingProfit}</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={exportCsv}
            className="py-2.5 bg-[var(--accent-secondary)] text-white font-extrabold text-xs rounded-xl shadow cursor-pointer transition-transform active:scale-95"
          >
            💾 Export CSV
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="py-2.5 bg-[var(--accent)] text-white font-extrabold text-xs rounded-xl shadow cursor-pointer transition-transform active:scale-95"
          >
            🖨️ Printable Summary
          </button>
        </div>

        {/* Detailed Tables */}
        <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
          <div>
            <h4 className="text-xs font-bold text-[var(--accent)] uppercase mb-1.5">
              Invoiced Projects ({jobRows.length})
            </h4>
            <div className="space-y-1 text-xs">
              {jobRows.map((j, idx) => (
                <div
                  key={idx}
                  className="bg-[var(--bg)] p-2 rounded-lg border border-[var(--border)] flex justify-between items-center"
                >
                  <div>
                    <span className="font-bold text-[var(--text)]">{j.client}</span>
                    <span className="text-[10px] text-[var(--text-muted)] ml-2">({j.title})</span>
                  </div>
                  <div className="font-black text-[var(--accent)]">${j.total}</div>
                </div>
              ))}
              {jobRows.length === 0 && (
                <div className="text-center py-3 text-xs text-[var(--text-muted)] bg-[var(--bg)] rounded-lg border border-[var(--border)]">
                  No projects scheduled for this month.
                </div>
              )}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold text-red-400 uppercase mb-1.5">
              Logged Expenses ({expRows.length})
            </h4>
            <div className="space-y-1 text-xs">
              {expRows.map((e, idx) => (
                <div
                  key={idx}
                  className="bg-[var(--bg)] p-2 rounded-lg border border-[var(--border)] flex justify-between items-center"
                >
                  <div>
                    <span className="font-bold text-[var(--text)]">{e.vendor}</span>
                    <span className="text-[10px] text-[var(--text-muted)] ml-2">({e.category})</span>
                  </div>
                  <div className="font-black text-red-500">-${Math.round(e.amount)}</div>
                </div>
              ))}
              {expRows.length === 0 && (
                <div className="text-center py-3 text-xs text-[var(--text-muted)] bg-[var(--bg)] rounded-lg border border-[var(--border)]">
                  No expenses logged for this month.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
