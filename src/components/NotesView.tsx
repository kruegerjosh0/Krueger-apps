import React, { useState, useRef, useEffect } from 'react';
import { FieldNote, SystemConstants } from '../types';

interface NotesViewProps {
  notes: FieldNote[];
  constants?: SystemConstants;
  onOpenNoteModal: (note?: FieldNote) => void;
  onDeleteNote: (id: number) => void;
  onShareNote: (note: FieldNote) => void;
  onSendNoteToEstimator?: (note: FieldNote) => void;
  onSaveNote?: (note: Partial<FieldNote>) => void;
  onToast?: (msg: string) => void;
}

export const NotesView: React.FC<NotesViewProps> = ({
  notes,
  constants,
  onOpenNoteModal,
  onDeleteNote,
  onShareNote,
  onSendNoteToEstimator,
  onSaveNote,
  onToast,
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');

  const handleSyncToGoogleKeep = (note: FieldNote) => {
    const noteText = `${note.title}\n\n${note.body}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(noteText);
    }
    const keepUrl = `https://keep.google.com`;
    window.open(keepUrl, '_blank', 'noopener,noreferrer');
    onToast?.(`✔ Copied note to clipboard & opened Google Keep`);
  };

  const filtered = notes.filter((n) => {
    const matchSearch =
      n.title.toLowerCase().includes(search.toLowerCase()) ||
      n.body.toLowerCase().includes(search.toLowerCase());
    const matchCat = selectedCategory === 'ALL' || n.category === selectedCategory;
    return matchSearch && matchCat;
  });

  const categories = ['ALL', 'Material Run', 'Crew Instruction', 'General Reminder', 'Job Site Idea'];

  return (
    <div className="space-y-4 max-w-2xl mx-auto pb-20">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-extrabold uppercase tracking-wide text-[var(--accent)]">
            Field Notes Board
          </h2>
          <p className="text-[11px] text-[var(--text-muted)]">
            Dictate walkthroughs, crew instructions & supplier reminders
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenNoteModal()}
            className="bg-[var(--accent-tertiary)] hover:opacity-95 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-transform active:scale-95 shadow-sm"
          >
            + New Note
          </button>
        </div>
      </div>

      {/* Search & Categories */}
      <div className="space-y-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Search notes or job items..."
          className="w-full bg-[var(--surface)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded-xl px-4 py-2.5 text-xs outline-none shadow-sm"
        />

        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`text-[10px] font-bold px-2.5 py-1 rounded-md border flex-shrink-0 cursor-pointer transition-all ${
                selectedCategory === cat
                  ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                  : 'bg-[var(--surface-subtle)] text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Notes Grid */}
      <div className="space-y-3">
        {filtered.map((note) => {
          const hasEstimateContent =
            /\b\d+\s*(?:x|by|\*)\s*\d+\b/i.test(note.body) ||
            /\b(?:room|bedroom|kitchen|living|repair|patch|gallon|sheen|coat)\b/i.test(note.body);

          return (
            <div
              key={note.id}
              className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3.5 shadow-sm hover:border-[var(--accent)] transition-all"
            >
              <div className="flex flex-wrap items-center justify-between gap-1.5 mb-2">
                <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded bg-[var(--surface-subtle)] text-[var(--accent)] border border-[var(--border)]">
                  {note.category || 'General'}
                </span>

                <div className="flex flex-wrap items-center gap-1.5">
                  {onSendNoteToEstimator && (
                    <button
                      type="button"
                      onClick={() => onSendNoteToEstimator(note)}
                      className={`text-[10px] font-black px-2 py-1 rounded cursor-pointer transition-transform active:scale-95 flex items-center gap-1 ${
                        hasEstimateContent
                          ? 'bg-[#2c2317] border border-[#f1c40f] text-[#f1c40f] hover:bg-[#3d301f]'
                          : 'bg-[var(--surface-subtle)] hover:bg-[var(--border)] text-[var(--text)] border border-[var(--border)]'
                      }`}
                      title="Convert these room dimensions, paint, and repairs straight into an estimate quote"
                    >
                      <span>⚡</span>
                      <span className="hidden min-[380px]:inline">Send to </span>
                      <span>Estimator</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleSyncToGoogleKeep(note)}
                    className="bg-[#f1c40f]/15 hover:bg-[#f1c40f]/25 text-[#f1c40f] border border-[#f1c40f]/40 text-[10px] font-black px-2 py-1 rounded cursor-pointer flex items-center gap-1"
                    title="Copy note and open Google Keep"
                  >
                    <span>💡</span>
                    <span>Keep</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onShareNote(note)}
                    className="bg-[var(--accent-secondary)] hover:opacity-90 text-white text-[10px] font-bold px-2 py-1 rounded cursor-pointer"
                  >
                    Share
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenNoteModal(note)}
                    className="bg-[var(--surface-subtle)] hover:bg-[var(--border)] text-[var(--text)] text-[10px] font-bold px-2 py-1 rounded border border-[var(--border)] cursor-pointer"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteNote(note.id)}
                    className="bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <h4 className="font-extrabold text-sm text-[var(--text)] mb-1">{note.title}</h4>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed whitespace-pre-wrap">
                {note.body}
              </p>
              <div className="text-[9px] text-[var(--text-muted)] text-right mt-2 font-mono">
                Updated: {note.date}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-12 bg-[var(--surface)] border border-[var(--border)] rounded-xl text-xs text-[var(--text-muted)]">
            No notes found. Tap &ldquo;+ New Note&rdquo; or ask Flip AI in the header to dictate.
          </div>
        )}
      </div>
    </div>
  );
};
