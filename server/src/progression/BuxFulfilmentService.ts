import { buxProductForSku, creditWins } from '@obby/shared';
import { logger } from '../util/logger.js';
import type { ProfileStore } from './ProfileStore.js';

const SCOPE = 'BuxFulfilment';

/** The fields of a Bloxity purchase webhook this game actually uses. */
export interface BuxWebhookPayload {
  transactionId?: unknown;
  userId?: unknown;
  username?: unknown;
  gameSlug?: unknown;
  sku?: unknown;
  productName?: unknown;
  productPrice?: unknown;
  metadata?: unknown;
  timestamp?: unknown;
}

export type FulfilmentOutcome =
  | { status: 'granted'; playerId: string; wins: number; balance: number }
  | { status: 'duplicate'; playerId: string }
  | { status: 'rejected'; reason: string };

/**
 * How many transaction ids to remember for duplicate detection.
 *
 * The portal retries a webhook that does not answer 2xx, and a retry that
 * arrived after a slow-but-successful first delivery would otherwise pay out
 * twice. A few thousand ids is far more than any plausible retry window and
 * costs nothing to hold.
 */
const SEEN_LIMIT = 4096;

/**
 * The ONE place a Bux purchase turns into game currency.
 *
 * A purchase is a second source of Wins alongside `TrophyService`, and the
 * reason it is a whole service rather than a few lines in the HTTP handler is
 * the same reason `Wallet.spend` is the only place Wins leave: a currency with
 * two uncontrolled credit paths is a wallet that eventually disagrees with
 * itself. Everything a grant needs to be safe happens here and only here -
 * the catalog lookup, the duplicate check, the overflow guard and the write.
 *
 * SERVER-AUTHORITATIVE, and deliberately not reachable from the game client.
 * It is driven by Bloxity's server-to-server webhook, never by a message from
 * a player, so a client cannot claim a purchase it did not make. The client's
 * part is to ask the portal to charge; what that is worth is decided here from
 * the shared catalog, not from anything the buyer sent.
 */
export class BuxFulfilmentService {
  private readonly profiles: ProfileStore;
  private readonly gameSlug: string;
  private readonly seen = new Set<string>();

  constructor(profiles: ProfileStore, gameSlug: string) {
    this.profiles = profiles;
    this.gameSlug = gameSlug;
  }

  /**
   * Credit a confirmed purchase.
   *
   * Returns a rejection rather than throwing, because the caller has to turn
   * the answer into a status code: a 2xx tells Bloxity the sale stands, and
   * anything else refunds the player's Bux. A duplicate is therefore a
   * SUCCESS - the first delivery already paid out, and refunding it because
   * the retry found nothing to do would take back Wins that were granted.
   */
  fulfil(payload: BuxWebhookPayload): FulfilmentOutcome {
    const sku = asString(payload.sku);
    const transactionId = asString(payload.transactionId);
    const slug = asString(payload.gameSlug);

    if (!transactionId) return { status: 'rejected', reason: 'missing transactionId' };
    if (slug && slug !== this.gameSlug) {
      return { status: 'rejected', reason: `wrong gameSlug "${slug}"` };
    }

    const product = buxProductForSku(sku);
    if (!product) return { status: 'rejected', reason: `unknown sku "${sku}"` };

    // The game's own profile key, sent as purchase metadata by the client.
    // Without it there is nobody to credit - and guessing from the Bloxity
    // user id would credit a profile that may not be the one playing.
    const metadata = isRecord(payload.metadata) ? payload.metadata : {};
    const playerId = asString(metadata['playerId']);
    if (!playerId) return { status: 'rejected', reason: 'missing metadata.playerId' };

    if (this.seen.has(transactionId)) {
      logger.info(SCOPE, `duplicate webhook tx=${transactionId} - already granted`);
      return { status: 'duplicate', playerId };
    }

    const balance = this.profiles.creditWins(playerId, product.wins);
    this.remember(transactionId);

    logger.info(
      SCOPE,
      `granted sku=${product.sku} wins=${product.wins} playerId=${playerId} ` +
        `balance=${balance} tx=${transactionId}`,
    );
    return { status: 'granted', playerId, wins: product.wins, balance };
  }

  private remember(transactionId: string): void {
    this.seen.add(transactionId);
    if (this.seen.size <= SEEN_LIMIT) return;
    // Oldest first: a Set iterates in insertion order.
    const oldest = this.seen.values().next();
    if (!oldest.done) this.seen.delete(oldest.value);
  }
}

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export { creditWins };
