import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      id="offline-indicator-banner"
      className="fixed bottom-4 left-4 right-4 sm:right-auto sm:max-w-md z-50 flex items-center gap-2.5 rounded-xl bg-amber-500/95 backdrop-blur-md px-3.5 py-2.5 text-xs font-medium text-amber-950 shadow-lg border border-amber-400/40 animate-bounce"
    >
      <WifiOff className="w-4 h-4 shrink-0 text-amber-950" />
      <span>Offline Mode — Cached data is being used. Reconnect to sync with Firebase.</span>
    </div>
  );
};
