import React, { useState, useEffect } from 'react';
import { Navigation } from './components/Navigation';
import { OfflineIndicator } from './components/OfflineIndicator';
import { AppDashboard } from './pages/AppDashboard';
import { VerificationPage } from './pages/VerificationPage';
import { UsersAccessPage } from './pages/UsersAccessPage';
import { VercelLandingPage } from './pages/VercelLandingPage';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { ArrowRight } from 'lucide-react';

export default function App() {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const path = window.location.pathname;
      return path || '/';
    }
    return '/';
  });

  const [currentUser, setCurrentUser] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('ab_auth_user');
    }
    return null;
  });

  // Seed default active alis link if database is fresh
  useEffect(() => {
    const seedRef = doc(db, 'alis', 'welcome-mehedi');
    getDoc(seedRef).then((snap) => {
      if (!snap.exists()) {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        setDoc(seedRef, {
          owner: 'AbuSayedX',
          createdAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
          status: 'active',
        }).catch(() => {});
      }
    }).catch(() => {});
  }, []);

  // Listen to browser navigation popstate
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      setCurrentPath(path || '/');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (path: string) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', path);
    }
    setCurrentPath(path);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLogin = (user: string) => {
    setCurrentUser(user);
    sessionStorage.setItem('ab_auth_user', user);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    sessionStorage.removeItem('ab_auth_user');
    navigateTo('/x');
  };

  // Route extraction
  const [routePath, routeQuery] = currentPath.split('?');
  const queryParams = new URLSearchParams(routeQuery || (typeof window !== 'undefined' ? window.location.search : ''));
  const targetId = queryParams.get('id') || '';

  // Render Page Content based on Path
  const renderContent = () => {
    // 1. Verification links: /alis or /alis/:alisId
    if (routePath.startsWith('/alis')) {
      const pathParts = routePath.split('/').filter(Boolean);
      const subAlisId = pathParts[1];

      if (subAlisId) {
        return (
          <VerificationPage
            alisId={subAlisId}
            onNavigate={navigateTo}
          />
        );
      }

      // If just "/alis", show launcher portal in Vercel look
      return (
        <div className="max-w-xl mx-auto px-4 py-16 space-y-6 text-center">
          <div className="w-12 h-12 rounded-lg bg-black border border-[#333333] flex items-center justify-center mx-auto text-white">
            <svg viewBox="0 0 76 65" className="w-6 h-6 fill-white">
              <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white tracking-tight">
              Verification Link Gateway
            </h1>
            <p className="text-xs text-neutral-400 font-mono max-w-sm mx-auto mt-1">
              Dynamic URLs operate in format /alis/{'{alis}'}
            </p>
          </div>

          <div className="p-6 rounded-xl bg-[#0a0a0a] border border-[#222222] space-y-4 text-left">
            <h3 className="text-xs font-mono font-medium text-neutral-400 uppercase tracking-wider">
              Available Verification Links
            </h3>

            <div className="space-y-2">
              <button
                onClick={() => navigateTo('/alis/welcome-mehedi')}
                className="w-full flex items-center justify-between p-3.5 rounded-lg bg-black border border-[#333333] hover:border-white transition group"
              >
                <div>
                  <div className="font-mono text-sm font-semibold text-white">
                    /alis/welcome-mehedi
                  </div>
                  <div className="text-[11px] text-neutral-400">Mehedi Hasan Community Portal</div>
                </div>
                <ArrowRight className="w-4 h-4 text-white group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>

            <div className="pt-3 border-t border-[#222222] flex items-center justify-between text-xs">
              <span className="text-neutral-400">Vercel Edge Secure Portal</span>
              <button
                onClick={() => navigateTo('/')}
                className="text-white hover:underline font-medium"
              >
                Return Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    // 2. User Access Check: /users
    if (routePath.startsWith('/users')) {
      return (
        <UsersAccessPage
          onNavigate={navigateTo}
          initialId={targetId}
        />
      );
    }

    // 3. Admin Console: /x or legacy /app
    if (routePath === '/x' || routePath.startsWith('/x/') || routePath === '/app' || routePath.startsWith('/app/')) {
      return (
        <AppDashboard
          onNavigate={navigateTo}
          currentUser={currentUser}
          onLogin={handleLogin}
          onLogout={handleLogout}
        />
      );
    }

    // 4. Default Home: Vercel Landing Page (/)
    return (
      <VercelLandingPage
        onNavigate={navigateTo}
      />
    );
  };

  const isVerificationPage = routePath.startsWith('/alis');

  return (
    <div className="min-h-screen bg-black text-neutral-100 flex flex-col font-sans selection:bg-white selection:text-black">
      {!isVerificationPage && (
        <Navigation
          currentPath={currentPath}
          onNavigate={navigateTo}
          userAccount={currentUser}
          onSignOut={currentUser ? handleLogout : undefined}
        />
      )}

      <main className="flex-1">
        {renderContent()}
      </main>

      {/* Persistent Offline Status Banner */}
      <OfflineIndicator />

      {/* Compact Vercel Minimal Footer */}
      <footer className="border-t border-[#222222] bg-black py-6 text-xs text-neutral-500">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3 font-mono">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 76 65" className="w-3 h-3 fill-neutral-400">
              <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
            </svg>
            <span className="text-neutral-300">AB Platform</span>
            <span>•</span>
            <span className="text-white font-medium">Devloped by : Chiper X 404</span>
          </div>
          <div className="text-[11px] text-neutral-500">
            PWA Enabled • Vercel Look
          </div>
        </div>
      </footer>
    </div>
  );
}
