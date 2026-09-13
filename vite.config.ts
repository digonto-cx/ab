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

        if (req.url === '/api/notify-telegram' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const data = JSON.parse(body || '{}');
              const {verificationId, time} = data;

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

              // Minimal message format strictly as specified:
              // “New verification completed
              // ID: XXXXX
              // Status: VALID
              // Time: XXXXX”
              const formattedTime = time || new Date().toISOString();
              const messageText = `New verification completed\nID: ${verificationId}\nStatus: VALID\nTime: ${formattedTime}`;

              const tgResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                  chat_id: chatId,
                  text: messageText,
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
