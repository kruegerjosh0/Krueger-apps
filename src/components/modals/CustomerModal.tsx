import React, { useState } from 'react';
import { Customer } from '../../types';
import { formatAddressParts, parseAddressParts } from '../../utils/projectHelpers';

interface CustomerModalProps {
  onClose: () => void;
  onSaveCustomer: (customerData: Partial<Customer>) => void;
}

export const CustomerModal: React.FC<CustomerModalProps> = ({ onClose, onSaveCustomer }) => {
  const [name, setName] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [zip, setZip] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [smartText, setSmartText] = useState('');

  const parseSmartLeadText = (raw: string) => {
    setSmartText(raw);
    if (!raw || raw.length < 5) return;

    // Phone detection
    const phoneMatch = raw.match(/(\+?1[-\.\s]?)?\(?\d{3}\)?[-\.\s]?\d{3}[-\.\s]?\d{4}/);
    if (phoneMatch) setPhone(phoneMatch[0].trim());

    // Email detection
    const emailMatch = raw.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) setEmail(emailMatch[0].trim());

    // Zip code detection
    const zipMatch = raw.match(/\b(\d{5})(?:-\d{4})?\b/);
    if (zipMatch) setZip(zipMatch[1]);

    // Full street + city/state/zip detection
    const fullAddrMatch = raw.match(
      /(\d{1,5}\s+[A-Za-z0-9\.\s#]+?(?:Avenue|Lane|Road|Drive|Street|Blvd|Boulevard|Court|Ct|Way|Trail|Trl|Circle|Cir|Place|Pl|Dr|Rd|Ave|Ln|St)\b(?:,\s*[A-Za-z\s]+)?(?:,?\s*(?:WI|Wisconsin))?(?:\s*\d{5})?)/i
    );
    if (fullAddrMatch) {
      const parsed = parseAddressParts(fullAddrMatch[1]);
      if (parsed.street) setStreet(parsed.street);
      if (parsed.city) setCity(parsed.city);
      if (parsed.zip) setZip(parsed.zip);
    }

    // Name detection (first non-empty line that doesn't look like a phone/email/street number)
    const lines = raw
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const nameLine = lines.find(
      (l) => !/^\d{1,5}\s+/.test(l) && !/@/.test(l) && !/^\(?\d{3}\)?/.test(l)
    );
    if (nameLine) {
      const cleanName = nameLine.replace(/^(?:name|client|customer|from)\s*:\s*/i, '').trim();
      if (cleanName) setName(cleanName.substring(0, 50));
    }
  };

  const handleSave = () => {
    if (!name.trim()) {
      alert('Client Name is required.');
      return;
    }
    const combinedAddress = formatAddressParts({
      street,
      city,
      state: city.trim() || zip.trim() || street.trim() ? 'WI' : '',
      zip,
    });
    onSaveCustomer({
      name: name.trim(),
      address: combinedAddress,
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
            Scans incoming lead text for name, phone, email, street address, city, and ZIP code.
          </p>
        </div>

        {/* Contact Fields (with standard HTML name & autoComplete for browser autofill) */}
        <form autoComplete="on" onSubmit={(e) => e.preventDefault()} className="space-y-3">
          <div>
            <label
              htmlFor="new-customer-name"
              className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider block mb-1"
            >
              Full Name *
            </label>
            <input
              id="new-customer-name"
              name="name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter client full name"
              className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded-lg px-3 py-2.5 text-xs outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="new-customer-street"
              className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider block mb-1"
            >
              Street Address
            </label>
            <input
              id="new-customer-street"
              name="street-address"
              type="text"
              autoComplete="street-address"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              placeholder="Street address (e.g. 1425 Main St)"
              className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded-lg px-3 py-2.5 text-xs outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                htmlFor="new-customer-city"
                className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider block mb-1"
              >
                City / Town
              </label>
              <input
                id="new-customer-city"
                name="city"
                type="text"
                autoComplete="address-level2"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="West Bend"
                className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded-lg px-3 py-2.5 text-xs outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="new-customer-zip"
                className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider block mb-1"
              >
                Zip Code
              </label>
              <input
                id="new-customer-zip"
                name="postal-code"
                type="text"
                inputMode="numeric"
                autoComplete="postal-code"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                placeholder="53095"
                className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded-lg px-3 py-2.5 text-xs outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                htmlFor="new-customer-tel"
                className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider block mb-1"
              >
                Phone Number
              </label>
              <input
                id="new-customer-tel"
                name="tel"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(262) 000-0000"
                className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded-lg px-3 py-2.5 text-xs outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="new-customer-email"
                className="text-[10px] uppercase font-bold text-[var(--text-muted)] tracking-wider block mb-1"
              >
                Email Address
              </label>
              <input
                id="new-customer-email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@email.com"
                className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded-lg px-3 py-2.5 text-xs outline-none"
              />
            </div>
          </div>
        </form>

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
