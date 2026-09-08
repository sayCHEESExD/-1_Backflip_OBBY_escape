import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ROOM_NAME } from '@obby/shared';
import { serverConfig } from './config/serverConfig.js';
import { createHttpServer } from './httpServer.js';
import { BuxFulfilmentService } from './progression/BuxFulfilmentService.js';
import { profileStore } from './progression/ProfileStore.js';
import { GorgeRoom } from './rooms/GorgeRoom.js';
import { logger } from './util/logger.js';

const SCOPE = 'server';

// Read persisted profiles BEFORE the server listens, so the first player to
// join already finds their progression in memory.
profileStore.open();

// Colyseus attaches to OUR http server rather than making its own, so the
// same port answers both the WebSocket upgrade and a plain /health probe -
// which is what a managed host polls to decide the service is up.
// The one place a Bux purchase becomes Wins. It lives beside the store rather
// than inside a room because a purchase can land while the buyer is offline.
const buxFulfilment = new BuxFulfilmentService(profileStore, serverConfig.gameSlug);

const gameServer = new Server({
  transport: new WebSocketTransport({ server: createHttpServer(buxFulfilment) }),
  greet: false,
});

gameServer.define(ROOM_NAME, GorgeRoom);

gameServer
  .listen(serverConfig.port, serverConfig.host)
  .then(() => {
    logger.info(
      SCOPE,
      `listening on ${serverConfig.host}:${serverConfig.port} ` +
        `room="${ROOM_NAME}" health=/health ` +
        `bux=${serverConfig.bloxityWebhookSecret ? 'configured' : 'DISABLED (no secret)'}`,
    );
  })
  .catch((error: unknown) => {
    logger.error(SCOPE, 'failed to start', error);
    process.exit(1);
  });

const shutdown = (signal: string): void => {
  logger.info(SCOPE, `received ${signal}, shutting down`);
  void gameServer
    .gracefullyShutdown()
    .finally(() => {
      // Disconnecting clients saves their profiles; this makes the pending
      // debounced write durable before the process goes away.
      profileStore.flush();
      logger.info(SCOPE, `profiles persisted (${profileStore.size})`);
      process.exit(0);
    });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// A last resort for any exit path that skipped the handler above.
process.on('exit', () => profileStore.flush());
