import express from 'express';
import type { Request, Response } from 'express';
import http from 'http';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createApiMiddleware } from './apiApp.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = createApiMiddleware();
  const server = http.createServer(app);

  // In AI Studio (both dev and Cloud Run production), Nginx listens on 8080 and proxies to DEFAULT_APP_PORT (3000).
  // The Node.js application must always bind to port 3000.
  const PORT = Number(process.env.DEFAULT_APP_PORT) || 3000;

  const distPath = path.resolve(__dirname, 'dist');
  const distIndex = path.resolve(distPath, 'index.html');
  const isProd = process.env.NODE_ENV === 'production' || (fs.existsSync(distIndex) && process.env.NODE_ENV !== 'development');

  // --- Vite / Static Files Mounting ---
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(distIndex);
    });
  }

  // Accept vite-hmr WebSocket upgrade cleanly when HMR is disabled so /@vite/client never throws "WebSocket closed without opened"
  server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key || typeof key !== 'string') {
      socket.destroy();
      return;
    }
    const protocolHeader = req.headers['sec-websocket-protocol'];
    const acceptKey = crypto
      .createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');

    const responseHeaders = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`,
    ];
    if (protocolHeader) {
      const firstProto = String(protocolHeader).split(',')[0].trim();
      if (firstProto) {
        responseHeaders.push(`Sec-WebSocket-Protocol: ${firstProto}`);
      }
    }
    socket.on('error', () => {});
    try {
      socket.write(responseHeaders.join('\r\n') + '\r\n\r\n');
    } catch {
      socket.destroy();
    }
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`ImpulsaNet Full-Stack Server running on port ${PORT} (mode: ${isProd ? 'production' : 'development'})`);
  });
}

startServer();
