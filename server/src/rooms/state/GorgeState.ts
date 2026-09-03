import { MapSchema, Schema, type } from '@colyseus/schema';
import { PlayerState } from './PlayerState.js';

/** Root replicated state for a single gorge instance. */
export class GorgeState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();

  /** Server uptime in seconds, useful for client-side clock sanity checks. */
  @type('float32') elapsed = 0;
}
