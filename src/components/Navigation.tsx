import React from 'react';

export type TabType = 'dash' | 'sched' | 'weather' | 'notes' | 'tools';

interface NavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export const Navigation: React.FC<NavigationProps> = ({ activeTab, onTabChange }) => {
  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'dash', label: 'Folders', icon: '📁' },
    { id: 'sched', label: 'Schedule', icon: '📅' },
    { id: 'weather', label: 'Weather', icon: '🌦️' },
    { id: 'notes', label: 'Notes', icon: '📝' },
    { id: 'tools', label: 'Tools', icon: '🛠️' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 w-full bg-[var(--surface)]/95 backdrop-blur-md border-t border-[var(--border)] z-40 h-14 sm:h-16 grid grid-cols-5 safe-bottom shadow-lg select-none">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`flex flex-col items-center justify-center gap-0.5 sm:gap-1 transition-all active:scale-95 cursor-pointer px-0.5 overflow-hidden ${
              isActive ? 'text-[var(--accent)] font-extrabold' : 'text-[var(--text-muted)] font-medium hover:text-[var(--text)]'
            }`}
          >
            <span className="text-base sm:text-lg leading-none">{tab.icon}</span>
            <span className="text-[9px] sm:text-[10px] uppercase tracking-tight sm:tracking-wider truncate max-w-full">
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
