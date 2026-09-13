import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldX,
  Search,
  CheckCircle2,
  AlertTriangle,
  KeyRound,
  ArrowLeft,
  Check,
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db, VerificationRecordData, handleFirestoreError, OperationType } from '../firebase';

interface UsersAccessPageProps {
  onNavigate: (path: string) => void;
  initialId?: string;
}

export const UsersAccessPage: React.FC<UsersAccessPageProps> = ({
  onNavigate,
  initialId = '',
}) => {
  const [verificationIdInput, setVerificationIdInput] = useState(initialId);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{
    tested: boolean;
    granted: boolean;
    reason?: string;
    record?: VerificationRecordData;
  }>({
    tested: false,
    granted: false,
  });

  // Automatically check if initialId is supplied
  useEffect(() => {
    if (initialId) {
      setVerificationIdInput(initialId);
      performCheck(initialId);
    }
  }, [initialId]);

  const performCheck = async (idToCheck: string) => {
    const cleanId = idToCheck.trim();
    if (!cleanId) return;

    setChecking(true);
    setResult({ tested: false, granted: false });

    try {
      const docRef = doc(db, 'verifications', cleanId);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        setResult({
          tested: true,
          granted: false,
          reason: 'Verification ID was not found in the system. The token is invalid or does not exist.',
        });
        setChecking(false);
        return;
      }

      const data = docSnap.data() as Omit<VerificationRecordData, 'id'>;
      const record: VerificationRecordData = { id: docSnap.id, ...data };

      // 1. Validate status
      if (record.status !== 'VALID') {
        setResult({
          tested: true,
          granted: false,
          reason: `Verification ID status is ${record.status}. Only 'VALID' tokens are granted access.`,
          record,
        });
        setChecking(false);
        return;
      }

      // 2. Validate expiration
      const expiresAt = new Date(record.expiresAt);
      if (expiresAt < new Date()) {
        setResult({
          tested: true,
          granted: false,
          reason: `Verification token has expired. It expired on ${expiresAt.toLocaleDateString()} at ${expiresAt.toLocaleTimeString()}.`,
          record,
        });
        setChecking(false);
        return;
      }

      // 3. Grant Access
      setResult({
        tested: true,
        granted: true,
        record,
      });
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.GET, `verifications/${cleanId}`);
      } catch {
        setResult({
          tested: true,
          granted: false,
          reason: 'Network or database communication error occurred while verifying token.',
        });
      }
    } finally {
      setChecking(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    performCheck(verificationIdInput);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-6">
      {/* Page Header (Vercel Look) */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded border border-[#333333] bg-[#111111] text-neutral-300 text-xs font-mono mb-1">
          <KeyRound className="w-3 h-3 text-white" />
          <span>ACCESS VALIDATION</span>
        </div>
        <h1 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">
          Verify User Access Token
        </h1>
        <p className="text-xs text-neutral-400 max-w-md mx-auto">
          Enter a cryptographic verification ID to check Firebase validity and authorize access.
        </p>
      </div>

      {/* Search / Input Card */}
      <div className="rounded-xl bg-[#0a0a0a] border border-[#222222] p-5 sm:p-7 shadow-xl">
        <form onSubmit={handleFormSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-mono text-neutral-400 mb-1.5 uppercase tracking-wider">
              Verification ID
            </label>
            <div className="relative">
              <input
                id="verification-token-input"
                type="text"
                value={verificationIdInput}
                onChange={(e) => setVerificationIdInput(e.target.value)}
                placeholder="e.g. AB-12AB-34CD-56EF-7890"
                required
                className="w-full px-4 py-3 rounded-lg bg-black border border-[#333333] text-sm font-mono text-white placeholder-neutral-600 focus:outline-hidden focus:border-white transition"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <button
              type="button"
              onClick={() => {
                setVerificationIdInput('AB-DEMO-SAMPLE-KEY-0001');
              }}
              className="text-xs font-mono text-neutral-500 hover:text-white transition"
            >
              Fill demo ID
            </button>

            <button
              id="validate-token-btn"
              type="submit"
              disabled={checking || !verificationIdInput.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white hover:bg-neutral-200 text-black text-xs font-semibold tracking-tight transition active:scale-98 disabled:opacity-50"
            >
              {checking ? (
                <span>Checking Database...</span>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5" />
                  <span>Validate ID</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Validation Result Box */}
      {result.tested && (
        <div className="animate-in fade-in duration-150">
          {result.granted ? (
            /* ACCESS GRANTED (Vercel Look) */
            <div
              id="access-granted-card"
              className="rounded-xl bg-[#0a0a0a] border border-emerald-900/80 p-6 shadow-2xl space-y-4 text-neutral-100"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-black border border-emerald-800 text-emerald-400 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase tracking-wider bg-black text-emerald-400 border border-emerald-800">
                      ACCESS GRANTED
                    </span>
                    <h2 className="text-base font-semibold text-white mt-1">
                      Identity & Verification Confirmed
                    </h2>
                  </div>
                </div>

                <div className="text-right hidden sm:block">
                  <span className="text-xs text-emerald-400 font-mono block">Status: VALID</span>
                  <span className="text-[10px] text-neutral-500 font-mono">Firebase Verified</span>
                </div>
              </div>

              <div className="rounded-lg bg-black border border-[#222222] p-4 space-y-2 text-xs font-mono">
                <div className="flex items-center justify-between pb-2 border-b border-[#222222]">
                  <span className="text-neutral-400">Validated Token:</span>
                  <span className="text-white font-semibold">{result.record?.id}</span>
                </div>

                <div className="flex items-center justify-between pb-2 border-b border-[#222222]">
                  <span className="text-neutral-400">Status:</span>
                  <span className="text-emerald-400 font-semibold">VALID</span>
                </div>

                <div className="flex items-center justify-between pb-2 border-b border-[#222222]">
                  <span className="text-neutral-400">Verified Timestamp:</span>
                  <span className="text-neutral-200">
                    {result.record?.createdAt ? new Date(result.record.createdAt).toLocaleString() : 'Recent'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-neutral-400">Expires:</span>
                  <span className="text-neutral-200">
                    {result.record?.expiresAt ? new Date(result.record.expiresAt).toLocaleString() : '7 Days'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => onNavigate('/app')}
                  className="px-4 py-2 rounded-lg bg-white hover:bg-neutral-200 text-xs font-semibold text-black transition"
                >
                  Return to Dashboard
                </button>
              </div>
            </div>
          ) : (
            /* ACCESS DENIED (Vercel Look) */
            <div
              id="access-denied-card"
              className="rounded-xl bg-[#0a0a0a] border border-red-900/80 p-6 shadow-2xl space-y-4 text-neutral-100"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-black border border-red-900 text-red-400 flex items-center justify-center shrink-0">
                  <ShieldX className="w-5 h-5" />
                </div>
                <div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase tracking-wider bg-black text-red-400 border border-red-900">
                    ACCESS DENIED
                  </span>
                  <h2 className="text-base font-semibold text-white mt-1">
                    Invalid or Expired Verification ID
                  </h2>
                </div>
              </div>

              <p className="text-xs text-neutral-300 font-mono leading-relaxed">
                {result.reason || 'The requested verification token could not be authorized.'}
              </p>

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={() => onNavigate('/alis')}
                  className="px-4 py-2 rounded-lg bg-white text-black text-xs font-semibold hover:bg-neutral-200 transition"
                >
                  Start Verification Flow
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
