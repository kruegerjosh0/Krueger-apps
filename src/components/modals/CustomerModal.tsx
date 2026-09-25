import React, { useState } from 'react';
import { Customer } from '../../types';

interface CustomerModalProps {
  onClose: () => void;
  onSaveCustomer: (customerData: Partial<Customer>) => void;
}

export const CustomerModal: React.FC<CustomerModalProps> = ({ onClose, onSaveCustomer }) => {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [smartText, setSmartText] = useState('');

  const parseSmartLeadText = (raw: string) => {
    setSmartText(raw);
    if (!raw || raw.length < 5) return;

    // Phone detection
    const phoneMatch = raw.match(/(\+?1[-\.\s]?)?\(?\d{3}\)?[-\.\s]?\d{3}[-\.\s]?\d{4}/);
    if (phoneMatch && !phone) setPhone(phoneMatch[0]);

    // Email detection
    const emailMatch = raw.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch && !email) setEmail(emailMatch[0]);

    // Name detection (first non-empty line)
    const lines = raw
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length > 0 && !name) {
      setName(lines[0].substring(0, 40));
    }

    // Address detection
    const addressMatch = raw.match(
      /\d{1,5}\s+[A-Za-z0-9\.\,\s#]+(?:Avenue|Lane|Road|Drive|Street|Blvd|Ct|Way|Trl|Dr|Rd|Ave|Ln)\b/i
    );
    if (addressMatch && !address) {
      setAddress(addressMatch[0] + ', WI');
    }
  };

  const handleSave = () => {
    if (!name.trim()) {
      alert('Client Name is required.');
      return;
    }
    onSaveCustomer({
      name: name.trim(),
      address: address.trim(),
      phone: phone.trim(),
      email: email.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-lg p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <h2 className="text-base font-extrabold uppercase tracking-wide text-[var(--accent-secondary)]">
            + New Customer Folder
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-[var(--text-muted)] hover:text-[var(--text)] text-sm font-bold"
          >
            ✕
          </button>
        </div>

        {/* Smart Paste Lead Card */}
        <div className="bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl p-3.5 space-y-1.5">
          <label className="text-[11px] font-bold text-[var(--accent)] uppercase tracking-wide flex items-center gap-1.5">
            <span>⚡ Smart Paste Lead Info</span>
          </label>
          <textarea
            rows={3}
            value={smartText}
            onChange={(e) => parseSmartLeadText(e.target.value)}
            placeholder="Paste text message or email lead inquiry here to auto-fill..."
            className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded-lg p-2.5 text-xs outline-none"
          />
          <p className="text-[10px] text-[var(--text-muted)] leading-tight">
            Scans incoming lead text for phone, email, name, and Wisconsin street addresses.
          </p>
        </div>

        {/* Fields */}
        <div className="space-y-3">
          <div>
            <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider block mb-1">
              Full Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. John & Sarah Miller"
              className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded-lg px-3 py-2.5 text-xs outline-none"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider block mb-1">
              Job Site Street Address
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 1425 Main St, West Bend, WI 53095"
              className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded-lg px-3 py-2.5 text-xs outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider block mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(262) 555-0199"
                className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded-lg px-3 py-2.5 text-xs outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider block mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="client@example.com"
                className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded-lg px-3 py-2.5 text-xs outline-none"
              />
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 bg-[var(--surface-subtle)] hover:bg-[var(--border)] text-[var(--text)] font-bold text-xs rounded-xl border border-[var(--border)] cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 py-2.5 bg-[var(--accent-secondary)] hover:opacity-95 text-white font-extrabold text-xs rounded-xl shadow cursor-pointer transition-transform active:scale-95"
          >
            Create Customer Folder
          </button>
        </div>
      </div>
    </div>
  );
};
