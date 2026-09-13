import React, { useState } from 'react';
import { ShieldCheck, Lock, EyeOff, Info, Check, X } from 'lucide-react';

interface PrivacyNoticeModalProps {
  isOpen: boolean;
  onConsent: () => void;
  onClose?: () => void;
}

export const PrivacyNoticeModal: React.FC<PrivacyNoticeModalProps> = ({
  isOpen,
  onConsent,
}) => {
  const [showFullPolicy, setShowFullPolicy] = useState(false);
  const [allowedCookies, setAllowedCookies] = useState(false);

  if (!isOpen) return null;

  return (
    <div
      id="privacy-consent-modal"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-sm p-4 transition-all"
    >
      <div
        id="privacy-modal-card"
        className="w-full max-w-lg rounded-xl bg-[#0a0a0a] border border-[#222222] p-6 sm:p-7 shadow-2xl text-neutral-100 relative max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start gap-3.5 mb-4">
          <div className="w-9 h-9 rounded-lg bg-black border border-[#333333] flex items-center justify-center text-white shrink-0">
            <svg viewBox="0 0 76 65" className="w-4 h-4 fill-white" aria-label="Vercel Delta">
              <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-tight text-white">
              Privacy & Verification Notice
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5 font-mono">
              Zero-Knowledge Community Verification
            </p>
          </div>
        </div>

        {/* Required verbatim text from prompt */}
        <div className="rounded-lg bg-black border border-[#222222] p-4 mb-4">
          <p className="text-xs sm:text-sm leading-relaxed text-neutral-200">
            “We may use limited browser/device information for verification. Camera access is requested only when required for the verification process. Camera footage is not stored or uploaded.”
          </p>
        </div>

        {/* Highlighted safeguards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5 text-xs text-neutral-300">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-black border border-[#222222]">
            <EyeOff className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
            <span className="text-[11px]">No video or photos recorded</span>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-black border border-[#222222]">
            <Lock className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
            <span className="text-[11px]">No tracking cookies</span>
          </div>
        </div>

        {/* Action Buttons as requested */}
        <div className="space-y-2 pt-2 border-t border-[#222222]">
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              id="allow-cookies-btn"
              type="button"
              onClick={() => setAllowedCookies(!allowedCookies)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-mono border transition ${
                allowedCookies
                  ? 'bg-[#1a1a1a] border-white text-white'
                  : 'bg-black border-[#333333] text-neutral-400 hover:text-white'
              }`}
            >
              <span className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[10px] border ${
                allowedCookies ? 'bg-white border-white text-black' : 'border-[#444444]'
              }`}>
                {allowedCookies && <Check className="w-3 h-3 stroke-[3]" />}
              </span>
              Allow necessary cookies
            </button>

            <button
              id="view-privacy-policy-btn"
              type="button"
              onClick={() => setShowFullPolicy(true)}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-[#333333] bg-[#111111] text-neutral-300 hover:text-white hover:border-neutral-400 transition"
            >
              <Info className="w-3.5 h-3.5" />
              Privacy Policy
            </button>
          </div>

          <button
            id="privacy-continue-btn"
            type="button"
            onClick={onConsent}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-white hover:bg-neutral-200 text-black font-semibold text-xs transition active:scale-98"
          >
            Continue
          </button>
        </div>

        {/* Full Privacy Policy Modal */}
        {showFullPolicy && (
          <div
            id="full-privacy-policy-modal"
            className="fixed inset-0 z-60 flex items-center justify-center bg-black/95 p-4"
          >
            <div className="w-full max-w-lg rounded-xl bg-[#0a0a0a] border border-[#333333] p-6 shadow-2xl max-h-[85vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-[#222222]">
                <h3 className="font-semibold text-white text-sm">AB Privacy Policy</h3>
                <button
                  onClick={() => setShowFullPolicy(false)}
                  className="p-1 text-neutral-400 hover:text-white rounded hover:bg-[#111111]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-4 space-y-4 text-xs text-neutral-300 leading-relaxed font-sans">
                <section>
                  <h4 className="font-semibold text-white mb-1">1. Scope of Data Collection</h4>
                  <p>
                    AB operates under a strict data minimization policy. During verification, we collect only necessary technical telemetry to detect automated bots: browser family, device platform, screen resolution, and referrer URL.
                  </p>
                </section>

                <section>
                  <h4 className="font-semibold text-white mb-1">2. Camera & Liveness Guarantee</h4>
                  <p>
                    When human verification is initiated, camera permissions are requested explicitly. Video streams run exclusively in volatile local memory for 2-3 seconds to detect human presence. <strong>Video frames or audio are never stored, written to disk, or transmitted over the internet.</strong>
                  </p>
                </section>

                <section>
                  <h4 className="font-semibold text-white mb-1">3. Storage & Cryptography</h4>
                  <p>
                    Upon successful liveness check, a random token (ID) is generated using cryptographic randomness and stored in Firebase Firestore. The token can be verified at /users without exposing any private information.
                  </p>
                </section>

                <section>
                  <h4 className="font-semibold text-white mb-1">4. Notification Services</h4>
                  <p>
                    Minimal notifications sent to external webhooks (such as Telegram) only include the Token ID, validity status, and timestamp.
                  </p>
                </section>
              </div>

              <button
                onClick={() => setShowFullPolicy(false)}
                className="mt-5 w-full py-2 rounded-lg bg-white text-black text-xs font-semibold hover:bg-neutral-200 transition"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
