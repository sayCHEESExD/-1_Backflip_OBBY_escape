import { resolve } from 'node:path';
import { DEFAULT_SERVER_PORT, SERVER_TICK_RATE } from '@obby/shared';

/** Runtime server configuration, overridable by environment variables. */
export interface ServerConfig {
  readonly port: number;
  readonly host: string;
  readonly tickRate: number;
  /** Milliseconds between state patches sent to clients. */
  readonly patchRateMs: number;
  /** Directory holding persisted player profiles. */
  readonly dataDir: string;
}

const int = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const serverConfig: ServerConfig = {
  port: int(process.env['PORT'], DEFAULT_SERVER_PORT),
  host: process.env['HOST'] ?? '0.0.0.0',
  tickRate: SERVER_TICK_RATE,
  patchRateMs: 1000 / SERVER_TICK_RATE,
  // Relative to the server package, which is the working directory for both
  // `npm run dev` and `npm start`, so a restart finds the same file either way.
  dataDir: resolve(process.env['OBBY_DATA_DIR'] ?? 'data'),
};
