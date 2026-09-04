import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { logger } from '../util/logger.js';
import type { PersistenceAdapter, StoredProfile } from './PersistenceAdapter.js';

const SCOPE = 'JsonFilePersistence';

/**
 * Bumped whenever the stored shape changes. A file written by a newer or
 * unrecognised version is ignored rather than misread.
 */
const FILE_VERSION = 1;

/** How long writes are coalesced before hitting the disk. */
const WRITE_DEBOUNCE_MS = 750;

interface ProfileFile {
  version: number;
  profiles: Record<string, StoredProfile>;
}

const finite = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/**
 * Profiles in a single JSON file on the server's disk.
 *
 * Enough to survive a restart, deploy or crash without standing up a database,
 * and small enough to read and hand-edit while the game is still being built.
 *
 * Writes are DEBOUNCED and ATOMIC: progression changes on almost every input,
 * so saving synchronously per change would put file I/O in the movement path;
 * instead the newest snapshot is written to a temporary file and renamed over
 * the real one, so a crash mid-write leaves the previous save intact rather
 * than a truncated file.
 */
export class JsonFilePersistence implements PersistenceAdapter {
  readonly name = 'json-file';

  private readonly path: string;
  private readonly cache = new Map<string, StoredProfile>();
  private timer: NodeJS.Timeout | null = null;
  private dirty = false;

  constructor(directory: string, fileName = 'profiles.json') {
    this.path = join(directory, fileName);
  }

  open(): ReadonlyMap<string, StoredProfile> {
    this.cache.clear();

    if (!existsSync(this.path)) {
      logger.info(SCOPE, `no save at ${this.path} - starting empty`);
      return this.cache;
    }

    try {
      const parsed = JSON.parse(readFileSync(this.path, 'utf8')) as Partial<ProfileFile>;
      if (parsed?.version !== FILE_VERSION) {
        logger.warn(
          SCOPE,
          `save version ${String(parsed?.version)} != ${FILE_VERSION}, ignoring`,
        );
        return this.cache;
      }
      for (const [playerId, raw] of Object.entries(parsed.profiles ?? {})) {
        if (!playerId) continue;
        this.cache.set(playerId, {
          totalSpeed: Math.max(0, finite(raw?.totalSpeed, 0)),
          wins: Math.max(0, Math.floor(finite(raw?.wins, 0))),
          rebirths: Math.max(0, Math.floor(finite(raw?.rebirths, 0))),
          ownedBoots: Math.max(0, Math.floor(finite(raw?.ownedBoots, 1))),
          // Absent in saves written before cosmetics existed; defaulting here
          // rather than bumping the file version is what lets those saves keep
          // loading instead of being discarded.
          ownedTrails: Math.max(0, Math.floor(finite(raw?.ownedTrails, 0))),
          trailSlot: Math.max(0, Math.floor(finite(raw?.trailSlot, 0))),
          ownedAuras: Math.max(0, Math.floor(finite(raw?.ownedAuras, 0))),
          auraSlot: Math.max(0, Math.floor(finite(raw?.auraSlot, 0))),
        });
      }
      logger.info(SCOPE, `loaded ${this.cache.size} profiles from ${this.path}`);
    } catch (error: unknown) {
      // A corrupt save must not stop the server: the game starts fresh and the
      // next write replaces the bad file.
      logger.error(SCOPE, `could not read ${this.path}, starting empty`, error);
      this.cache.clear();
    }

    return this.cache;
  }

  put(playerId: string, profile: StoredProfile): void {
    if (!playerId) return;
    this.cache.set(playerId, { ...profile });
    this.dirty = true;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.write();
    }, WRITE_DEBOUNCE_MS);
    // A pending save must never hold the process open by itself.
    this.timer.unref?.();
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.write();
  }

  /** Atomic replace: write a sibling temp file, fsync it, then rename over. */
  private write(): void {
    if (!this.dirty) return;

    const payload: ProfileFile = {
      version: FILE_VERSION,
      profiles: Object.fromEntries(this.cache),
    };

    const temporary = `${this.path}.tmp`;
    try {
      mkdirSync(dirname(this.path), { recursive: true });

      // The handle must be opened for WRITING: fsync on a read-only handle is
      // rejected outright on Windows (EPERM), which would leave the temporary
      // file behind and the real save never replaced.
      const handle = openSync(temporary, 'w');
      try {
        writeFileSync(handle, JSON.stringify(payload, null, 2), 'utf8');
        // Rename is only atomic once the bytes are on the device - but a
        // filesystem that refuses fsync must not cost us the save entirely.
        try {
          fsyncSync(handle);
        } catch {
          // Fall through to the rename; durability degrades, the save does not.
        }
      } finally {
        closeSync(handle);
      }

      renameSync(temporary, this.path);
      this.dirty = false;
    } catch (error: unknown) {
      logger.error(SCOPE, `failed to write ${this.path}`, error);
    }
  }
}
