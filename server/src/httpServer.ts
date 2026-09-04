import { createServer, type Server as HttpServer } from 'node:http';
import { ROOM_NAME } from '@obby/shared';

/**
 * The HTTP server Colyseus is attached to.
 *
 * Colyseus would happily make its own, but a managed host needs a plain HTTP
 * endpoint it can poll to decide whether the service is alive - a WebSocket
 * port answers nothing useful to a health check.
 *
 * Handing Colyseus a server that ALREADY has a request listener is safe by
 * design: `attachMatchMakingRoutes` keeps the existing listeners and calls
 * them for any URL that is not a matchmaking route. So `/health` is answered
 * here and `/matchmake/*` still reaches Colyseus untouched.
 */
export const createHttpServer = (): HttpServer =>
  createServer((req, res) => {
    if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
      const body = JSON.stringify({
        status: 'ok',
        room: ROOM_NAME,
        uptimeSeconds: Math.round(process.uptime()),
      });
      res.writeHead(200, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      });
      res.end(body);
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });
