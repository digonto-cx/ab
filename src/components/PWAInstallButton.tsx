import React, { useState } from 'react';
import { Download, Share, X, CheckCircle2, Info } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  // If already installed in standalone mode
  if (isInstalled) {
    return (
      <div id="pwa-installed-indicator" className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono text-emerald-400 bg-black border border-emerald-900/60 rounded-md">
        <CheckCircle2 className="w-3 h-3" />
        <span>PWA ACTIVE</span>
      </div>
    );
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        id="pwa-install-btn"
        onClick={install}
        className={`inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black hover:bg-neutral-200 active:scale-98 transition-all ${className}`}
      >
        <Download className="w-3.5 h-3.5 shrink-0 text-black" />
        <span>Install PWA</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          id="pwa-install-ios-btn"
          onClick={() => setShowIOSGuide(true)}
          className={`inline-flex items-center gap-1.5 rounded-lg border border-[#333333] bg-[#111111] px-3 py-1.5 text-xs font-medium text-neutral-300 hover:text-white hover:border-white active:scale-98 transition-all ${className}`}
        >
          <Share className="w-3 h-3 text-white" />
          <span>Add to Home Screen</span>
        </button>

        {showIOSGuide && (
          <div id="ios-pwa-modal" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-xs p-4 animate-in fade-in duration-150">
            <div className="w-full max-w-sm rounded-xl bg-[#0a0a0a] border border-[#222222] p-5 shadow-2xl text-neutral-100">
              <div className="flex items-center justify-between pb-3 border-b border-[#222222]">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-black border border-[#333333] flex items-center justify-center text-white">
                    <svg viewBox="0 0 76 65" className="w-3.5 h-3.5 fill-white">
                      <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
                    </svg>
                  </div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider font-mono">Install AB PWA</h3>
                </div>
                <button
                  id="close-ios-pwa-modal-btn"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded text-neutral-400 hover:text-white hover:bg-[#111111] transition"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-4 space-y-3 text-xs leading-relaxed text-neutral-300 font-sans">
                <div className="flex items-start gap-2.5">
                  <span className="flex items-center justify-center w-5 h-5 rounded bg-[#111111] border border-[#333333] text-white text-[11px] font-mono shrink-0">1</span>
                  <p>Tap the <strong>Share</strong> button <Share className="w-3 h-3 inline text-white" /> in Safari.</p>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="flex items-center justify-center w-5 h-5 rounded bg-[#111111] border border-[#333333] text-white text-[11px] font-mono shrink-0">2</span>
                  <p>Scroll down and select <strong>Add to Home Screen</strong>.</p>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="flex items-center justify-center w-5 h-5 rounded bg-[#111111] border border-[#333333] text-white text-[11px] font-mono shrink-0">3</span>
                  <p>Tap <strong>Add</strong> to launch AB from your home screen.</p>
                </div>
              </div>

              <button
                id="dismiss-ios-pwa-modal-btn"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-lg bg-white hover:bg-neutral-200 py-2 text-xs font-semibold text-black transition"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <button
        id="pwa-install-info-btn"
        onClick={() => setShowInfo(true)}
        className={`inline-flex items-center gap-1.5 rounded-lg border border-[#333333] bg-[#111111] px-2.5 py-1.5 text-xs font-mono text-neutral-400 hover:text-white hover:border-white transition ${className}`}
        title="PWA Ready"
      >
        <Download className="w-3 h-3 text-neutral-400" />
        <span>PWA</span>
      </button>

      {showInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-xl bg-[#0a0a0a] border border-[#222222] p-5 shadow-2xl text-neutral-100">
            <div className="flex items-center justify-between pb-3 border-b border-[#222222]">
              <h3 className="text-xs font-semibold font-mono uppercase tracking-wider text-white">PWA Installation</h3>
              <button
                onClick={() => setShowInfo(false)}
                className="p-1 rounded text-neutral-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="mt-3 text-xs text-neutral-300 leading-relaxed">
              AB is installable as a lightweight Progressive Web App (PWA). Open this app in Chrome, Edge, or Safari, and choose <strong>Install App</strong> or <strong>Add to Home Screen</strong> from the address bar or browser menu.
            </p>
            <button
              onClick={() => setShowInfo(false)}
              className="mt-4 w-full rounded-lg bg-white text-black py-2 text-xs font-semibold hover:bg-neutral-200"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
};
