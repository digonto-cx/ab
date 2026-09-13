import React, { useState } from 'react';
import { Menu, X, LayoutDashboard, KeyRound, CheckCircle, LogOut, Download, Sparkles } from 'lucide-react';
import { PWAInstallButton } from './PWAInstallButton';

interface NavigationProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  userAccount?: string | null;
  onSignOut?: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentPath,
  onNavigate,
  userAccount,
  onSignOut,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const isApp = currentPath.startsWith('/app');
  const isAlis = currentPath.startsWith('/alis');
  const isUsers = currentPath.startsWith('/users');

  const handleNavClick = (path: string) => {
    onNavigate(path);
    setIsMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[#222222] bg-black/90 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        {/* Vercel Iconic Triangle Logo & Brand */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleNavClick('/app')}
            className="flex items-center gap-2.5 group focus:outline-hidden"
            title="AB Platform"
          >
            <div className="w-7 h-7 rounded-lg bg-black border border-[#333333] flex items-center justify-center group-hover:border-white transition-colors">
              {/* Vercel Delta Triangle */}
              <svg viewBox="0 0 76 65" className="w-3.5 h-3.5 fill-white" aria-label="Vercel Delta">
                <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
              </svg>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white text-sm tracking-tight">AB</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-[#333333] bg-[#111111] text-neutral-400">
                PRO
              </span>
            </div>
          </button>
        </div>

        {/* Desktop Route Tabs (Vercel Look) */}
        <nav className="hidden md:flex items-center gap-1 text-xs font-medium text-neutral-400">
          <button
            id="nav-app-link"
            onClick={() => handleNavClick('/app')}
            className={`px-3 py-1.5 rounded-md transition-all ${
              isApp
                ? 'bg-[#1a1a1a] text-white border border-[#333333] font-semibold'
                : 'hover:text-white hover:bg-[#111111]'
            }`}
          >
            Dashboard
          </button>

          <button
            id="nav-alis-link"
            onClick={() => handleNavClick('/alis')}
            className={`px-3 py-1.5 rounded-md transition-all ${
              isAlis
                ? 'bg-[#1a1a1a] text-white border border-[#333333] font-semibold'
                : 'hover:text-white hover:bg-[#111111]'
            }`}
          >
            /alis Links
          </button>

          <button
            id="nav-users-link"
            onClick={() => handleNavClick('/users')}
            className={`px-3 py-1.5 rounded-md transition-all ${
              isUsers
                ? 'bg-[#1a1a1a] text-white border border-[#333333] font-semibold'
                : 'hover:text-white hover:bg-[#111111]'
            }`}
          >
            Access Check
          </button>
        </nav>

        {/* Right Actions: Install Button + User Auth + Toggle Menu Button */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-2">
            <PWAInstallButton />
          </div>

          {userAccount && (
            <div className="hidden md:flex items-center gap-2 pl-2 border-l border-[#222222]">
              <span className="text-xs font-mono text-neutral-300">
                {userAccount}
              </span>
              {onSignOut && (
                <button
                  onClick={onSignOut}
                  className="text-xs text-neutral-500 hover:text-white px-2 py-1 rounded border border-transparent hover:border-[#333333] transition"
                  title="Sign out"
                >
                  Exit
                </button>
              )}
            </div>
          )}

          {/* Toggle Menu Button (Togke menu dau) */}
          <button
            id="toggle-menu-btn"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-[#333333] bg-[#111111] text-neutral-300 hover:text-white hover:border-white transition-colors"
            aria-label="Toggle Menu"
            title="Toggle Menu"
          >
            {isMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Toggle Menu Dropdown / Drawer (Vercel Look) */}
      {isMenuOpen && (
        <div
          id="toggle-dropdown-menu"
          className="border-t border-[#222222] bg-[#000000] px-4 py-4 space-y-3 animate-in slide-in-from-top-2 duration-150 shadow-2xl"
        >
          <div className="text-[11px] font-mono uppercase tracking-wider text-neutral-500 px-2">
            Navigation Menu
          </div>

          <div className="space-y-1">
            <button
              onClick={() => handleNavClick('/app')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition ${
                isApp
                  ? 'bg-white text-black font-semibold'
                  : 'text-neutral-300 hover:text-white hover:bg-[#111111]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <LayoutDashboard className="w-4 h-4" />
                <span>Dashboard (/app)</span>
              </div>
              {isApp && <span className="text-[10px] font-mono">ACTIVE</span>}
            </button>

            <button
              onClick={() => handleNavClick('/alis')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition ${
                isAlis
                  ? 'bg-white text-black font-semibold'
                  : 'text-neutral-300 hover:text-white hover:bg-[#111111]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <KeyRound className="w-4 h-4" />
                <span>Verification Links (/alis)</span>
              </div>
              {isAlis && <span className="text-[10px] font-mono">ACTIVE</span>}
            </button>

            <button
              onClick={() => handleNavClick('/users')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition ${
                isUsers
                  ? 'bg-white text-black font-semibold'
                  : 'text-neutral-300 hover:text-white hover:bg-[#111111]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <CheckCircle className="w-4 h-4" />
                <span>User Access Check (/users)</span>
              </div>
              {isUsers && <span className="text-[10px] font-mono">ACTIVE</span>}
            </button>
          </div>

          <div className="pt-2 border-t border-[#222222] flex items-center justify-between">
            <PWAInstallButton />

            {userAccount ? (
              <button
                onClick={() => {
                  onSignOut?.();
                  setIsMenuOpen(false);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-rose-400 hover:bg-rose-950/40 border border-rose-900/40 transition"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Exit {userAccount}</span>
              </button>
            ) : (
              <span className="text-[11px] font-mono text-neutral-500">
                AbuSayedX Restricted
              </span>
            )}
          </div>

          <div className="pt-2 border-t border-[#222222] text-center text-[10px] font-mono text-neutral-400">
            Devloped by : <span className="text-white font-medium">Chiper X 404</span>
          </div>
        </div>
      )}
    </header>
  );
};
