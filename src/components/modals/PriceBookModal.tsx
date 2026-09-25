import React, { useState } from 'react';
import { PriceBookItem } from '../../types';

interface PriceBookModalProps {
  priceBook: PriceBookItem[];
  onSaveItem: (item: PriceBookItem) => void;
  onDeleteItem: (id: number) => void;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export const PriceBookModal: React.FC<PriceBookModalProps> = ({
  priceBook,
  onSaveItem,
  onDeleteItem,
  onClose,
  onToast,
}) => {
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const [supplier, setSupplier] = useState('');
  const [price, setPrice] = useState<number | ''>('');
  const [unit, setUnit] = useState('Gallon');

  const handleSave = () => {
    const priceNum = typeof price === 'number' ? price : parseFloat(String(price)) || 0;
    if (!name.trim() || priceNum <= 0) {
      alert('Please enter a product name and valid price.');
      return;
    }
    const item: PriceBookItem = {
      id: Date.now(),
      name: name.trim(),
      supplier: supplier.trim() || 'Sherwin-Williams (West Bend)',
      price: priceNum,
      unit,
    };
    onSaveItem(item);
    setName('');
    setPrice('');
    onToast('✔ Saved to Price Book');
  };

  const filtered = priceBook.filter(
    (i) =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.supplier.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex flex-col p-3 sm:p-5 overflow-y-auto animate-in fade-in">
      <div className="max-w-2xl w-full mx-auto bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4 my-auto">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--accent)]">
              Suppliers & Pricing
            </span>
            <h2 className="text-base font-black text-[var(--text)]">Material Price Book</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="bg-[var(--surface-subtle)] text-[var(--text)] font-bold text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] cursor-pointer"
          >
            ✕ Back
          </button>
        </div>

        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Search materials or stores..."
          className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-xl px-3 py-2 text-xs outline-none"
        />

        {/* Add Item Form */}
        <div className="bg-[var(--surface-subtle)] p-3.5 rounded-xl border border-[var(--border)] space-y-2.5">
          <span className="text-[9px] uppercase font-bold text-[var(--accent)] block">
            Add Product / Price
          </span>
          <div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Emerald Urethane Satin"
              className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg px-2.5 py-1.5 text-xs outline-none"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <input
                type="text"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="Sherwin (West Bend)"
                className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg px-2.5 py-1.5 text-xs outline-none"
              />
            </div>
            <div>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value === '' ? '' : parseFloat(e.target.value))}
                placeholder="Price ($)"
                className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg px-2.5 py-1.5 text-xs outline-none font-bold"
              />
            </div>
            <div>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg px-2 py-1.5 text-xs outline-none"
              >
                <option value="Gallon">Per Gal</option>
                <option value="Quart">Per Qt</option>
                <option value="Roll / Pack">Roll/Pk</option>
                <option value="Case">Case</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSave}
            className="w-full py-2 bg-[var(--accent-tertiary)] text-white font-extrabold text-xs rounded-lg shadow cursor-pointer transition-transform active:scale-95"
          >
            Save to Price Book
          </button>
        </div>

        {/* List */}
        <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="bg-[var(--bg)] border border-[var(--border)] p-2.5 rounded-lg flex items-center justify-between text-xs"
            >
              <div>
                <span className="font-bold text-[var(--text)]">{item.name}</span>
                <span className="text-[10px] text-[var(--text-muted)] ml-2">({item.supplier})</span>
                <div className="text-[10px] text-[var(--text-muted)]">{item.unit}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-black text-[var(--accent)]">${item.price}</span>
                <button
                  type="button"
                  onClick={() => onDeleteItem(item.id)}
                  className="text-red-500 font-bold px-1.5 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="text-center py-6 text-xs text-[var(--text-muted)] bg-[var(--bg)] rounded-xl border border-[var(--border)]">
              No items logged in price book yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
