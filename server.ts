import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

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

// Minimal notification endpoint keeping secrets strictly server-side
app.post('/api/notify-telegram', async (req, res) => {
  try {
    const { verificationId, time } = req.body;

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
    const messageText = `New verification completed\nID: ${verificationId}\nStatus: VALID\nTime: ${formattedTime}`;

    const tgResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageText,
      }),
    });

    const tgResult = (await tgResponse.json()) as { ok: boolean; description?: string };

    if (tgResult.ok) {
      res.json({ success: true, delivered: true });
    } else {
      console.warn('Telegram API response error:', tgResult.description);
      res.json({ success: false, delivered: false, error: tgResult.description });
    }
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

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
