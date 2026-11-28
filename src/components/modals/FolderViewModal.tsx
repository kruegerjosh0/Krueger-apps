import React, { useState, useEffect } from 'react';
import { Customer, JobProject, ProjectDocMode } from '../../types';
import {
  signInWithGoogle,
  getAccessToken,
  createGoogleContact,
  updateGoogleContact,
  fetchGoogleContacts,
  GoogleContactPerson,
  createGoogleCalendarUrl,
} from '../../utils/googleWorkspace';
import {
  PIPELINE_STAGE_META,
  normalizePipelineStage,
  formatScheduledDate,
  resolveJobScheduledDate,
  getEstimateSnapshot,
  getFinalBillSnapshot,
  computeSnapshotTotals,
} from '../../utils/projectHelpers';
import {
  exportCustomerVcardToContacts,
  formatCustomerFirstSavedDate,
} from '../../utils/businessCard';
import {
  exportSingleCustomerJobIcs,
  getCustomerCalendarSyncStatus,
  buildGoogleCalendarTemplateUrl,
} from '../../utils/calendarIcs';

interface FolderViewModalProps {
  customer: Customer;
  onClose: () => void;
  onUpdateCustomer: (updated: Customer) => void;
  onDeleteCustomer: (id: number) => void;
  onOpenJobModal: (job?: JobProject, initialDocMode?: ProjectDocMode) => void;
  onDuplicateJob: (job: JobProject) => void;
  onDeleteJob: (jobId: number) => void;
  onGenerateDoc: (
    job: JobProject,
    type: 'ESTIMATE' | 'BILL' | 'MASTER RECORD',
    action: 'OPEN' | 'DOWNLOAD'
  ) => void;
  onGenerateCustomerRecord?: (customer: Customer) => void;
  onViewImage?: (dataUrl: string) => void;
  onViewDocFile?: (file: { name: string; data: string; tag?: string }) => void;
  onGenerateCollage?: () => void;
  onScheduleEstimate: () => void;
  onShareBusinessCard?: () => void;
  onMarkCalendarSynced?: (customerId: number, syncedAt: number) => void;
  onToast: (msg: string) => void;
}

export const FolderViewModal: React.FC<FolderViewModalProps> = ({
  customer,
  onClose,
  onUpdateCustomer,
  onDeleteCustomer,
  onOpenJobModal,
  onDuplicateJob,
  onDeleteJob,
  onGenerateDoc,
  onGenerateCustomerRecord,
  onScheduleEstimate,
  onShareBusinessCard,
  onMarkCalendarSynced,
  onToast,
}) => {
  const normalizedOverride =
    customer.statusOverride && customer.statusOverride !== 'AUTO'
      ? normalizePipelineStage(customer.statusOverride)
      : 'AUTO';

  const [name, setName] = useState(customer.name || '');
  const [address, setAddress] = useState(customer.address || '');
  const [phone, setPhone] = useState(customer.phone || '');
  const [email, setEmail] = useState(customer.email || '');
  const [notes, setNotes] = useState(customer.notes || '');
  const [statusOverride, setStatusOverride] = useState(normalizedOverride);

  useEffect(() => {
    setName(customer.name || '');
    setAddress(customer.address || '');
    setPhone(customer.phone || '');
    setEmail(customer.email || '');
    setNotes(customer.notes || '');
    setStatusOverride(
      customer.statusOverride && customer.statusOverride !== 'AUTO'
        ? normalizePipelineStage(customer.statusOverride)
        : 'AUTO'
    );
  }, [customer.id]);

  const saveProfileChanges = (field: string, val: string) => {
    const updated = { ...customer, [field]: val, lastActive: Date.now() };
    if (field === 'name') setName(val);
    if (field === 'address') setAddress(val);
    if (field === 'phone') setPhone(val);
    if (field === 'email') setEmail(val);
    if (field === 'notes') setNotes(val);
    if (field === 'statusOverride') setStatusOverride(val);
    onUpdateCustomer(updated);
  };

  const togglePinned = () => {
    onUpdateCustomer({ ...customer, isPinned: !customer.isPinned });
    onToast(customer.isPinned ? 'Unpinned customer' : '★ Customer pinned to top');
  };

  const sendEtaSms = () => {
    if (!phone) {
      alert('No phone number entered for this customer.');
      return;
    }
    const msg = `Hi ${name}, this is Josh from Krueger Painting. I am on my way to your job site right now! My ETA is roughly 15-20 minutes. See you soon!`;
    window.location.href = `sms:${phone}?body=${encodeURIComponent(msg)}`;
  };

  const sendReviewRequest = (type: 'SMS' | 'EMAIL') => {
    const reviewUrl = 'https://share.google/ip98U1DJ6dN52yrC3';
    const msg = `Hi ${name}, thank you for choosing Krueger Painting! If you are satisfied with our quality and craftsmanship, we would greatly appreciate a quick review: ${reviewUrl}`;
    if (type === 'SMS') {
      window.location.href = `sms:${phone}?body=${encodeURIComponent(msg)}`;
    } else {
      const su = encodeURIComponent('Krueger Painting - Review Request');
      const bo = encodeURIComponent(msg);
      const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email || '')}&su=${su}&body=${bo}`;
      const opened = window.open(gmailUrl, '_blank');
      if (!opened) {
        window.location.href = `mailto:${email}?subject=${su}&body=${bo}`;
      }
    }
  };

  const handleSaveToPhoneContacts = () => {
    const resolvedCreatedAt = customer.createdAt || new Date().toISOString();
    const customerForExport: Customer = {
      ...customer,
      name: name.trim() || customer.name,
      address: address.trim(),
      phone: phone.trim(),
      email: email.trim(),
      createdAt: resolvedCreatedAt,
    };

    // Persist initial createdAt date onto older records that didn't have one yet
    if (!customer.createdAt) {
      onUpdateCustomer(customerForExport);
    }

    const { firstSavedLabel } = exportCustomerVcardToContacts(customerForExport);
    onToast(`✔ Contact Card (.vcf) Ready • First saved: ${firstSavedLabel}`);
  };

  const handleSyncJobToCalendar = async (targetJob?: JobProject) => {
    const latestCust: Customer = {
      ...customer,
      name: name.trim() || customer.name,
      address: address.trim(),
      phone: phone.trim(),
      email: email.trim(),
    };
    const result = await exportSingleCustomerJobIcs(latestCust, targetJob);
    if (result.exportedCount === 0) {
      onToast('Set a scheduled start date first to sync to calendar.');
      return;
    }
    if (onMarkCalendarSynced) {
      onMarkCalendarSynced(customer.id, Date.now());
    }
    const seq = latestCust.calendarSequence ?? 0;
    onToast(`✔ Downloaded single-event .ICS (Seq #${seq} — overwrite-safe)`);
  };

  const calendarSyncStatus = getCustomerCalendarSyncStatus(customer);
  const mapUrl = `http://maps.google.com/?q=${encodeURIComponent(address || '')}`;
  const firstSavedDisplay = formatCustomerFirstSavedDate(customer.createdAt);

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex flex-col p-2 sm:p-5 overflow-y-auto animate-in fade-in">
      <div className="max-w-2xl w-full mx-auto bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 sm:p-5 shadow-2xl space-y-3.5 my-auto">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[var(--border)] pb-2.5 gap-2">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--accent)]">
              Customer File Cabinet • First saved: {firstSavedDisplay}
            </span>
            <h2 className="text-sm sm:text-lg font-black text-[var(--text)]">{name}</h2>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={togglePinned}
              className={`font-extrabold text-[10.5px] sm:text-[11px] px-2.5 py-1.5 rounded-lg border cursor-pointer transition-all active:scale-95 ${
                customer.isPinned
                  ? 'bg-[#f1c40f] text-[#231709] border-[#f1c40f] shadow'
                  : 'bg-[var(--surface-subtle)] text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
              }`}
              title="Pin priority customer to top"
            >
              {customer.isPinned ? '★ Pinned' : '☆ Pin'}
            </button>
            <button
              type="button"
              onClick={onScheduleEstimate}
              className="bg-[var(--accent)] hover:opacity-95 text-white font-extrabold text-[10.5px] sm:text-[11px] px-2.5 sm:px-3 py-1.5 rounded-lg shadow cursor-pointer transition-transform active:scale-95"
            >
              📅 Schedule Est
            </button>
            <button
              type="button"
              onClick={onClose}
              className="bg-[var(--surface-subtle)] hover:bg-[var(--border)] text-[var(--text)] font-bold text-xs px-2.5 sm:px-3 py-1.5 rounded-lg border border-[var(--border)] cursor-pointer"
            >
              ✕ Close
            </button>
          </div>
        </div>

        {/* Profile Inputs */}
        <div className="space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] uppercase font-bold text-[var(--text-muted)] tracking-wider block mb-1">
                Name
              </label>
              <input
                name="name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => saveProfileChanges('name', e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded-lg px-3 py-2 text-xs outline-none"
              />
            </div>
            <div>
              <label className="text-[9px] uppercase font-bold text-[var(--text-muted)] tracking-wider block mb-1">
                Address
              </label>
              <input
                name="street-address"
                type="text"
                autoComplete="street-address"
                value={address}
                onChange={(e) => saveProfileChanges('address', e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded-lg px-3 py-2 text-xs outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] uppercase font-bold text-[var(--text-muted)] tracking-wider block mb-1">
                Phone
              </label>
              <input
                name="tel"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => saveProfileChanges('phone', e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded-lg px-3 py-2 text-xs outline-none"
              />
            </div>
            <div>
              <label className="text-[9px] uppercase font-bold text-[var(--text-muted)] tracking-wider block mb-1">
                Email
              </label>
              <input
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => saveProfileChanges('email', e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded-lg px-3 py-2 text-xs outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-[9px] uppercase font-bold text-[var(--text-muted)] tracking-wider block mb-1">
              Pipeline Stage Override
            </label>
            <select
              autoComplete="off"
              value={statusOverride}
              onChange={(e) => saveProfileChanges('statusOverride', e.target.value)}
              className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg px-3 py-2 text-xs outline-none"
            >
              <option value="AUTO">Auto (Based on Projects)</option>
              <option value="ACTIVE">Active</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="PENDING">Pending</option>
              <option value="COMPLETED">Complete / Paid</option>
            </select>
          </div>
        </div>

        {/* Quick Communication Bar */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1">
          <a
            href={`tel:${phone}`}
            className="py-1.5 px-0.5 text-center bg-[var(--surface-subtle)] hover:bg-[var(--accent)] hover:text-white rounded-lg border border-[var(--border)] text-[9.5px] sm:text-[10px] font-bold text-[var(--text)] flex items-center justify-center gap-1 transition-colors"
          >
            📞 Call
          </a>
          <a
            href={`sms:${phone}`}
            className="py-1.5 px-0.5 text-center bg-[var(--surface-subtle)] hover:bg-[var(--accent)] hover:text-white rounded-lg border border-[var(--border)] text-[9.5px] sm:text-[10px] font-bold text-[var(--text)] flex items-center justify-center gap-1 transition-colors"
          >
            💬 Text
          </a>
          <button
            type="button"
            onClick={sendEtaSms}
            className="py-1.5 px-0.5 text-center bg-[var(--accent-secondary)] text-white rounded-lg text-[9.5px] sm:text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-transform active:scale-95"
          >
            🚗 ETA Text
          </button>
          <a
            href={mapUrl}
            target="_blank"
            rel="noreferrer"
            className="py-1.5 px-0.5 text-center bg-[var(--surface-subtle)] hover:bg-[var(--accent)] hover:text-white rounded-lg border border-[var(--border)] text-[9.5px] sm:text-[10px] font-bold text-[var(--text)] flex items-center justify-center gap-1 transition-colors"
          >
            🗺️ Map
          </a>
          <button
            type="button"
            onClick={() => sendReviewRequest('SMS')}
            className="py-1.5 px-0.5 text-center bg-purple-600 text-white rounded-lg text-[9.5px] sm:text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-transform active:scale-95"
          >
            💬 SMS Rev
          </button>
          <button
            type="button"
            onClick={() => sendReviewRequest('EMAIL')}
            className="py-1.5 px-0.5 text-center bg-purple-600 text-white rounded-lg text-[9.5px] sm:text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-transform active:scale-95"
          >
            📧 Email Rev
          </button>
        </div>

        {/* Contact Export, Business Card & 1-Page Master Customer Record Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={handleSaveToPhoneContacts}
            className="py-2 px-3 bg-[#1c2e1f] hover:bg-[#243c28] border border-[#30d158]/60 text-[#30d158] font-extrabold text-[10.5px] rounded-lg cursor-pointer transition-transform active:scale-95 flex items-center justify-center gap-1.5 shadow-xs"
            title="Download/open standard vCard (.vcf) to save this customer to phone contacts"
          >
            <span>📇</span>
            <span>Save to Phone Contacts</span>
          </button>
          {onShareBusinessCard && (
            <button
              type="button"
              onClick={onShareBusinessCard}
              className="py-2 px-3 bg-[#111111] hover:bg-[#1c1d25] border border-[#f1c40f]/70 text-[#f1c40f] font-extrabold text-[10.5px] rounded-lg cursor-pointer transition-transform active:scale-95 flex items-center justify-center gap-1.5 shadow-xs"
              title="Share Joshua Krueger — Krueger Painting digital business card or .vcf"
            >
              <span>💼</span>
              <span>Share Business Card</span>
            </button>
          )}
          {onGenerateCustomerRecord && (
            <button
              type="button"
              onClick={() =>
                onGenerateCustomerRecord({
                  ...customer,
                  name: name.trim() || customer.name,
                  address: address.trim(),
                  phone: phone.trim(),
                  email: email.trim(),
                  notes,
                  statusOverride,
                })
              }
              className="py-2 px-3 bg-[#0f172a] hover:bg-[#172554] border border-sky-400/60 text-sky-300 font-extrabold text-[10.5px] rounded-lg cursor-pointer transition-transform active:scale-95 flex items-center justify-center gap-1.5 shadow-xs"
              title="Download 1-page Master Customer Record PDF (all projects, totals, notes & paint/color log)"
            >
              <span>📋</span>
              <span>Customer Record PDF</span>
            </button>
          )}
        </div>

        {/* Customer General Notes */}
        <div>
          <label className="text-[9px] uppercase font-bold text-[var(--text-muted)] tracking-wider block mb-1">
            Site & Customer Notes
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => saveProfileChanges('notes', e.target.value)}
            placeholder="Gate codes, key locations, pet notes, special requests..."
            className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded-lg p-2 text-xs outline-none"
          />
        </div>

        {/* Project Estimates & Invoices List */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-wider text-[var(--accent)]">
              Projects, Estimates & Bills
            </h3>
            <button
              type="button"
              onClick={() => onOpenJobModal()}
              className="bg-[var(--accent-secondary)] hover:opacity-95 text-white font-extrabold text-[11px] px-3 py-1.5 rounded-lg shadow cursor-pointer transition-transform active:scale-95"
            >
              + New Project
            </button>
          </div>

          <div className="space-y-2.5">
            {(customer.jobs || []).map((j, idx) => {
              const isDraft = j.status === 'DRAFT';
              const stage = normalizePipelineStage(j.status);
              const stageMeta = PIPELINE_STAGE_META[stage];
              const statusBg = isDraft ? '#64748b' : stageMeta.color;
              const statusLabel = isDraft ? 'Draft / Unquoted' : stageMeta.label;
              const statusTextColor = isDraft ? '#ffffff' : stageMeta.textColor;

              const estSnap = getEstimateSnapshot(j);
              const estTotals = computeSnapshotTotals(estSnap);
              const billSnap = getFinalBillSnapshot(j);
              const billTotals = billSnap ? computeSnapshotTotals(billSnap) : null;

              const resolvedJobDate = resolveJobScheduledDate(j);
              const dateRange = resolvedJobDate
                ? j.schedEndDate && j.schedEndDate !== resolvedJobDate
                  ? `${formatScheduledDate(resolvedJobDate)} ➔ ${formatScheduledDate(j.schedEndDate)}`
                  : formatScheduledDate(resolvedJobDate)
                : 'No Date Set';

              const handleFinalBillPdf = (action: 'OPEN' | 'DOWNLOAD') => {
                if (j.finalBill) {
                  onGenerateDoc(j, 'BILL', action);
                  return;
                }
                // Auto-initialize finalBill as an independent deep copy of estimate so View PDF / Download work immediately
                const initializedBill = getEstimateSnapshot(j);
                initializedBill.updatedAt = new Date().toISOString();
                const updatedJob: JobProject = {
                  ...j,
                  finalBill: initializedBill,
                };
                const updatedJobs = (customer.jobs || []).map((item) =>
                  item.id === j.id ? updatedJob : item
                );
                onUpdateCustomer({ ...customer, jobs: updatedJobs });
                onGenerateDoc(updatedJob, 'BILL', action);
              };

              return (
                <div
                  key={j.id}
                  data-project-card={j.id}
                  className="bg-[var(--bg)] border border-[var(--border)] rounded-xl p-3.5 shadow-sm space-y-2.5 relative"
                  style={{ borderLeft: `4px solid ${statusBg}` }}
                >
                  <button
                    type="button"
                    onClick={() => onDeleteJob(j.id)}
                    className="absolute top-2.5 right-2.5 text-[9px] text-red-500 font-bold border border-red-500/40 hover:bg-red-500 hover:text-white px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                  >
                    Delete
                  </button>

                  {/* Project Header: Title, Date, Status, and Single Google Cal + .ICS Controls */}
                  <div className="pr-12 space-y-1.5">
                    <input
                      type="text"
                      autoComplete="off"
                      defaultValue={j.title || `Project #${idx + 1}`}
                      onBlur={(e) => {
                        const updatedJobs = customer.jobs.map((item) =>
                          item.id === j.id ? { ...item, title: e.target.value.trim() } : item
                        );
                        onUpdateCustomer({ ...customer, jobs: updatedJobs });
                      }}
                      className="font-black text-sm text-[var(--text)] bg-transparent border-b border-dashed border-[var(--border)] focus:border-[var(--accent)] w-full outline-none"
                    />
                    <div className="text-[10px] text-[var(--text-muted)] font-semibold">
                      📅 Scheduled: <b>{dateRange}</b> • Created: {j.date}
                    </div>
                  </div>

                  {/* Status Pill + Single Header Calendar Controls */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-dashed border-[var(--border)]">
                    <span
                      style={{ backgroundColor: statusBg, color: statusTextColor }}
                      className="text-[8.5px] font-black uppercase px-2 py-0.5 rounded"
                    >
                      {statusLabel}
                    </span>

                    {j.schedDate ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <a
                          href={buildGoogleCalendarTemplateUrl(
                            {
                              ...customer,
                              name: name.trim() || customer.name,
                              address: address.trim(),
                              phone: phone.trim(),
                              email: email.trim(),
                            },
                            j
                          )}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => {
                            if (onMarkCalendarSynced) {
                              onMarkCalendarSynced(customer.id, Date.now());
                            }
                          }}
                          className="text-[9.5px] font-black px-2 py-0.5 rounded-md bg-[#0a84ff] hover:opacity-95 text-white transition-transform active:scale-95 flex items-center gap-1 shadow-xs"
                          title="Open directly in Google Calendar app"
                        >
                          <span>📅</span>
                          <span>Open in Google Calendar</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => handleSyncJobToCalendar(j)}
                          className={`text-[9.5px] font-black px-2 py-0.5 rounded-md border cursor-pointer transition-transform active:scale-95 flex items-center gap-1 ${
                            calendarSyncStatus === 'SYNCED'
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/25'
                              : 'bg-[var(--surface-subtle)] text-[var(--text)] border-[var(--border)] hover:border-[#f1c40f]/60'
                          }`}
                          title="Download single-event overwrite-safe .ics file"
                        >
                          <span>📥</span>
                          <span>{calendarSyncStatus === 'SYNCED' ? '.ICS ✓' : '.ICS'}</span>
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          onOpenJobModal(j, 'ESTIMATE');
                          onToast('Set a start date to add this project to Google Calendar');
                        }}
                        className="text-[9.5px] font-bold px-2 py-0.5 rounded-md bg-[var(--surface-subtle)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer flex items-center gap-1"
                        title="Set a start date first to sync to Google Calendar"
                      >
                        <span>📅</span>
                        <span>Google Cal</span>
                      </button>
                    )}
                  </div>

                  {/* Symmetrical ESTIMATE Section (Edit | View PDF | Download) */}
                  <div
                    data-doc-section="estimate"
                    className="bg-[var(--surface)] border border-[#f1c40f]/30 rounded-lg p-2 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9.5px] font-black uppercase tracking-wider text-[#f1c40f] flex items-center gap-1">
                        <span>📄</span>
                        <span>Estimate</span>
                      </span>
                      <span className="text-[11px] font-black text-[#f1c40f]">
                        Est: ${estTotals.grossTotal.toLocaleString()}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => onOpenJobModal(j, 'ESTIMATE')}
                        className="py-2 bg-[#1c1d25] hover:bg-[#262833] border border-[#f1c40f]/45 text-[#f1c40f] font-extrabold text-[10.5px] rounded-lg cursor-pointer transition-transform active:scale-95 flex items-center justify-center gap-1"
                        title="Edit Estimate document"
                      >
                        <span>✏️</span>
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onGenerateDoc(j, 'ESTIMATE', 'OPEN')}
                        className="py-2 bg-[#f1c40f] hover:bg-[#d4ac0d] text-[#111111] font-black text-[10.5px] rounded-lg cursor-pointer transition-transform active:scale-95 flex items-center justify-center gap-1 shadow-xs"
                        title="View Estimate PDF preview"
                      >
                        <span>📄</span>
                        <span>View PDF</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onGenerateDoc(j, 'ESTIMATE', 'DOWNLOAD')}
                        className="py-2 bg-[#111111] hover:bg-[#1c1d25] border border-[#f1c40f]/60 text-[#f1c40f] font-extrabold text-[10.5px] rounded-lg cursor-pointer transition-transform active:scale-95 flex items-center justify-center gap-1"
                        title="Download Estimate PDF"
                      >
                        <span>💾</span>
                        <span>Download</span>
                      </button>
                    </div>
                  </div>

                  {/* Symmetrical FINAL BILL Section (Edit/Create | View PDF | Download) */}
                  <div
                    data-doc-section="final-bill"
                    className="bg-[var(--surface)] border border-[#30d158]/30 rounded-lg p-2 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9.5px] font-black uppercase tracking-wider text-[#30d158] flex items-center gap-1">
                        <span>💳</span>
                        <span>Final Bill</span>
                      </span>
                      {billTotals ? (
                        <span className="text-[11px] font-black text-[#30d158]">
                          Final: ${billTotals.grossTotal.toLocaleString()}
                          {billTotals.totalPaid > 0
                            ? ` (Bal $${billTotals.balanceDue.toLocaleString()})`
                            : ''}
                        </span>
                      ) : (
                        <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-600/60">
                          Not Created
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => onOpenJobModal(j, 'FINAL_BILL')}
                        className="py-2 bg-[#142417] hover:bg-[#1c3220] border border-[#30d158]/45 text-[#30d158] font-extrabold text-[10.5px] rounded-lg cursor-pointer transition-transform active:scale-95 flex items-center justify-center gap-1"
                        title={
                          billSnap
                            ? 'Edit Final Bill document'
                            : 'Create Final Bill from a copy of this Estimate'
                        }
                      >
                        <span>{billSnap ? '✏️' : '➕'}</span>
                        <span>{billSnap ? 'Edit' : 'Create'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFinalBillPdf('OPEN')}
                        className="py-2 bg-[#30d158] hover:opacity-95 text-[#081c0d] font-black text-[10.5px] rounded-lg cursor-pointer transition-transform active:scale-95 flex items-center justify-center gap-1 shadow-xs"
                        title="View Final Bill PDF preview"
                      >
                        <span>💳</span>
                        <span>View PDF</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleFinalBillPdf('DOWNLOAD')}
                        className="py-2 bg-[#1c2e1f] hover:bg-[#243c28] border border-[#30d158]/60 text-[#30d158] font-extrabold text-[10.5px] rounded-lg cursor-pointer transition-transform active:scale-95 flex items-center justify-center gap-1"
                        title="Download Final Bill PDF"
                      >
                        <span>💾</span>
                        <span>Download</span>
                      </button>
                    </div>
                  </div>

                  {/* Clean Project Footer Row */}
                  <div className="pt-0.5">
                    <button
                      type="button"
                      onClick={() => onDuplicateJob(j)}
                      className="w-full py-2 bg-[var(--surface-subtle)] hover:border-sky-400 border border-[var(--border)] text-sky-300 font-extrabold text-[10.5px] rounded-lg cursor-pointer transition-transform active:scale-95 flex items-center justify-center gap-1.5"
                      title="Clone this project as an independent Draft copy"
                    >
                      <span>📑</span>
                      <span>Duplicate Project</span>
                    </button>
                  </div>
                </div>
              );
            })}

            {(!customer.jobs || customer.jobs.length === 0) && (
              <div className="text-center py-6 bg-[var(--bg)] border border-dashed border-[var(--border)] rounded-xl text-xs text-[var(--text-muted)]">
                No projects created yet for {name}. Tap &ldquo;+ New Project&rdquo; to build an estimate.
              </div>
            )}
          </div>
        </div>

        {/* Delete Customer Button */}
        <div className="pt-2 border-t border-[var(--border)] flex justify-between items-center">
          <button
            type="button"
            onClick={() => {
              if (confirm(`Are you sure you want to permanently delete customer "${customer.name}" and all records?`)) {
                onDeleteCustomer(customer.id);
                onClose();
              }
            }}
            className="text-[10px] text-red-500 hover:text-red-400 font-bold border border-red-500/30 rounded-lg px-3 py-1.5 cursor-pointer"
          >
            Delete Customer Folder
          </button>
          <button
            type="button"
            onClick={onClose}
            className="bg-[var(--surface-subtle)] text-[var(--text)] text-xs font-bold px-4 py-2 rounded-lg border border-[var(--border)] cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
