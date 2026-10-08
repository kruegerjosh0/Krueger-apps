import React, { useState } from 'react';
import { Customer, JobProject, CustomerFile } from '../../types';
import {
  signInWithGoogle,
  getAccessToken,
  createGoogleContact,
  updateGoogleContact,
  fetchGoogleContacts,
  GoogleContactPerson,
  createGoogleCalendarUrl,
} from '../../utils/googleWorkspace';

interface FolderViewModalProps {
  customer: Customer;
  onClose: () => void;
  onUpdateCustomer: (updated: Customer) => void;
  onDeleteCustomer: (id: number) => void;
  onOpenJobModal: (job?: JobProject) => void;
  onDeleteJob: (jobId: number) => void;
  onGenerateDoc: (job: JobProject, type: 'ESTIMATE' | 'BILL' | 'MASTER RECORD') => void;
  onViewImage: (dataUrl: string) => void;
  onViewDocFile?: (file: { name: string; data: string; tag?: string }) => void;
  onGenerateCollage: () => void;
  onScheduleEstimate: () => void;
  onToast: (msg: string) => void;
}

export const FolderViewModal: React.FC<FolderViewModalProps> = ({
  customer,
  onClose,
  onUpdateCustomer,
  onDeleteCustomer,
  onOpenJobModal,
  onDeleteJob,
  onGenerateDoc,
  onViewImage,
  onViewDocFile,
  onGenerateCollage,
  onScheduleEstimate,
  onToast,
}) => {
  const [name, setName] = useState(customer.name);
  const [address, setAddress] = useState(customer.address);
  const [phone, setPhone] = useState(customer.phone);
  const [email, setEmail] = useState(customer.email);
  const [notes, setNotes] = useState(customer.notes);
  const [statusOverride, setStatusOverride] = useState(customer.statusOverride || 'AUTO');
  const [fileTag, setFileTag] = useState<'BEFORE' | 'ACTIVE' | 'AFTER' | 'DOC'>('BEFORE');

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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        const result = uploadEvent.target?.result as string;
        if (file.type.startsWith('image/')) {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const maxDim = 1200;
            let width = img.width;
            let height = img.height;
            if (width > height) {
              if (width > maxDim) {
                height = (height * maxDim) / width;
                width = maxDim;
              }
            } else {
              if (height > maxDim) {
                width = (width * maxDim) / height;
                height = maxDim;
              }
            }
            canvas.width = width;
            canvas.height = height;
            ctx?.drawImage(img, 0, 0, width, height);
            const compressed = canvas.toDataURL('image/jpeg', 0.8);

            const newFile: CustomerFile = {
              id: Date.now() + Math.random(),
              name: file.name,
              tag: fileTag,
              data: compressed,
              isImg: true,
              type: file.type,
            };
            const updated = {
              ...customer,
              files: [...(customer.files || []), newFile],
              lastActive: Date.now(),
            };
            onUpdateCustomer(updated);
            onToast('✔ Photo Uploaded');
          };
          img.src = result;
        } else {
          const newFile: CustomerFile = {
            id: Date.now() + Math.random(),
            name: file.name,
            tag: fileTag,
            data: result,
            isImg: false,
            type: file.type,
          };
          const updated = {
            ...customer,
            files: [...(customer.files || []), newFile],
            lastActive: Date.now(),
          };
          onUpdateCustomer(updated);
          onToast('✔ Document Uploaded');
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const deleteFile = (id: number) => {
    if (confirm('Delete this file?')) {
      const updated = {
        ...customer,
        files: (customer.files || []).filter((f) => f.id !== id),
      };
      onUpdateCustomer(updated);
      onToast('File Deleted');
    }
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

  const mapUrl = `http://maps.google.com/?q=${encodeURIComponent(address || '')}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex flex-col p-2 sm:p-5 overflow-y-auto animate-in fade-in">
      <div className="max-w-2xl w-full mx-auto bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 sm:p-5 shadow-2xl space-y-3.5 my-auto">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-[var(--border)] pb-2.5 gap-2">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--accent)]">
              Customer File Cabinet
            </span>
            <h2 className="text-sm sm:text-lg font-black text-[var(--text)]">{name}</h2>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
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
                type="text"
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
                type="text"
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
                type="tel"
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
                type="email"
                value={email}
                onChange={(e) => saveProfileChanges('email', e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded-lg px-3 py-2 text-xs outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-[9px] uppercase font-bold text-[var(--text-muted)] tracking-wider block mb-1">
              Master Status Override
            </label>
            <select
              value={statusOverride}
              onChange={(e) => saveProfileChanges('statusOverride', e.target.value)}
              className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg px-3 py-2 text-xs outline-none"
            >
              <option value="AUTO">Auto (Based on Active Projects)</option>
              <option value="NEW">NEW</option>
              <option value="PENDING">PENDING</option>
              <option value="SCHEDULED">SCHEDULED</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="OTHER">OTHER / ARCHIVE</option>
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

        {/* Project Photos & Files */}
        <div className="bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--accent)]">
              📸 Photos & Document Files
            </span>
            <span className="text-[9px] text-[var(--text-muted)]">
              {(customer.files || []).length} items
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[8px] uppercase font-bold text-[var(--text-muted)] block mb-1">
                Upload Tag
              </label>
              <select
                value={fileTag}
                onChange={(e) => setFileTag(e.target.value as any)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg p-2 text-xs outline-none"
              >
                <option value="BEFORE">Before Photo</option>
                <option value="ACTIVE">In-Progress</option>
                <option value="AFTER">After Photo</option>
                <option value="DOC">Document</option>
              </select>
            </div>

            <div className="flex items-end">
              <label className="w-full py-2 bg-[var(--accent)] hover:opacity-95 text-white font-bold text-xs rounded-lg text-center cursor-pointer shadow transition-transform active:scale-95">
                📁 Upload Photos / Files
                <input
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <button
            type="button"
            onClick={onGenerateCollage}
            className="w-full py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-extrabold text-xs rounded-lg shadow cursor-pointer transition-transform active:scale-95"
          >
            🎨 Generate Before / After Showcase Card
          </button>

          {/* Photo Grid */}
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 pt-1 max-h-48 overflow-y-auto">
            {(customer.files || []).map((f) => (
              <div
                key={f.id}
                className="relative rounded-lg overflow-hidden border border-[var(--border)] group bg-black/20"
              >
                <span className="absolute top-1 left-1 text-[7px] font-black uppercase px-1 py-0.5 rounded bg-black/80 text-white z-10">
                  {f.tag}
                </span>
                <button
                  type="button"
                  onClick={() => deleteFile(f.id)}
                  className="absolute top-1 right-1 w-4 h-4 rounded bg-red-600 text-white text-[9px] font-bold flex items-center justify-center z-10 cursor-pointer"
                >
                  ✕
                </button>

                {f.isImg ? (
                  <img
                    src={f.data}
                    alt={f.name}
                    onClick={() => onViewImage(f.data)}
                    className="w-full h-16 object-cover cursor-pointer hover:scale-105 transition-transform"
                  />
                ) : (
                  <div
                    onClick={() => {
                      if (onViewDocFile) {
                        onViewDocFile(f);
                      } else {
                        onViewImage(f.data);
                      }
                    }}
                    className="w-full h-16 flex flex-col items-center justify-center p-1 text-center cursor-pointer hover:bg-[var(--border)] rounded transition-colors group/doc"
                  >
                    <span className="text-xl group-hover/doc:scale-110 transition-transform">📄</span>
                    <span className="text-[8px] text-[var(--accent)] truncate max-w-full font-bold">
                      {f.name}
                    </span>
                    <span className="text-[7px] text-[var(--text-muted)] font-semibold">Tap to View</span>
                  </div>
                )}
              </div>
            ))}

            {(!customer.files || customer.files.length === 0) && (
              <div className="col-span-full text-center py-4 text-[10px] text-[var(--text-muted)]">
                No site photos or documents uploaded yet.
              </div>
            )}
          </div>
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
              const statusBg =
                j.status === 'SCHEDULED'
                  ? '#0a84ff'
                  : j.status === 'COMPLETED'
                  ? '#ff9f0a'
                  : j.status === 'OTHER'
                  ? '#555'
                  : '#ffd60a';

              // Calculate total
              let labor = 0;
              (j.rooms || []).forEach((r) => (labor += Math.round(Number(r.r) || 0)));
              let repH = 0;
              (j.repairs || []).forEach((rep) => (repH += parseFloat(String(rep.h)) || 0));
              const repCost = Math.round(repH * (j.repairRate || 75));
              const dVal = parseFloat(String(j.disc)) || 0;
              const dAmt = j.discType === 'PCT' ? Math.round(labor * (dVal / 100)) : Math.round(dVal);
              const mats = j.matsIncluded ? 0 : Math.round(parseFloat(String(j.matVal)) || 0);
              const sun = j.matsIncluded ? 0 : Math.round(parseFloat(String(j.sunVal)) || 0);
              const gross = Math.round(labor - dAmt + repCost + mats + sun);

              const dateRange = j.schedDate
                ? j.schedEndDate && j.schedEndDate !== j.schedDate
                  ? `${j.schedDate} ➔ ${j.schedEndDate}`
                  : j.schedDate
                : 'No Date Set';

              return (
                <div
                  key={j.id}
                  className="bg-[var(--bg)] border border-[var(--border)] rounded-xl p-3.5 shadow-sm space-y-2 relative"
                  style={{ borderLeft: `4px solid ${statusBg}` }}
                >
                  <button
                    type="button"
                    onClick={() => onDeleteJob(j.id)}
                    className="absolute top-2 right-2 text-[9px] text-red-500 font-bold border border-red-500/40 hover:bg-red-500 hover:text-white px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                  >
                    Delete
                  </button>

                  <div className="pr-12">
                    <input
                      type="text"
                      defaultValue={j.title || `Project #${idx + 1}`}
                      onBlur={(e) => {
                        const updatedJobs = customer.jobs.map((item) =>
                          item.id === j.id ? { ...item, title: e.target.value.trim() } : item
                        );
                        onUpdateCustomer({ ...customer, jobs: updatedJobs });
                      }}
                      className="font-black text-sm text-[var(--text)] bg-transparent border-b border-dashed border-[var(--border)] focus:border-[var(--accent)] w-full outline-none"
                    />
                    <div className="text-[10px] text-[var(--text-muted)] font-semibold mt-0.5">
                      📅 Scheduled: <b>{dateRange}</b> • Created: {j.date}
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-y border-dashed border-[var(--border)] py-1.5">
                    <span
                      style={{ backgroundColor: statusBg, color: j.status === 'PENDING' ? '#000' : '#fff' }}
                      className="text-[8px] font-black uppercase px-2 py-0.5 rounded"
                    >
                      {j.status}
                    </span>
                    <span className="text-base font-black text-[var(--accent)]">${gross}</span>
                  </div>

                  {/* Document Generation & Calendar Buttons */}
                  <div className="grid grid-cols-2 min-[440px]:grid-cols-3 sm:grid-cols-5 gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => onGenerateDoc(j, 'ESTIMATE')}
                      className="py-1.5 bg-[var(--accent)] hover:opacity-95 text-white font-extrabold text-[10px] rounded-lg cursor-pointer transition-transform active:scale-95 flex items-center justify-center gap-1 shadow-sm"
                      title="Generate and view true Estimate PDF"
                    >
                      <span>📄</span>
                      <span>Est PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onGenerateDoc(j, 'BILL')}
                      className="py-1.5 bg-[var(--accent-tertiary)] hover:opacity-95 text-white font-extrabold text-[10px] rounded-lg cursor-pointer transition-transform active:scale-95 flex items-center justify-center gap-1 shadow-sm"
                      title="Generate and view true Bill/Invoice PDF"
                    >
                      <span>💳</span>
                      <span>Bill PDF</span>
                    </button>
                    {j.schedDate ? (
                      <a
                        href={createGoogleCalendarUrl(customer.name, j, customer.address, customer.phone)}
                        target="_blank"
                        rel="noreferrer"
                        className="py-1.5 bg-[#4285f4] hover:bg-[#3367d6] text-white font-extrabold text-[10px] rounded-lg cursor-pointer transition-transform active:scale-95 flex items-center justify-center gap-1 shadow-sm"
                        title="Add directly to phone Google Calendar app"
                      >
                        <span>📅</span>
                        <span>Cal</span>
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          onOpenJobModal(j);
                          onToast('Set a start date to sync this project to Google Calendar');
                        }}
                        className="py-1.5 bg-[var(--surface-subtle)] hover:bg-[var(--border)] border border-[var(--border)] text-gray-400 font-bold text-[10px] rounded-lg cursor-pointer flex items-center justify-center gap-1"
                        title="Set start date first to sync to calendar"
                      >
                        <span>📅</span>
                        <span>Cal</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onOpenJobModal(j)}
                      className="py-1.5 bg-[var(--surface-subtle)] hover:bg-[var(--border)] border border-[var(--border)] text-[var(--text)] font-bold text-[10px] rounded-lg cursor-pointer transition-transform active:scale-95"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onGenerateDoc(j, 'MASTER RECORD')}
                      className="py-1.5 bg-[var(--surface-subtle)] hover:bg-[var(--border)] border border-[var(--border)] text-[var(--text)] font-bold text-[10px] rounded-lg cursor-pointer transition-transform active:scale-95"
                    >
                      Record
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
