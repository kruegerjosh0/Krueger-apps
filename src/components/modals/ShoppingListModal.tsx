import React, { useState } from 'react';
import { ShoppingItem } from '../../types';

interface ShoppingListModalProps {
  items: ShoppingItem[];
  onAddItem: (item: { name: string; qty: string }) => void;
  onToggleItem: (id: number) => void;
  onDeleteItem: (id: number) => void;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export const ShoppingListModal: React.FC<ShoppingListModalProps> = ({
  items,
  onAddItem,
  onToggleItem,
  onDeleteItem,
  onClose,
  onToast,
}) => {
  const [name, setName] = useState('');
  const [qty, setQty] = useState('');

  const handleAdd = () => {
    if (!name.trim()) return;
    onAddItem({ name: name.trim(), qty: qty.trim() || '1 item' });
    setName('');
    setQty('');
    onToast('✔ Added to Shopping List');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--accent)]">
              Supplies Checklist
            </span>
            <h2 className="text-base font-black text-[var(--text)]">Rolling Shopping List</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="bg-[var(--surface-subtle)] text-[var(--text)] font-bold text-xs px-3 py-1.5 rounded-lg border border-[var(--border)] cursor-pointer"
          >
            ✕ Back
          </button>
        </div>

        {/* Input */}
        <div className="bg-[var(--surface-subtle)] p-3 rounded-xl border border-[var(--border)] space-y-2">
          <label className="text-[9px] uppercase font-bold text-[var(--text-muted)] block">
            Add Material / Tape / Paint
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="e.g. 3M Blue Tape 1.5 in"
              className="flex-1 bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg px-2.5 py-1.5 text-xs outline-none"
            />
            <input
              type="text"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="4 rolls"
              className="w-20 bg-[var(--bg)] border border-[var(--border)] text-[var(--text)] rounded-lg px-2 py-1.5 text-xs outline-none text-center"
            />
            <button
              type="button"
              onClick={handleAdd}
              className="bg-[var(--accent-tertiary)] hover:opacity-95 text-white font-extrabold text-xs px-3 py-1.5 rounded-lg cursor-pointer"
            >
              + Add
            </button>
          </div>
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
          {items.map((item) => (
            <div
              key={item.id}
              className={`p-2.5 rounded-lg border flex items-center justify-between transition-all ${
                item.checked
                  ? 'bg-[var(--surface-subtle)]/50 border-[var(--border)] opacity-60'
                  : 'bg-[var(--surface-subtle)] border-[var(--border)]'
              }`}
            >
              <label className="flex items-center gap-2 cursor-pointer flex-1 mr-2">
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={() => onToggleItem(item.id)}
                  className="w-4 h-4 rounded text-[var(--accent)]"
                />
                <span className={`text-xs ${item.checked ? 'line-through text-[var(--text-muted)]' : 'font-bold text-[var(--text)]'}`}>
                  {item.name}
                  {item.qty && <span className="text-[10px] text-[var(--text-muted)] font-normal ml-1.5">({item.qty})</span>}
                </span>
              </label>

              <button
                type="button"
                onClick={() => onDeleteItem(item.id)}
                className="text-red-500 font-bold text-xs px-1.5 hover:text-red-400"
              >
                ✕
              </button>
            </div>
          ))}

          {items.length === 0 && (
            <div className="text-center py-8 text-xs text-[var(--text-muted)] bg-[var(--bg)] rounded-xl border border-[var(--border)]">
              Shopping list is currently empty.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
