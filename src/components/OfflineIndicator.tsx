import React from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 left-4 z-50 flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-black shadow-lg">
      <span className="h-2 w-2 rounded-full bg-black animate-pulse" />
      <span>Offline Mode — Saved jobs & database active.</span>
    </div>
  );
};
