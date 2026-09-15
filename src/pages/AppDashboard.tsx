import React, { useState, useEffect } from 'react';
import {
  Plus,
  Copy,
  ExternalLink,
  Trash2,
  RefreshCw,
  Lock,
  Clock,
  ArrowRight,
  KeyRound,
  Check,
  CheckCircle,
} from 'lucide-react';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
} from 'firebase/firestore';
import { db, AlisLinkData, handleFirestoreError, OperationType } from '../firebase';
import { generateAlisSlug } from '../utils/crypto';
import { PWAInstallButton } from '../components/PWAInstallButton';

interface AppDashboardProps {
  onNavigate: (path: string) => void;
  currentUser: string | null;
  onLogin: (username: string) => void;
  onLogout: () => void;
}

export const AppDashboard: React.FC<AppDashboardProps> = ({
  onNavigate,
  currentUser,
  onLogin,
  onLogout,
}) => {
  // Login: Only password required ("Login a sudu password nibe")
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  // Dashboard state: strictly dynamic links
  const [links, setLinks] = useState<AlisLinkData[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(true);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // New link modal/form state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [customSlug, setCustomSlug] = useState('');
  const [expirationHours, setExpirationHours] = useState('24');
  const [creatingLink, setCreatingLink] = useState(false);
  const [lastCreatedLink, setLastCreatedLink] = useState<string | null>(null);
  const [copyToast, setCopyToast] = useState<string | null>(null);

  const isAuthorized = currentUser?.toLowerCase() === 'abusayedx';

  // Fallback-safe clipboard copy helper
  const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Continue to fallback
    }
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    } catch {
      return false;
    }
  };

  // Handle Login with Password Only
  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const trimmedPassword = passwordInput.trim();
    if (!trimmedPassword) {
      setAuthError('Please enter your administrator password to continue.');
      return;
    }

    // Direct authorization as AbuSayedX
    onLogin('AbuSayedX');
    setPasswordInput('');
  };

  // Listen to Alis links
  useEffect(() => {
    if (!isAuthorized) return;

    setLoadingLinks(true);
    const alisRef = collection(db, 'alis');
    const unsubscribe = onSnapshot(
      alisRef,
      (snapshot) => {
        const items: AlisLinkData[] = [];
        snapshot.forEach((docSnap) => {
          items.push({ id: docSnap.id, ...(docSnap.data() as Omit<AlisLinkData, 'id'>) });
        });
        // Sort newest first
        items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setLinks(items);
        setLoadingLinks(false);
      },
      (err) => {
        setLoadingLinks(false);
        try {
          handleFirestoreError(err, OperationType.LIST, 'alis');
        } catch {
          console.warn('Could not load alis links');
        }
      }
    );

    return () => unsubscribe();
  }, [isAuthorized]);

  // Create new Alis Link
  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingLink(true);

    const slug = (customSlug.trim() || generateAlisSlug()).replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + parseInt(expirationHours) * 60 * 60 * 1000);

    const newLinkData: Omit<AlisLinkData, 'id'> = {
      owner: 'AbuSayedX',
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      status: 'active',
    };

    try {
      await setDoc(doc(db, 'alis', slug), newLinkData);
      setShowCreateModal(false);
      setCustomSlug('');
      setExpirationHours('24');
      const fullUrl = `${window.location.origin}/alis/${slug}`;
      setLastCreatedLink(fullUrl);
      copyToClipboard(fullUrl);
      setCopyToast(`Link created & copied: ${fullUrl}`);
      setTimeout(() => setCopyToast(null), 4000);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `alis/${slug}`);
    } finally {
      setCreatingLink(false);
    }
  };

  // Delete / Revoke Link
  const handleDeleteLink = async (alisId: string) => {
    if (!confirm(`Revoke verification link /alis/${alisId}?`)) return;
    try {
      await deleteDoc(doc(db, 'alis', alisId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `alis/${alisId}`);
    }
  };

  // Copy link
  const handleCopy = async (alisId: string) => {
    const fullUrl = `${window.location.origin}/alis/${alisId}`;
    await copyToClipboard(fullUrl);
    setCopiedLink(alisId);
    setCopyToast(`Copied: ${fullUrl}`);
    setTimeout(() => {
      setCopiedLink(null);
      setCopyToast(null);
    }, 2500);
  };

  // Login View: Vercel Look & Password Only
  if (!isAuthorized) {
    return (
      <div id="login-container" className="min-h-[80vh] flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm rounded-xl bg-[#0a0a0a] border border-[#222222] p-8 shadow-2xl relative overflow-hidden">
          {/* Subtle top edge highlight */}
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/30 to-transparent" />

          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-10 h-10 rounded-lg bg-black border border-[#333333] flex items-center justify-center mb-3">
              <svg viewBox="0 0 76 65" className="w-5 h-5 fill-white" aria-label="Vercel Delta">
                <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
              </svg>
            </div>
            <h1 className="text-lg font-semibold text-white tracking-tight">AB Verification</h1>
            <p className="text-xs text-neutral-400 mt-1">
              Enter administrator password to continue
            </p>
          </div>

          {authError && (
            <div id="auth-error-alert" className="mb-4 p-3 rounded-lg bg-red-950/40 border border-red-900/60 text-red-200 text-xs">
              {authError}
            </div>
          )}

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-neutral-400 mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <input
                  id="password-input"
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Enter password..."
                  required
                  autoFocus
                  className="w-full px-3.5 py-2.5 rounded-lg bg-black border border-[#333333] text-sm text-white placeholder-neutral-600 focus:outline-hidden focus:border-white transition"
                />
              </div>
            </div>

            <button
              id="login-submit-btn"
              type="submit"
              className="w-full py-2.5 px-4 rounded-lg bg-white hover:bg-neutral-200 text-black text-xs font-semibold tracking-tight transition active:scale-98"
            >
              Sign In
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-[#222222] text-center">
            <span className="text-[11px] font-mono text-neutral-500">
              Account: AbuSayedX
            </span>
          </div>
        </div>
      </div>
    );
  }

  // Active links count
  const activeLinks = links.filter((l) => l.status === 'active' && new Date(l.expiresAt) > new Date());
  const activeLinksCount = activeLinks.length;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Top Header (Vercel Look) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#222222]">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold text-white tracking-tight">
              Dashboard
            </h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded border border-[#333333] bg-[#111111] text-neutral-300">
              AbuSayedX
            </span>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Generate and distribute dynamic verification links (/alis).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <PWAInstallButton />
          <button
            id="create-link-modal-open-btn"
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white text-black text-xs font-semibold hover:bg-neutral-200 transition active:scale-98"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create /alis Link</span>
          </button>
          <button
            id="admin-signout-btn"
            onClick={onLogout}
            className="px-3 py-2 rounded-lg border border-[#333333] bg-black text-xs text-neutral-400 hover:text-white hover:border-neutral-500 transition"
          >
            Exit
          </button>
        </div>
      </div>

      {/* Overview Metric Cards (Vercel Look) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-5 rounded-xl bg-[#0a0a0a] border border-[#222222]">
          <div className="flex items-center justify-between text-neutral-400 text-xs font-mono mb-2">
            <span>ACTIVE LINKS</span>
            <KeyRound className="w-4 h-4 text-neutral-500" />
          </div>
          <div className="text-3xl font-semibold text-white tracking-tight">{activeLinksCount}</div>
          <div className="text-[11px] text-neutral-500 mt-1">Ready for verification flow</div>
        </div>

        <div className="p-5 rounded-xl bg-[#0a0a0a] border border-[#222222]">
          <div className="flex items-center justify-between text-neutral-400 text-xs font-mono mb-2">
            <span>TOTAL LINKS CREATED</span>
            <Clock className="w-4 h-4 text-neutral-500" />
          </div>
          <div className="text-3xl font-semibold text-white tracking-tight">{links.length}</div>
          <div className="text-[11px] text-neutral-500 mt-1">Historical verification URLs</div>
        </div>
      </div>

      {/* Success Notification Banner for Newly Created Link */}
      {lastCreatedLink && (
        <div className="p-4 rounded-xl bg-[#0a0a0a] border border-emerald-800/80 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <span className="text-emerald-400 font-semibold block sm:inline mr-2">Link Generated:</span>
              <span className="text-white select-all break-all">{lastCreatedLink}</span>
            </div>
          </div>
          <button
            onClick={() => {
              copyToClipboard(lastCreatedLink);
              setCopyToast(`Copied: ${lastCreatedLink}`);
              setTimeout(() => setCopyToast(null), 2500);
            }}
            className="flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white hover:bg-neutral-200 text-black font-semibold text-xs transition active:scale-98 shrink-0"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy Link</span>
          </button>
        </div>
      )}

      {/* Dynamic Link Generator Section (Vercel Look) */}
      <div className="rounded-xl bg-[#0a0a0a] border border-[#222222] overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-[#222222] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white tracking-tight">Dynamic Verification Links</h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Unique entry points for Mehedi Hasan community verification portal.
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#333333] bg-[#111111] text-neutral-200 hover:text-white hover:border-white text-xs font-medium transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Link</span>
          </button>
        </div>

        {loadingLinks ? (
          <div className="p-10 text-center text-neutral-400 text-xs flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-white" />
            <span>Loading verification links...</span>
          </div>
        ) : links.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-neutral-400 text-xs">No verification links created yet.</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-3 px-4 py-2 rounded-lg bg-white text-black text-xs font-semibold hover:bg-neutral-200"
            >
              Generate first /alis link
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[#222222]">
            {links.map((item) => {
              const isExpired = new Date(item.expiresAt) < new Date();
              const isUsed = item.status === 'used';
              const displayStatus = isUsed ? 'used' : isExpired ? 'expired' : item.status;
              const fullUrl = `${window.location.origin}/alis/${item.id}`;

              return (
                <div
                  key={item.id}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#111111]/60 transition"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs sm:text-sm font-semibold text-white">
                        /alis/{item.id}
                      </span>
                      <span
                        className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${
                          displayStatus === 'active'
                            ? 'bg-neutral-900 text-emerald-400 border-emerald-900/60'
                            : displayStatus === 'used'
                            ? 'bg-neutral-900 text-neutral-300 border-[#333333]'
                            : 'bg-neutral-900 text-neutral-500 border-[#222222]'
                        }`}
                      >
                        {displayStatus}
                      </span>
                      {item.verificationId && (
                        <span className="text-[10px] font-mono text-neutral-400 bg-black px-2 py-0.5 rounded border border-[#222222]">
                          ID: {item.verificationId}
                        </span>
                      )}
                    </div>

                    {/* Direct Click-to-Copy Full URL snippet */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleCopy(item.id)}
                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-black border border-[#333333] hover:border-neutral-400 text-[11px] font-mono text-neutral-300 hover:text-white transition group text-left max-w-full truncate"
                        title="Click to copy full verification link"
                      >
                        <Copy className="w-3 h-3 text-neutral-500 group-hover:text-white shrink-0" />
                        <span className="truncate">{fullUrl}</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-neutral-400 font-mono">
                      <span>Expires: {new Date(item.expiresAt).toLocaleString()}</span>
                      <span>•</span>
                      <span>Owner: {item.owner}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      id={`copy-link-${item.id}`}
                      onClick={() => handleCopy(item.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono font-medium transition ${
                        copiedLink === item.id
                          ? 'border-emerald-700 bg-black text-emerald-400'
                          : 'border-[#333333] bg-black text-white hover:border-white'
                      }`}
                      title="Copy full verification link to clipboard"
                    >
                      {copiedLink === item.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Link</span>
                        </>
                      )}
                    </button>

                    <button
                      id={`open-link-${item.id}`}
                      onClick={() => onNavigate(`/alis/${item.id}`)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#333333] bg-[#111111] text-xs font-medium text-white hover:border-white transition"
                      title="Open verification portal"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open</span>
                    </button>

                    <button
                      id={`delete-link-${item.id}`}
                      onClick={() => handleDeleteLink(item.id)}
                      className="p-1.5 rounded-lg text-neutral-500 hover:text-red-400 hover:bg-neutral-900 transition"
                      title="Revoke link"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Developer Credit & Status */}
      <div className="flex items-center justify-between text-[11px] font-mono text-neutral-500 pt-2 px-1">
        <span>Devloped by : <span className="text-neutral-300 font-medium">Chiper X 404</span></span>
        <span>Secure Alis Router</span>
      </div>

      {/* Toast popup feedback for Copy */}
      {copyToast && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-lg bg-white text-black text-xs font-mono font-medium shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150 border border-neutral-300">
          <Check className="w-4 h-4 text-black stroke-[2.5]" />
          <span>{copyToast}</span>
        </div>
      )}

      {/* Create Link Modal (Vercel Look) */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl bg-[#0a0a0a] border border-[#222222] p-6 shadow-2xl space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-white tracking-tight">Create /alis Link</h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Generate a dynamic verification URL.
              </p>
            </div>

            <form onSubmit={handleCreateLink} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-neutral-400 mb-1">
                  Custom Slug (Optional)
                </label>
                <div className="flex items-center">
                  <span className="px-3 py-2 bg-black border border-r-0 border-[#333333] rounded-l-lg text-xs font-mono text-neutral-500">
                    /alis/
                  </span>
                  <input
                    type="text"
                    value={customSlug}
                    onChange={(e) => setCustomSlug(e.target.value)}
                    placeholder="e.g. vip-pass or leave blank"
                    className="w-full px-3 py-2 bg-black border border-[#333333] rounded-r-lg text-xs text-white placeholder-neutral-600 focus:outline-hidden focus:border-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono text-neutral-400 mb-1">
                  Expiration
                </label>
                <select
                  value={expirationHours}
                  onChange={(e) => setExpirationHours(e.target.value)}
                  className="w-full px-3 py-2 bg-black border border-[#333333] rounded-lg text-xs text-white focus:outline-hidden focus:border-white"
                >
                  <option value="1">1 Hour</option>
                  <option value="6">6 Hours</option>
                  <option value="24">24 Hours (1 Day)</option>
                  <option value="72">72 Hours (3 Days)</option>
                  <option value="168">7 Days</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#222222]">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg text-xs text-neutral-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingLink}
                  className="px-4 py-2 rounded-lg bg-white text-black text-xs font-semibold hover:bg-neutral-200 transition disabled:opacity-50"
                >
                  {creatingLink ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
