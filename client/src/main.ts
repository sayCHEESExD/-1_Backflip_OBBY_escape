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
  try {
    await game.connect();
  } catch {
    // Rendering and local movement must still work with the server down, so a
    // failed join is reported but never blocks the game from starting.
    setBootStatus('Server unavailable - running offline.');
  }

  game.start();
  const loop = new GameLoop((delta, now) => game.update(delta, now));
  loop.start();

  if (clientConfig.debug) {
    // Dev-only handle: lets the game be stepped by hand from the console or an
    // automated browser check, where requestAnimationFrame may be throttled.
    (window as Window & { __obby?: DebugHandle }).__obby = { game, loop };
  }

  if (boot) boot.hidden = true;
  logger.info(SCOPE, 'running');
};

/** Shape of the dev-only `window.__obby` handle. */
interface DebugHandle {
  game: Game;
  loop: GameLoop;
}

main().catch(showBootError);
