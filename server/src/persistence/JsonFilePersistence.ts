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
import { sanitiseProfile, type PersistenceAdapter, type StoredProfile } from './PersistenceAdapter.js';

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

/**
 * Profiles in a single JSON file on the server's disk - LOCAL DEVELOPMENT.
 * On Bloxity Hosting the disk does not survive a deploy; `MONGODB_URI` is set
 * there and `MongoPersistence` is used instead.
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
  private loaded = false;

  constructor(directory: string, fileName = 'profiles.json') {
    this.path = join(directory, fileName);
  }

  open(): Promise<ReadonlyMap<string, StoredProfile>> {
    // This process is the file's only writer, so after the first read its own
    // map IS the freshest copy. Re-reading (the scoreboard refresh calls this
    // every minute) would throw away saves still waiting for the debounce -
    // a trophy collected just before a disconnect, for one.
    if (this.loaded) return Promise.resolve(this.cache);
    this.loaded = true;
    this.cache.clear();

    if (!existsSync(this.path)) {
      logger.info(SCOPE, `no save at ${this.path} - starting empty`);
      return Promise.resolve(this.cache);
    }

    try {
      const parsed = JSON.parse(readFileSync(this.path, 'utf8')) as Partial<ProfileFile>;
      if (parsed?.version !== FILE_VERSION) {
        throw new Error(`save version ${String(parsed?.version)} != ${FILE_VERSION}`);
      }
      for (const [playerId, raw] of Object.entries(parsed.profiles ?? {})) {
        if (!playerId) continue;
        this.cache.set(playerId, sanitiseProfile(raw));
      }
      logger.info(SCOPE, `loaded ${this.cache.size} profiles from ${this.path}`);
    } catch (error: unknown) {
      // An unreadable save is MOVED ASIDE, never overwritten: the next write
      // would otherwise replace every player's progress with an empty file.
      const aside = `${this.path}.unreadable-${Date.now()}`;
      try {
        renameSync(this.path, aside);
      } catch {
        // Nothing more to do; the error below is what matters.
      }
      logger.error(SCOPE, `could not read ${this.path} - kept it as ${aside}, starting empty`, error);
      this.cache.clear();
    }

    return Promise.resolve(this.cache);
  }

  /** One process owns the file, so its own map is always the freshest copy. */
  get(playerId: string): Promise<StoredProfile | null> {
    const profile = this.cache.get(playerId);
    return Promise.resolve(profile ? { ...profile } : null);
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

  flush(): Promise<void> {
    this.flushSync();
    return Promise.resolve();
  }

  flushSync(): void {
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
