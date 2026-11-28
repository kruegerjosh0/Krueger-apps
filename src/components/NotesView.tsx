import React, { useMemo, useState } from 'react';
import { Customer, FieldNote, NoteFolder, SystemConstants } from '../types';
import {
  downloadNoteReminderIcs,
  formatNoteDueLabel,
  getChecklistProgress,
  getNoteDueState,
  inferDefaultFolderId,
  isNoteActionNeeded,
  parseChecklistItems,
  parseNoteDueAtMs,
} from '../utils/noteHelpers';

interface NotesViewProps {
  notes: FieldNote[];
  noteFolders: NoteFolder[];
  customers: Customer[];
  constants?: SystemConstants;
  onOpenNoteModal: (note?: FieldNote, defaultFolderId?: string, autoDictate?: boolean) => void;
  onTogglePinNote: (id: number) => void;
  onToggleCompleteNote: (id: number) => void;
  onToggleChecklistMode: (id: number) => void;
  onToggleChecklistItem: (noteId: number, lineIndex: number) => void;
  onLinkNoteToCustomer: (note: FieldNote, customerId: number) => void;
  onConvertNoteToNewCustomer: (note: FieldNote) => void;
  onOpenCustomerFolder: (customerId: number) => void;
  onDeleteNote: (id: number) => void;
  onShareNote: (note: FieldNote) => void;
  onSendNoteToEstimator?: (note: FieldNote) => void;
  onCreateFolder: (name: string) => NoteFolder | null;
  onRenameFolder: (folderId: string, newName: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onToast?: (msg: string) => void;
}

type FolderFilter = 'ALL' | 'DUE' | string;

export const NotesView: React.FC<NotesViewProps> = ({
  notes,
  noteFolders,
  customers,
  onOpenNoteModal,
  onTogglePinNote,
  onToggleCompleteNote,
  onToggleChecklistMode,
  onToggleChecklistItem,
  onLinkNoteToCustomer,
  onConvertNoteToNewCustomer,
  onOpenCustomerFolder,
  onDeleteNote,
  onShareNote,
  onSendNoteToEstimator,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onToast,
}) => {
  const [search, setSearch] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<FolderFilter>('ALL');

  // Inline Folder Create / Rename modal state (clean mobile UX without browser prompt())
  const [folderDialog, setFolderDialog] = useState<
    | { mode: 'CREATE'; value: string }
    | { mode: 'RENAME'; folderId: string; value: string }
    | null
  >(null);

  const nowMs = Date.now();

  const folderById = useMemo(() => {
    const map = new Map<string, NoteFolder>();
    noteFolders.forEach((f) => map.set(f.id, f));
    return map;
  }, [noteFolders]);

  const customerById = useMemo(() => {
    const map = new Map<number, Customer>();
    customers.forEach((c) => map.set(c.id, c));
    return map;
  }, [customers]);

  const sortedCustomersForDropdown = useMemo(() => {
    return [...customers].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [customers]);

  const activeCustomFolder = useMemo(() => {
    if (selectedFolder === 'ALL' || selectedFolder === 'DUE') return null;
    const f = folderById.get(selectedFolder);
    return f && !f.isBuiltIn ? f : null;
  }, [selectedFolder, folderById]);

  // Action Needed notes (Overdue or Due Today & uncompleted) for the Top Priority Strip
  const actionNeededNotes = useMemo(() => {
    return notes
      .filter((n) => isNoteActionNeeded(n, nowMs))
      .sort((a, b) => {
        const msA = parseNoteDueAtMs(a.dueAt) ?? Number.MAX_SAFE_INTEGER;
        const msB = parseNoteDueAtMs(b.dueAt) ?? Number.MAX_SAFE_INTEGER;
        return msA - msB;
      });
  }, [notes, nowMs]);

  // Counts per folder pill
  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: notes.length, DUE: 0 };
    noteFolders.forEach((f) => {
      counts[f.id] = 0;
    });
    notes.forEach((n) => {
      const fId = inferDefaultFolderId(n);
      counts[fId] = (counts[fId] || 0) + 1;
      if (!n.completed && parseNoteDueAtMs(n.dueAt) !== null) {
        counts.DUE += 1;
      }
    });
    return counts;
  }, [notes, noteFolders]);

  // Filtered + smart-sorted notes (uncompleted first, pinned on top, then due soonest, then newest)
  const filteredNotes = useMemo(() => {
    const q = search.trim().toLowerCase();

    const list = notes.filter((n) => {
      const fId = inferDefaultFolderId(n);
      const folderName = folderById.get(fId)?.name || '';
      const linkedCustomerName = n.linkedCustomerId
        ? customerById.get(n.linkedCustomerId)?.name || ''
        : '';

      const matchFolder =
        selectedFolder === 'ALL'
          ? true
          : selectedFolder === 'DUE'
            ? !n.completed && parseNoteDueAtMs(n.dueAt) !== null
            : fId === selectedFolder;

      if (!matchFolder) return false;
      if (!q) return true;

      return (
        (n.title || '').toLowerCase().includes(q) ||
        (n.body || '').toLowerCase().includes(q) ||
        folderName.toLowerCase().includes(q) ||
        linkedCustomerName.toLowerCase().includes(q) ||
        (n.category || '').toLowerCase().includes(q)
      );
    });

    return [...list].sort((a, b) => {
      // 1. Uncompleted above completed
      const compA = a.completed ? 1 : 0;
      const compB = b.completed ? 1 : 0;
      if (compA !== compB) return compA - compB;

      // 2. Pinned always on top
      const pinA = a.pinned ? 0 : 1;
      const pinB = b.pinned ? 0 : 1;
      if (pinA !== pinB) return pinA - pinB;

      // 3. In Due / Action folder, sort strictly by earliest due date
      if (selectedFolder === 'DUE') {
        const msA = parseNoteDueAtMs(a.dueAt) ?? Number.MAX_SAFE_INTEGER;
        const msB = parseNoteDueAtMs(b.dueAt) ?? Number.MAX_SAFE_INTEGER;
        if (msA !== msB) return msA - msB;
      } else {
        // Surface Overdue / Due Today notes above undated notes
        const urgentA = isNoteActionNeeded(a, nowMs) ? 0 : 1;
        const urgentB = isNoteActionNeeded(b, nowMs) ? 0 : 1;
        if (urgentA !== urgentB) return urgentA - urgentB;
      }

      // 4. Most recently created first
      return b.id - a.id;
    });
  }, [notes, search, selectedFolder, folderById, customerById, nowMs]);

  const handleSyncToGoogleKeep = (note: FieldNote) => {
    const noteText = `${note.title}\n\n${note.body}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(noteText);
    }
    window.open('https://keep.google.com', '_blank', 'noopener,noreferrer');
    onToast?.('✔ Copied note to clipboard & opened Google Keep');
  };

  const handleExportPhoneAlert = (note: FieldNote) => {
    const folderName = folderById.get(inferDefaultFolderId(note))?.name;
    const ok = downloadNoteReminderIcs(note, folderName);
    if (ok) {
      onToast?.('🔔 Downloaded .ics alert — tap to save in Phone Calendar / Alarm');
    } else {
      onToast?.('Set a due date & time on this note first');
    }
  };

  const handleFolderDialogSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderDialog) return;
    const clean = folderDialog.value.trim();
    if (!clean) return;

    if (folderDialog.mode === 'CREATE') {
      const created = onCreateFolder(clean);
      if (created) {
        setSelectedFolder(created.id);
      }
    } else {
      onRenameFolder(folderDialog.folderId, clean);
    }
    setFolderDialog(null);
  };

  const defaultNewNoteFolderId =
    selectedFolder !== 'ALL' && selectedFolder !== 'DUE'
      ? selectedFolder
      : noteFolders[0]?.id || 'job-estimate';

  return (
    <div className="space-y-3.5 max-w-2xl mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-extrabold uppercase tracking-wide text-[var(--accent)]">
            Field Notes &amp; Reminders
          </h2>
          <p className="text-[11px] text-[var(--text-muted)]">
            Folders, due alerts, interactive checklists &amp; hands-free voice capture
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            data-quick-dictate-btn="true"
            onClick={() => onOpenNoteModal(undefined, defaultNewNoteFolderId, true)}
            title="Start a new note with Voice Dictation"
            className="bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-400/50 px-2.5 py-1.5 rounded-xl text-xs font-extrabold cursor-pointer transition-transform active:scale-95 flex items-center gap-1"
          >
            <span>🎤</span>
            <span className="hidden sm:inline">Dictate</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenNoteModal(undefined, defaultNewNoteFolderId, false)}
            className="bg-[var(--accent-tertiary)] hover:opacity-95 text-white px-3.5 py-1.5 rounded-xl text-xs font-extrabold cursor-pointer transition-transform active:scale-95 shadow-sm"
          >
            + New Note
          </button>
        </div>
      </div>

      {/* Top Priority Strip: Action Needed (Overdue / Due Today) */}
      {actionNeededNotes.length > 0 && (
        <div
          data-action-needed-strip="true"
          className="bg-rose-500/12 border border-rose-500/45 rounded-2xl p-3 shadow-sm space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-sm">⏰</span>
              <span className="text-xs font-black uppercase tracking-wide text-rose-300">
                Action Needed ({actionNeededNotes.length})
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedFolder('DUE')}
              className="text-[10px] font-extrabold text-rose-200 underline cursor-pointer"
            >
              View All Due
            </button>
          </div>

          <div className="space-y-1.5">
            {actionNeededNotes.slice(0, 4).map((note) => {
              const dueState = getNoteDueState(note, nowMs);
              const isOverdue = dueState === 'OVERDUE';
              return (
                <div
                  key={`urgent-${note.id}`}
                  className="bg-[var(--surface)]/95 border border-rose-500/30 rounded-xl px-2.5 py-2 flex items-center justify-between gap-2"
                >
                  <button
                    type="button"
                    onClick={() => onOpenNoteModal(note)}
                    className="min-w-0 flex-1 text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded shrink-0 ${
                          isOverdue
                            ? 'bg-rose-500 text-white'
                            : 'bg-amber-400 text-slate-950'
                        }`}
                      >
                        {isOverdue ? 'OVERDUE' : 'TODAY'}
                      </span>
                      <span className="text-xs font-extrabold text-[var(--text)] truncate">
                        {note.title}
                      </span>
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                      {formatNoteDueLabel(note.dueAt, nowMs)}
                    </div>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleExportPhoneAlert(note)}
                      title="Add to Phone Calendar / Alarm (.ics)"
                      className="px-2 py-1 rounded-lg bg-amber-500/15 border border-amber-400/50 text-amber-300 text-[10px] font-extrabold cursor-pointer"
                    >
                      🔔
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleCompleteNote(note.id)}
                      className="px-2 py-1 rounded-lg bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 text-[10px] font-extrabold cursor-pointer"
                    >
                      ✓ Done
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Horizontal Scrollable Folder Bar + "+ Folder" Button */}
      <div className="space-y-2">
        <div
          data-note-folder-bar="true"
          className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none"
        >
          <button
            type="button"
            onClick={() => setSelectedFolder('ALL')}
            className={`px-3 py-1.5 rounded-full text-[11px] font-extrabold border whitespace-nowrap shrink-0 cursor-pointer transition-all ${
              selectedFolder === 'ALL'
                ? 'bg-[var(--accent)] text-white border-[var(--accent)] shadow'
                : 'bg-[var(--surface)] text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
            }`}
          >
            All ({folderCounts.ALL || 0})
          </button>

          <button
            type="button"
            onClick={() => setSelectedFolder('DUE')}
            className={`px-3 py-1.5 rounded-full text-[11px] font-extrabold border whitespace-nowrap shrink-0 cursor-pointer transition-all flex items-center gap-1 ${
              selectedFolder === 'DUE'
                ? 'bg-rose-500 text-white border-rose-400 shadow'
                : actionNeededNotes.length > 0
                  ? 'bg-rose-500/15 text-rose-300 border-rose-500/50'
                  : 'bg-[var(--surface)] text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
            }`}
          >
            <span>⏰</span>
            <span>Due / Action ({folderCounts.DUE || 0})</span>
          </button>

          {noteFolders.map((folder) => {
            const active = selectedFolder === folder.id;
            return (
              <button
                key={folder.id}
                type="button"
                onClick={() => setSelectedFolder(folder.id)}
                className={`px-3 py-1.5 rounded-full text-[11px] font-extrabold border whitespace-nowrap shrink-0 cursor-pointer transition-all flex items-center gap-1 ${
                  active
                    ? 'bg-[var(--accent-secondary)] text-white border-[var(--accent-secondary)] shadow'
                    : 'bg-[var(--surface)] text-[var(--text)] border-[var(--border)] hover:border-[var(--accent-secondary)]'
                }`}
              >
                <span>{folder.icon || '📂'}</span>
                <span>{folder.name}</span>
                <span className="opacity-75 text-[10px]">({folderCounts[folder.id] || 0})</span>
              </button>
            );
          })}

          <button
            type="button"
            data-add-folder-btn="true"
            onClick={() => setFolderDialog({ mode: 'CREATE', value: '' })}
            className="px-3 py-1.5 rounded-full text-[11px] font-extrabold border border-dashed border-[var(--accent)] text-[var(--accent)] bg-[var(--surface)] hover:bg-[var(--surface-subtle)] whitespace-nowrap shrink-0 cursor-pointer transition-all"
          >
            + Folder
          </button>
        </div>

        {/* Custom Folder Management Bar (Rename / Delete) when viewing a custom folder */}
        {activeCustomFolder && (
          <div className="flex items-center justify-between gap-2 bg-[var(--surface)] border border-[var(--border)] rounded-xl px-3 py-1.5">
            <span className="text-[11px] font-bold text-[var(--text)] truncate">
              {activeCustomFolder.icon || '📂'} Folder: {activeCustomFolder.name}
            </span>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() =>
                  setFolderDialog({
                    mode: 'RENAME',
                    folderId: activeCustomFolder.id,
                    value: activeCustomFolder.name,
                  })
                }
                className="px-2 py-1 rounded-lg bg-[var(--surface-subtle)] border border-[var(--border)] text-[10px] font-bold text-[var(--text)] cursor-pointer"
              >
                ✏️ Rename
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteFolder(activeCustomFolder.id);
                  setSelectedFolder('ALL');
                }}
                className="px-2 py-1 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300 text-[10px] font-bold cursor-pointer"
              >
                🗑️ Delete
              </button>
            </div>
          </div>
        )}

        {/* Compact Search Notes Input */}
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 Search notes, folders, clients, or reminders..."
            aria-label="Search notes"
            className="w-full bg-[var(--surface)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded-xl px-3.5 py-2 text-xs outline-none shadow-sm pr-8"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear note search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Notes List */}
      <div className="space-y-2.5">
        {filteredNotes.map((note) => {
          const folderId = inferDefaultFolderId(note);
          const folder = folderById.get(folderId);
          const linkedCustomer = note.linkedCustomerId
            ? customerById.get(note.linkedCustomerId) || null
            : null;
          const dueState = getNoteDueState(note, nowMs);
          const hasDue = parseNoteDueAtMs(note.dueAt) !== null;
          const checklistItems = note.isChecklist ? parseChecklistItems(note.body) : [];
          const checklistProgress = note.isChecklist ? getChecklistProgress(note.body) : null;
          const hasEstimateContent =
            /\b\d+\s*(?:x|by|\*)\s*\d+\b/i.test(note.body) ||
            /\b(?:room|bedroom|kitchen|living|repair|patch|gallon|sheen|coat)\b/i.test(note.body);

          return (
            <div
              key={note.id}
              data-note-card-id={note.id}
              className={`bg-[var(--surface)] border rounded-2xl p-3.5 shadow-sm transition-all ${
                note.completed
                  ? 'border-[var(--border)] opacity-65'
                  : dueState === 'OVERDUE'
                    ? 'border-rose-500/60'
                    : dueState === 'DUE_TODAY'
                      ? 'border-amber-400/60'
                      : note.pinned
                        ? 'border-[var(--accent)]/60'
                        : 'border-[var(--border)] hover:border-[var(--accent)]'
              }`}
            >
              {/* Top Meta Row: Done Checkbox, Folder Pill, Checklist Progress, Due Badge, Pin Button */}
              <div className="flex flex-wrap items-center justify-between gap-1.5 mb-2">
                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      data-note-done-checkbox="true"
                      checked={Boolean(note.completed)}
                      onChange={() => onToggleCompleteNote(note.id)}
                      aria-label={`Mark ${note.title} completed`}
                      className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
                    />
                    <span className="text-[10px] font-extrabold text-[var(--text-muted)]">
                      {note.completed ? 'Done' : ''}
                    </span>
                  </label>

                  <span className="text-[9.5px] font-extrabold px-2 py-0.5 rounded-full bg-[var(--surface-subtle)] text-[var(--accent)] border border-[var(--border)]">
                    {folder ? `${folder.icon || '📂'} ${folder.name}` : note.category || 'Notes'}
                  </span>

                  {note.pinned && (
                    <span
                      data-note-pinned-badge="true"
                      className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-400/50"
                    >
                      📌 Pinned
                    </span>
                  )}

                  {checklistProgress && checklistProgress.total > 0 && (
                    <span
                      data-checklist-progress="true"
                      className={`text-[9.5px] font-black px-2 py-0.5 rounded-full border ${
                        checklistProgress.done === checklistProgress.total
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                          : 'bg-sky-500/15 text-sky-300 border-sky-500/45'
                      }`}
                    >
                      ☑️ {checklistProgress.done}/{checklistProgress.total} done
                    </span>
                  )}

                  {linkedCustomer && (
                    <button
                      type="button"
                      data-linked-customer-badge="true"
                      onClick={() => onOpenCustomerFolder(linkedCustomer.id)}
                      className="text-[9.5px] font-black px-2 py-0.5 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/45 cursor-pointer"
                      title={`Open ${linkedCustomer.name}'s Customer Folder`}
                    >
                      📁 {linkedCustomer.name}
                    </button>
                  )}

                  {hasDue && (
                    <span
                      className={`text-[9.5px] font-black px-2 py-0.5 rounded-full border ${
                        note.completed
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                          : dueState === 'OVERDUE'
                            ? 'bg-rose-500/20 text-rose-200 border-rose-500/60'
                            : dueState === 'DUE_TODAY'
                              ? 'bg-amber-500/20 text-amber-200 border-amber-400/60'
                              : 'bg-sky-500/15 text-sky-300 border-sky-500/40'
                      }`}
                    >
                      {dueState === 'OVERDUE'
                        ? `⚠️ Overdue • ${formatNoteDueLabel(note.dueAt, nowMs)}`
                        : dueState === 'DUE_TODAY'
                          ? `⏰ Due ${formatNoteDueLabel(note.dueAt, nowMs)}`
                          : `📅 ${formatNoteDueLabel(note.dueAt, nowMs)}`}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onToggleChecklistMode(note.id)}
                    title={note.isChecklist ? 'Switch to plain note' : 'Switch to interactive checklist'}
                    className={`px-2 py-1 rounded-lg text-[10px] font-extrabold border cursor-pointer transition-all ${
                      note.isChecklist
                        ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                        : 'bg-[var(--surface-subtle)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    ☑️
                  </button>
                  <button
                    type="button"
                    onClick={() => onTogglePinNote(note.id)}
                    title={note.pinned ? 'Unpin note' : 'Pin note to top'}
                    aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
                    className={`px-2 py-1 rounded-lg text-[10px] font-extrabold border cursor-pointer transition-all ${
                      note.pinned
                        ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                        : 'bg-[var(--surface-subtle)] border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)]'
                    }`}
                  >
                    📌 {note.pinned ? 'Unpin' : 'Pin'}
                  </button>
                </div>
              </div>

              {/* Title */}
              <h4
                className={`font-extrabold text-sm mb-1.5 ${
                  note.completed ? 'line-through text-[var(--text-muted)]' : 'text-[var(--text)]'
                }`}
              >
                {note.title}
              </h4>

              {/* Body: Interactive Checklist OR Plain Note Text */}
              {note.isChecklist && checklistItems.length > 0 ? (
                <div className="space-y-1.5 my-1.5" data-note-checklist="true">
                  {checklistItems.map((item) => (
                    <label
                      key={`${note.id}-line-${item.lineIndex}`}
                      className="flex items-start gap-2 bg-[var(--bg)]/80 border border-[var(--border)]/70 rounded-xl px-2.5 py-1.5 cursor-pointer hover:border-sky-400/50 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={() => onToggleChecklistItem(note.id, item.lineIndex)}
                        className="w-4 h-4 mt-0.5 accent-sky-400 rounded cursor-pointer shrink-0"
                      />
                      <span
                        className={`text-xs leading-snug ${
                          item.checked
                            ? 'line-through text-[var(--text-muted)]'
                            : 'text-[var(--text)] font-medium'
                        }`}
                      >
                        {item.text}
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                note.body && (
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed whitespace-pre-wrap">
                    {note.body}
                  </p>
                )
              )}

              {/* Link / Send to Customer Dropdown Bar */}
              <div className="mt-2.5 flex items-center gap-1.5">
                <select
                  data-link-customer-select="true"
                  aria-label="Link or send note to customer"
                  value=""
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) return;
                    if (val === '__NEW_CUSTOMER__') {
                      onConvertNoteToNewCustomer(note);
                    } else {
                      const custId = Number(val);
                      if (Number.isFinite(custId)) {
                        onLinkNoteToCustomer(note, custId);
                      }
                    }
                  }}
                  className="bg-[var(--bg)] border border-[var(--border)] focus:border-emerald-400 text-[var(--text)] rounded-lg px-2.5 py-1.5 text-[10.5px] font-bold outline-none cursor-pointer max-w-full"
                >
                  <option value="">
                    {linkedCustomer
                      ? `👤 Linked: ${linkedCustomer.name} (Change / Send…)`
                      : '👤 Link / Send to Customer…'}
                  </option>
                  <option value="__NEW_CUSTOMER__">
                    ➕ Create New Customer Folder from Note
                  </option>
                  {sortedCustomersForDropdown.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      📁 Attach to {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Bottom Action Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 mt-2.5 pt-2 border-t border-[var(--border)]/60">
                <div className="flex flex-wrap items-center gap-1.5">
                  {hasDue && (
                    <button
                      type="button"
                      data-ics-alarm-btn="true"
                      onClick={() => handleExportPhoneAlert(note)}
                      className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/50 text-[10px] font-black px-2.5 py-1 rounded-lg cursor-pointer transition-transform active:scale-95 flex items-center gap-1"
                      title="Export .ics event with VALARM (TRIGGER:PT0M) for Phone Calendar / Alarm"
                    >
                      <span>🔔</span>
                      <span>Add to Phone Calendar / Alarm</span>
                    </button>
                  )}

                  {onSendNoteToEstimator && (
                    <button
                      type="button"
                      onClick={() => onSendNoteToEstimator(note)}
                      className={`text-[10px] font-black px-2 py-1 rounded-lg cursor-pointer transition-transform active:scale-95 flex items-center gap-1 ${
                        hasEstimateContent
                          ? 'bg-[#2c2317] border border-[#f1c40f] text-[#f1c40f] hover:bg-[#3d301f]'
                          : 'bg-[var(--surface-subtle)] hover:bg-[var(--border)] text-[var(--text)] border border-[var(--border)]'
                      }`}
                      title="Convert room dimensions, paint, and repairs straight into an estimate quote"
                    >
                      <span>⚡</span>
                      <span>Estimator</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleSyncToGoogleKeep(note)}
                    className="bg-[#f1c40f]/15 hover:bg-[#f1c40f]/25 text-[#f1c40f] border border-[#f1c40f]/40 text-[10px] font-black px-2 py-1 rounded-lg cursor-pointer flex items-center gap-1"
                    title="Copy note and open Google Keep"
                  >
                    <span>💡</span>
                    <span>Keep</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onShareNote(note)}
                    className="bg-[var(--accent-secondary)] hover:opacity-90 text-white text-[10px] font-bold px-2 py-1 rounded-lg cursor-pointer"
                  >
                    Share
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenNoteModal(note)}
                    className="bg-[var(--surface-subtle)] hover:bg-[var(--border)] text-[var(--text)] text-[10px] font-bold px-2 py-1 rounded-lg border border-[var(--border)] cursor-pointer"
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    onClick={() => onDeleteNote(note.id)}
                    aria-label={`Delete ${note.title}`}
                    className="bg-rose-500/85 hover:bg-rose-600 text-white text-[10px] font-bold px-2 py-1 rounded-lg cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <span className="text-[9px] text-[var(--text-muted)] font-mono">
                  {note.date}
                </span>
              </div>
            </div>
          );
        })}

        {filteredNotes.length === 0 && (
          <div className="text-center py-10 bg-[var(--surface)] border border-[var(--border)] rounded-2xl text-xs text-[var(--text-muted)] space-y-2">
            <div>
              {selectedFolder === 'DUE'
                ? 'No open due-date reminders right now.'
                : 'No notes in this folder yet.'}
            </div>
            <button
              type="button"
              onClick={() => onOpenNoteModal(undefined, defaultNewNoteFolderId)}
              className="px-3 py-1.5 rounded-lg bg-[var(--accent-tertiary)] text-white text-[11px] font-extrabold cursor-pointer"
            >
              + Create Note Here
            </button>
          </div>
        )}
      </div>

      {/* Create / Rename Custom Folder Modal */}
      {folderDialog && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-sm p-4 shadow-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
              <h3 className="text-sm font-black text-[var(--accent)]">
                {folderDialog.mode === 'CREATE' ? '+ New Note Folder' : '✏️ Rename Folder'}
              </h3>
              <button
                type="button"
                onClick={() => setFolderDialog(null)}
                className="text-xs font-bold text-[var(--text-muted)] cursor-pointer"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleFolderDialogSubmit} className="space-y-3">
              <div>
                <label className="text-[9px] uppercase font-extrabold text-[var(--text-muted)] block mb-1">
                  Folder Name
                </label>
                <input
                  type="text"
                  autoFocus
                  required
                  value={folderDialog.value}
                  onChange={(e) =>
                    setFolderDialog((prev) => (prev ? { ...prev, value: e.target.value } : null))
                  }
                  placeholder="e.g. Color Matches, Crew Schedule, Vendors"
                  className="w-full bg-[var(--bg)] border border-[var(--border)] focus:border-[var(--accent)] text-[var(--text)] rounded-xl px-3 py-2 text-xs outline-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setFolderDialog(null)}
                  className="flex-1 py-2 bg-[var(--surface-subtle)] text-[var(--text)] rounded-xl text-xs font-bold border border-[var(--border)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-[var(--accent-tertiary)] text-white rounded-xl text-xs font-extrabold shadow cursor-pointer"
                >
                  {folderDialog.mode === 'CREATE' ? 'Create Folder' : 'Save Name'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
