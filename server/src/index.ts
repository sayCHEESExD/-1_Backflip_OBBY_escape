import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ROOM_NAME } from '@obby/shared';
import { serverConfig } from './config/serverConfig.js';
import { GorgeRoom } from './rooms/GorgeRoom.js';
import { logger } from './util/logger.js';

const SCOPE = 'server';

const gameServer = new Server({
  transport: new WebSocketTransport(),
  greet: false,
});

gameServer.define(ROOM_NAME, GorgeRoom);

gameServer
  .listen(serverConfig.port, serverConfig.host)
  .then(() => {
    logger.info(
      SCOPE,
      `listening on ws://${serverConfig.host}:${serverConfig.port} room="${ROOM_NAME}"`,
    );
  })
  .catch((error: unknown) => {
    logger.error(SCOPE, 'failed to start', error);
    process.exit(1);
  });

const shutdown = (signal: string): void => {
  logger.info(SCOPE, `received ${signal}, shutting down`);
  void gameServer.gracefullyShutdown().finally(() => process.exit(0));
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
