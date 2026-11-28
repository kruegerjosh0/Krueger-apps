import React from 'react';

export type TabType = 'dash' | 'map' | 'weather' | 'notes' | 'tools';

interface NavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  notesDueBadgeCount?: number;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onTabChange,
  notesDueBadgeCount = 0,
}) => {
  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'dash', label: 'Folders', icon: '📁' },
    { id: 'map', label: 'Map', icon: '🗺️' },
    { id: 'weather', label: 'Weather', icon: '🌦️' },
    { id: 'notes', label: 'Notes', icon: '📝' },
    { id: 'tools', label: 'Tools', icon: '🛠️' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 w-full bg-[var(--surface)]/95 backdrop-blur-md border-t border-[var(--border)] z-40 h-14 sm:h-16 grid grid-cols-5 safe-bottom shadow-lg select-none">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const showBadge = tab.id === 'notes' && notesDueBadgeCount > 0;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`relative flex flex-col items-center justify-center gap-0.5 sm:gap-1 transition-all active:scale-95 cursor-pointer px-0.5 overflow-hidden ${
              isActive ? 'text-[var(--accent)] font-extrabold' : 'text-[var(--text-muted)] font-medium hover:text-[var(--text)]'
            }`}
          >
            <span className="relative text-base sm:text-lg leading-none">
              {tab.icon}
              {showBadge && (
                <span
                  data-notes-due-badge="true"
                  className="absolute -top-1.5 -right-2.5 min-w-[16px] h-[16px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-black leading-none flex items-center justify-center shadow ring-2 ring-[var(--surface)]"
                >
                  {notesDueBadgeCount > 9 ? '9+' : notesDueBadgeCount}
                </span>
              )}
            </span>
            <span className="text-[9px] sm:text-[10px] uppercase tracking-tight sm:tracking-wider truncate max-w-full">
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
