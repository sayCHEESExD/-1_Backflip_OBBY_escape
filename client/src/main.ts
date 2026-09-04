import { clientConfig } from './config/clientConfig.js';
import { Game } from './core/Game.js';
import { GameLoop } from './core/GameLoop.js';
import { logger } from './util/logger.js';

const SCOPE = 'main';

const boot = document.getElementById('boot');
const bootStatus = document.getElementById('boot-status');

const setBootStatus = (text: string): void => {
  if (bootStatus) bootStatus.textContent = text;
};

const showBootError = (error: unknown): void => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(SCOPE, message, error);
  if (!bootStatus) return;
  bootStatus.className = 'err';
  bootStatus.textContent = `Failed to start:\n${message}`;
};

const main = async (): Promise<void> => {
  const container = document.getElementById('app');
  if (!container) throw new Error('#app container missing from index.html');

  const game = new Game(container);

  setBootStatus('Loading player model…');
  await game.initialise();

  setBootStatus('Connecting to server…');
  let online = true;
  try {
    await game.connect();
  } catch (error) {
    // Rendering and local movement must still work with the server down, so a
    // failed join is reported but never blocks the game from starting.
    online = false;
    showOfflineNotice(error);
  }

  game.start();
  const loop = new GameLoop((delta, now) => game.update(delta, now));
  loop.start();

  if (clientConfig.debug) {
    // Dev-only handle: lets the game be stepped by hand from the console or an
    // automated browser check, where requestAnimationFrame may be throttled.
    (window as Window & { __obby?: DebugHandle }).__obby = { game, loop };
  }

  // Hidden only on a REAL join. Progression, Wins, levels, shops and rebirth
  // are all server-authoritative, so an offline session renders and moves but
  // can never progress - hiding that failure is what makes a broken deployment
  // look like broken gameplay.
  if (boot && online) boot.hidden = true;
  logger.info(SCOPE, 'running');
};

/**
 * Turn the boot panel into a persistent corner notice.
 *
 * The game stays playable - that is deliberate - but the player is told the
 * session is not connected, because every system they are about to find dead
 * is server-owned. Without this the only connection indicator is the debug
 * overlay, which is compiled out of a production build.
 */
const showOfflineNotice = (error: unknown): void => {
  const detail = error instanceof Error ? error.message : String(error);
  logger.error(SCOPE, `offline: ${detail}`);
  if (bootStatus) {
    bootStatus.className = 'err';
    bootStatus.textContent =
      `Not connected to the game server (${clientConfig.serverUrl}).
` +
      'Playing offline: Wins, levels and shops are server-owned and will not ' +
      'progress. Reload to try again.';
  }
  boot?.classList.add('notice');
};

/** Shape of the dev-only `window.__obby` handle. */
interface DebugHandle {
  game: Game;
  loop: GameLoop;
}

main().catch(showBootError);
