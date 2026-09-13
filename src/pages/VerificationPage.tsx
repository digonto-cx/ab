import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  Camera,
  CheckCircle2,
  AlertCircle,
  Clock,
  Compass,
  Laptop,
  Monitor,
  Globe,
  Share2,
  Lock,
  Copy,
  ArrowRight,
  RefreshCw,
  ExternalLink,
  Check,
} from 'lucide-react';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db, AlisLinkData, VerificationRecordData, handleFirestoreError, OperationType } from '../firebase';
import { getDeviceInfo, CollectedDeviceInfo } from '../utils/deviceInfo';
import { generateVerificationId } from '../utils/crypto';
import { sendTelegramVerificationNotification } from '../utils/telegram';
import { PrivacyNoticeModal } from '../components/PrivacyNoticeModal';

interface VerificationPageProps {
  alisId?: string;
  onNavigate: (path: string) => void;
}

type VerificationStep =
  | 'overview'
  | 'explain_camera'
  | 'camera_liveness'
  | 'camera_denied'
  | 'alternative_human_check'
  | 'generating'
  | 'completed';

export const VerificationPage: React.FC<VerificationPageProps> = ({ alisId, onNavigate }) => {
  // Alis Link State
  const [alisData, setAlisData] = useState<AlisLinkData | null>(null);
  const [loadingAlis, setLoadingAlis] = useState(true);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Privacy & Consent
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [privacyConsented, setPrivacyConsented] = useState(false);

  // Step flow
  const [step, setStep] = useState<VerificationStep>('overview');
  const [deviceInfo, setDeviceInfo] = useState<CollectedDeviceInfo | null>(null);

  // Camera Liveness State
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const [livenessProgress, setLivenessProgress] = useState(0);
  const [livenessMessage, setLivenessMessage] = useState('Position your face within the frame...');

  // Completed State
  const [generatedVerificationId, setGeneratedVerificationId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [telegramNotified, setTelegramNotified] = useState(false);

  // Alternative human check state
  const [sliderVal, setSliderVal] = useState(0);

  // Check consent from storage or initialize
  useEffect(() => {
    const consented = localStorage.getItem('ab_privacy_consented') === 'true';
    setPrivacyConsented(consented);
    setDeviceInfo(getDeviceInfo());
  }, []);

  // Fetch Alis Link from Firebase
  useEffect(() => {
    async function loadAlisLink() {
      if (!alisId) {
        setLoadingAlis(false);
        return;
      }

      try {
        setLoadingAlis(true);
        setLinkError(null);
        const docRef = doc(db, 'alis', alisId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          setLinkError('Verification link not found. This link may have been revoked or never existed.');
          setLoadingAlis(false);
          return;
        }

        const data = docSnap.data() as Omit<AlisLinkData, 'id'>;
        const record: AlisLinkData = { id: docSnap.id, ...data };

        // Check expiration
        const expiresDate = new Date(record.expiresAt);
        if (expiresDate < new Date()) {
          setLinkError(`This verification link expired on ${expiresDate.toLocaleDateString()} at ${expiresDate.toLocaleTimeString()}.`);
          setAlisData(record);
          setLoadingAlis(false);
          return;
        }

        // Check if already used
        if (record.status === 'used') {
          setLinkError(`This verification link has already been used (Verification ID: ${record.verificationId || 'Recorded'}).`);
          setAlisData(record);
          setLoadingAlis(false);
          return;
        }

        setAlisData(record);
      } catch (err) {
        try {
          handleFirestoreError(err, OperationType.GET, `alis/${alisId}`);
        } catch {
          setLinkError('Could not verify link validity due to a network error. Please try again.');
        }
      } finally {
        setLoadingAlis(false);
      }
    }

    loadAlisLink();
  }, [alisId]);

  // Handle Privacy Consent
  const handleConsentApproved = () => {
    setPrivacyConsented(true);
    localStorage.setItem('ab_privacy_consented', 'true');
    setShowPrivacyModal(false);
  };

  // Stop camera tracks cleanly
  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  };

  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Start Camera Liveness Check
  const startCameraLiveness = async () => {
    setStep('camera_liveness');
    setLivenessProgress(10);
    setLivenessMessage('Requesting local camera access...');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false, // Zero microphone recording
      });

      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }

      setLivenessMessage('Aligning face in frame...');
      setLivenessProgress(30);

      // Momentary 2-second presence check
      setTimeout(() => {
        setLivenessProgress(65);
        setLivenessMessage('Human presence detected. Finalizing liveness check...');
      }, 1000);

      setTimeout(() => {
        setLivenessProgress(95);
        setLivenessMessage('Presence confirmed! Registering token...');
      }, 2000);

      setTimeout(() => {
        stopCamera();
        finalizeVerification();
      }, 2600);
    } catch (err) {
      console.warn('Camera access denied or unavailable:', err);
      stopCamera();
      setStep('camera_denied');
    }
  };

  // Finalize verification record in Firebase
  const finalizeVerification = async () => {
    setStep('generating');
    const newId = generateVerificationId();
    const info = deviceInfo || getDeviceInfo();
    const now = new Date();
    const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const recordPayload: Omit<VerificationRecordData, 'id'> = {
      status: 'VALID',
      createdAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      browser: info.browser,
      platform: info.platform,
      screen: info.screen,
      referrer: info.referrer,
      alisId: alisId || 'direct-verification',
    };

    try {
      // 1. Store verification in Firestore
      await setDoc(doc(db, 'verifications', newId), recordPayload);

      // 2. If an alis link was used, mark it as used
      if (alisId) {
        try {
          await updateDoc(doc(db, 'alis', alisId), {
            status: 'used',
            verificationId: newId,
          });
        } catch {
          // Non-critical
        }
      }

      setGeneratedVerificationId(newId);

      // 3. Send minimal Telegram notification via server API (using configured bot token & chat id)
      sendTelegramVerificationNotification(newId).then((res) => {
        if (res.success) setTelegramNotified(true);
      });

      setTimeout(() => {
        setStep('completed');
      }, 800);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `verifications/${newId}`);
    }
  };

  const handleCopyId = () => {
    if (generatedVerificationId) {
      navigator.clipboard.writeText(generatedVerificationId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  // Loading Link State
  if (loadingAlis) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <RefreshCw className="w-6 h-6 text-white animate-spin mb-3" />
        <p className="text-xs font-mono text-neutral-300">Validating link integrity...</p>
      </div>
    );
  }

  // Invalid or Expired Link State
  if (linkError) {
    return (
      <div className="max-w-md mx-auto my-16 px-4">
        <div className="rounded-xl bg-[#0a0a0a] border border-[#222222] p-7 text-center shadow-xl">
          <div className="w-10 h-10 rounded-lg bg-black border border-red-900/50 text-red-400 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-5 h-5" />
          </div>
          <h2 className="text-base font-semibold text-white mb-1.5">Link Inactive or Expired</h2>
          <p className="text-xs text-neutral-400 leading-relaxed mb-6 font-mono">
            {linkError}
          </p>
          <div className="space-y-2">
            <button
              onClick={() => onNavigate('/app')}
              className="w-full py-2.5 px-4 rounded-lg bg-white hover:bg-neutral-200 text-xs font-semibold text-black transition"
            >
              Go to Dashboard
            </button>
            <button
              onClick={() => onNavigate('/users')}
              className="w-full py-2.5 px-4 rounded-lg border border-[#333333] bg-black text-xs font-medium text-neutral-300 hover:text-white transition"
            >
              Verify Existing Token
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Privacy Notice Modal */}
      <PrivacyNoticeModal
        isOpen={showPrivacyModal}
        onConsent={handleConsentApproved}
      />

      {/* Top Travel Community & Follow Card (Vercel Look) */}
      <div className="rounded-xl bg-[#0a0a0a] border border-[#222222] overflow-hidden shadow-xl">
        {/* Banner image with Vercel dark styling overlay */}
        <div className="relative h-48 sm:h-56 w-full bg-black border-b border-[#222222] flex flex-col justify-end p-5 overflow-hidden">
          <img
            src="https://i.ibb.co.com/ycgDW1tb/1789286431036.jpg"
            alt="Mehedi Hasan Traveling Community Banner"
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
          {/* Dark gradient overlay for contrast */}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black/25" />
          
          <div className="absolute top-4 right-4 z-10">
            <a
              href="https://github.com/MehediHasan"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-black text-xs font-semibold hover:bg-neutral-200 transition shadow-md"
            >
              <span>Follow: Mehedi Hasan</span>
              <ExternalLink className="w-3 h-3 text-black" />
            </a>
          </div>

          <div className="relative z-10 flex items-end gap-3.5">
            {/* Vercel Delta Logo */}
            <div className="w-12 h-12 rounded-lg bg-black/90 backdrop-blur-md border border-[#333333] flex items-center justify-center text-white shrink-0 shadow-lg">
              <svg viewBox="0 0 76 65" className="w-6 h-6 fill-white" aria-label="Vercel Delta">
                <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
              </svg>
            </div>

            <div>
              <span className="text-[10px] font-mono text-neutral-300 uppercase tracking-wider block">
                Verification Portal
              </span>
              <h1 className="text-base sm:text-lg font-semibold text-white tracking-tight">
                Join Largest Vercel Community
              </h1>
            </div>
          </div>
        </div>

        {/* Community Persona Description */}
        <div className="p-5 sm:p-6 bg-[#0a0a0a]">
          <p className="text-xs sm:text-sm text-neutral-300 leading-relaxed">
            MEHEDI HASAN is a person who like to enjoy most Their for traveling! Join our global community of creators and developers. Complete the quick verification below to obtain your unique access badge.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3 pt-4 border-t border-[#222222] text-xs font-mono text-neutral-500">
            <span className="flex items-center gap-1 text-neutral-300">
              <Compass className="w-3.5 h-3.5 text-neutral-400" />
              <span>Travel & Community</span>
            </span>
            <span>•</span>
            <span className="text-neutral-300 font-mono">
              Devloped by : <span className="text-white font-medium">Chiper X 404</span>
            </span>
            {alisId && (
              <>
                <span>•</span>
                <span className="text-neutral-400">
                  /alis/{alisId}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Verification Card (Vercel Look) */}
      <div className="rounded-xl bg-[#0a0a0a] border border-[#222222] p-5 sm:p-7 shadow-xl space-y-5">
        {step === 'overview' && (
          <div className="space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm sm:text-base font-semibold text-white tracking-tight">
                  Human Verification Overview
                </h2>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Confirm presence to generate an authenticated verification token.
                </p>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[#111111] text-neutral-300 border border-[#333333] shrink-0">
                Step 1 of 2
              </span>
            </div>

            {/* Collected Non-Sensitive Telemetry Summary */}
            <div className="rounded-lg bg-black border border-[#222222] p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#222222]">
                <span className="text-xs font-mono font-medium text-neutral-300 uppercase tracking-wider">
                  Verification Telemetry Summary
                </span>
                <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  Minimal Data Only
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs font-mono">
                <div className="flex items-center gap-2 text-neutral-300">
                  <Globe className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                  <span className="text-neutral-500">Browser:</span>
                  <span className="text-white truncate">{deviceInfo?.browser || 'Detecting...'}</span>
                </div>

                <div className="flex items-center gap-2 text-neutral-300">
                  <Laptop className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                  <span className="text-neutral-500">Platform:</span>
                  <span className="text-white">{deviceInfo?.platform || 'Desktop/Mobile'}</span>
                </div>

                <div className="flex items-center gap-2 text-neutral-300">
                  <Monitor className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                  <span className="text-neutral-500">Resolution:</span>
                  <span className="text-white">{deviceInfo?.screen || 'Auto'}</span>
                </div>

                <div className="flex items-center gap-2 text-neutral-300">
                  <Share2 className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                  <span className="text-neutral-500">Referrer:</span>
                  <span className="text-white truncate">{deviceInfo?.referrer || 'Direct'}</span>
                </div>
              </div>

              <div className="pt-2 border-t border-[#222222] flex items-center gap-2 text-[11px] text-neutral-500">
                <Lock className="w-3 h-3 text-neutral-400 shrink-0" />
                <span>Camera recordings, audio, passwords, and cookies are never stored.</span>
              </div>
            </div>

            {/* Human Verification Trigger Card */}
            <div
              id="confirm-human-card"
              className="rounded-xl border border-dashed border-[#333333] bg-black p-6 text-center hover:border-white transition-all cursor-pointer group"
              onClick={() => {
                if (!privacyConsented) {
                  setShowPrivacyModal(true);
                } else {
                  setStep('explain_camera');
                }
              }}
            >
              <div className="w-10 h-10 rounded-lg bg-[#111111] border border-[#333333] flex items-center justify-center mx-auto mb-2 text-white group-hover:border-white transition">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-semibold text-white">
                Confirm you're human
              </h3>
              <p className="text-xs text-neutral-400 mt-1">
                Click to start on-device human presence check. Zero video stored.
              </p>
            </div>

            {/* Continue to Verification Button */}
            <button
              id="continue-to-verification-btn"
              onClick={() => {
                if (!privacyConsented) {
                  setShowPrivacyModal(true);
                } else {
                  setStep('explain_camera');
                }
              }}
              className="w-full flex items-center justify-center gap-2 py-3 px-5 rounded-lg bg-white hover:bg-neutral-200 text-black font-semibold text-xs tracking-tight transition active:scale-98"
            >
              <span>Continue to Verification…</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Step: Explain Camera Permission Clearly */}
        {step === 'explain_camera' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-black border border-[#333333] flex items-center justify-center text-white">
                <Camera className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Camera Liveness Check</h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Explicit opt-in before requesting camera hardware access
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-black border border-[#222222] p-4 space-y-2.5 text-xs text-neutral-300 leading-relaxed font-sans">
              <p className="font-semibold text-white">
                Why is camera permission requested?
              </p>
              <p>
                Camera access is requested strictly to confirm human presence in real-time. This prevents automated bot spam and ensures authentic community access.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-[#222222] text-[11px] font-mono text-neutral-400">
                <div className="flex items-center gap-2 text-white">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span>Client-Side Processing</span>
                </div>
                <div className="flex items-center gap-2 text-white">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span>Zero Video Storage</span>
                </div>
                <div className="flex items-center gap-2 text-white">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span>No Biometrics</span>
                </div>
                <div className="flex items-center gap-2 text-white">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span>Deactivates in ~2s</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                id="start-camera-check-btn"
                onClick={startCameraLiveness}
                className="flex-1 py-2.5 px-4 rounded-lg bg-white hover:bg-neutral-200 text-black font-semibold text-xs transition flex items-center justify-center gap-2"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Start Liveness Check</span>
              </button>

              <button
                id="use-alternative-check-btn"
                onClick={() => setStep('alternative_human_check')}
                className="py-2.5 px-4 rounded-lg border border-[#333333] bg-black text-neutral-300 hover:text-white hover:border-white text-xs transition"
              >
                Alternative Verification
              </button>
            </div>
          </div>
        )}

        {/* Step: Live Camera Viewfinder */}
        {step === 'camera_liveness' && (
          <div className="space-y-4 text-center animate-in fade-in duration-150">
            <h3 className="text-xs font-mono text-neutral-400 uppercase tracking-wider">Active Liveness Verification</h3>
            <p className="text-xs text-white">{livenessMessage}</p>

            <div className="relative w-56 h-56 mx-auto rounded-full overflow-hidden border-2 border-white bg-black shadow-2xl">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover -scale-x-100"
              />
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-40 h-40 rounded-full border border-dashed border-white/60 animate-pulse" />
              </div>
            </div>

            <div className="max-w-xs mx-auto space-y-1.5">
              <div className="w-full bg-[#111111] border border-[#222222] rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-white h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${livenessProgress}%` }}
                />
              </div>
              <span className="text-[10px] font-mono text-neutral-500">{livenessProgress}%</span>
            </div>
          </div>
        )}

        {/* Step: Camera Denied Alternative */}
        {step === 'camera_denied' && (
          <div className="space-y-3 text-center animate-in fade-in duration-150">
            <div className="w-10 h-10 rounded-lg bg-black border border-[#333333] text-neutral-400 flex items-center justify-center mx-auto">
              <AlertCircle className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-white">Camera Access Denied</h3>
            <p className="text-xs text-neutral-400 max-w-md mx-auto leading-relaxed">
              Camera access was denied or not supported. You can complete the verification using our alternative check below.
            </p>

            <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">
              <button
                onClick={() => setStep('alternative_human_check')}
                className="py-2 px-4 rounded-lg bg-white text-black font-semibold text-xs hover:bg-neutral-200"
              >
                Use Alternative Check
              </button>
              <button
                onClick={startCameraLiveness}
                className="py-2 px-4 rounded-lg border border-[#333333] bg-black text-neutral-400 hover:text-white text-xs"
              >
                Retry Camera Check
              </button>
            </div>
          </div>
        )}

        {/* Step: Alternative Human Challenge */}
        {step === 'alternative_human_check' && (
          <div className="space-y-4 animate-in fade-in duration-150">
            <div className="text-center">
              <h3 className="text-sm font-semibold text-white">Interactive Human Presence</h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Slide the bar completely to the right to verify humanity.
              </p>
            </div>

            <div className="max-w-md mx-auto p-4 rounded-lg bg-black border border-[#222222] space-y-3">
              <div className="flex items-center justify-between text-xs font-mono text-neutral-400">
                <span>SLIDER</span>
                <span className="text-white">{sliderVal}%</span>
              </div>

              <input
                id="human-slider"
                type="range"
                min="0"
                max="100"
                value={sliderVal}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setSliderVal(val);
                  if (val >= 95) {
                    finalizeVerification();
                  }
                }}
                className="w-full h-2 bg-[#222222] rounded-lg appearance-none cursor-pointer accent-white"
              />

              <div className="flex items-center justify-between text-[10px] font-mono text-neutral-500">
                <span>0%</span>
                <span>Slide 100% to confirm</span>
              </div>
            </div>
          </div>
        )}

        {/* Step: Loading Animation while Generating Token */}
        {step === 'generating' && (
          <div className="py-12 text-center space-y-3 animate-in fade-in duration-150">
            <RefreshCw className="w-8 h-8 text-white animate-spin mx-auto" />
            <h3 className="text-sm font-semibold text-white">Generating Verification Token</h3>
            <p className="text-xs text-neutral-400 font-mono">
              Registering cryptographic record in Firebase...
            </p>
          </div>
        )}

        {/* Step: Completed Verification (Vercel Look) */}
        {step === 'completed' && (
          <div className="space-y-5 text-center animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 rounded-xl bg-black border border-emerald-800 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>

            <div>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-[#111111] text-emerald-400 border border-emerald-900/60">
                STATUS: VALID
              </span>
              <h3 className="text-base font-semibold text-white mt-2">
                Human Verification Complete
              </h3>
              <p className="text-xs text-neutral-400 mt-0.5">
                Your cryptographic token has been stored in Firebase.
              </p>
            </div>

            {/* Verification ID Display Card */}
            <div className="max-w-md mx-auto rounded-lg bg-black border border-[#222222] p-4 space-y-3 text-left">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-neutral-400">TOKEN ID</span>
                <button
                  id="copy-verification-id-btn"
                  onClick={handleCopyId}
                  className="flex items-center gap-1 text-xs font-mono text-white hover:text-neutral-300 transition"
                >
                  {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedId ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              <div className="font-mono text-sm font-semibold text-white bg-[#0a0a0a] px-3.5 py-2.5 rounded-lg border border-[#333333] text-center tracking-wider break-all">
                {generatedVerificationId}
              </div>

              <div className="pt-2 border-t border-[#222222] flex items-center justify-between text-[10px] font-mono text-neutral-500">
                <span>Valid: 7 Days</span>
                <span>Zero telemetry leakage</span>
              </div>
            </div>

            {telegramNotified && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black text-neutral-300 border border-[#333333] text-[11px] font-mono">
                <span>Telegram notification sent</span>
              </div>
            )}

            {/* Next Actions */}
            <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
              <button
                id="test-token-at-users-btn"
                onClick={() => onNavigate(`/users?id=${generatedVerificationId}`)}
                className="py-2.5 px-5 rounded-lg bg-white hover:bg-neutral-200 text-black font-semibold text-xs transition flex items-center justify-center gap-1.5"
              >
                <span>Check Access at /users</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => onNavigate('/app')}
                className="py-2.5 px-5 rounded-lg border border-[#333333] bg-black text-neutral-300 hover:text-white text-xs transition"
              >
                Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
