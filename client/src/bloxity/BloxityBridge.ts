import { logger } from '../util/logger.js';
import { AvatarAppearance } from './AvatarAppearance.js';
import { bloxity } from './BloxitySdk.js';
import { BloxityPanel } from './BloxityPanel.js';
import { SETTING_KEYS, settingBool, settingNumber } from './bloxityConfig.js';
import type { LegionUser, Unsubscribe } from './sdkTypes.js';

const SCOPE = 'BloxityBridge';

/**
 * What the game exposes to the Bloxity layer.
 *
 * A narrow interface rather than the `Game` object: the bridge is wiring, and
 * wiring that could reach into the whole composition root would end up holding
 * gameplay logic. Everything here is a setting the portal can move or an
 * action it can ask for - nothing reads game state back.
 */
export interface BloxityHost {
  /** Master volume, 0..1. */
  setMasterVolume(level: number): void;
  /** Music volume, 0..1, independent of the master. */
  setMusicVolume(level: number): void;
  /** 'Low' | 'Medium' | 'High' | 'Ultra'. */
  setGraphicsQuality(level: string): void;
  setShowFps(visible: boolean): void;
  /** Multiplier on the game's own mouse sensitivity. */
  setCameraSensitivity(scale: number): void;
  /** Opacity for the game's own panel backdrops, 0..1. */
  setPanelOpacity(opacity: number): void;
  /** Ask the game to put the player back at spawn. */
  respawn(): void;
  /** The local character, once it exists, for the avatar layer to dress. */
  getCharacterForAvatar(): ConstructorParameters<typeof AvatarAppearance>[0] | null;
}

/**
 * Everything this game does with Bloxity, in one place.
 *
 * ONE `onUserChanged` subscription is the source of truth for identity: the
 * panel, the friends list, the avatar and the Bux balance all hang off it
 * rather than each asking separately, so they cannot disagree about who is
 * playing. Nothing here caches the user - the callback is a signal to re-read,
 * not a copy to keep.
 *
 * The bridge owns no gameplay rules. Portal settings are forwarded to the
 * subsystem that owns each one, portal events are forwarded as requests, and
 * the game's own authority is untouched: a Bux purchase asks the portal to
 * charge and the game SERVER to credit, and this file never grants anything.
 */
export class BloxityBridge {
  private readonly host: BloxityHost;
  private readonly panel: BloxityPanel;
  private readonly chat: ChatFeed;
  private readonly subscriptions: Unsubscribe[] = [];

  private avatar: AvatarAppearance | null = null;
  private chatEnabled = true;
  private started = false;

  constructor(container: HTMLElement, host: BloxityHost, menuKey: string) {
    this.host = host;
    this.panel = new BloxityPanel(container, { menuKey });
    this.chat = new ChatFeed(container);
  }

  /** The panel, so the composition root can bind its keyboard shortcut. */
  get menuPanel(): BloxityPanel {
    return this.panel;
  }

  /**
   * Subscribe to everything. Call once, after the world and player exist.
   *
   * Deliberately tolerant of the SDK being absent: every subscription below
   * degrades to a no-op, so this runs unconditionally and the game has exactly
   * one code path whether or not the portal is there.
   */
  start(): void {
    if (this.started) return;
    this.started = true;

    this.subscribeAuth();
    this.subscribeAvatar();
    this.subscribeSettings();
    this.subscribePlayerEvents();

    // Apply everything the portal already knows, now that the listeners exist.
    bloxity.triggerAllSettings();
    logger.info(SCOPE, `wired (sdk ${bloxity.available ? 'present' : 'absent'})`);
  }

  /**
   * The name to introduce this player by.
   *
   * Guests are named too, so there is always something better than an empty
   * string - which the SDK would ignore anyway.
   */
  get playerName(): string {
    const user = bloxity.getUser();
    if (user) return user.displayName || user.username;
    const guest = bloxity.getGuest();
    return guest?.displayName || guest?.username || '';
  }

  /** Announce the joinable room so a friend's invite lands in the right one. */
  setRoom(roomId: string): void {
    bloxity.updateRoom(roomId);
  }

  /** A remote player arrived while we were already here. */
  playerJoined(name: string): void {
    bloxity.playerJoined(name);
  }

  /** A remote player was already here when we joined. */
  playerInRoom(name: string): void {
    bloxity.playerInRoom(name);
  }

  dispose(): void {
    for (const unsubscribe of this.subscriptions) unsubscribe();
    this.subscriptions.length = 0;
    this.avatar?.dispose();
    this.avatar = null;
    this.panel.dispose();
    this.chat.dispose();
    bloxity.gameplayEnd();
  }

  // --- subscriptions ----------------------------------------------------

  private subscribeAuth(): void {
    this.subscriptions.push(
      bloxity.onUserChanged((user: LegionUser | null) => {
        logger.info(
          SCOPE,
          user ? `signed in as @${user.username}` : 'signed out (playing as guest)',
        );
        // The panel re-reads the user itself; this only tells it when to.
        this.panel.refresh();
        // Identity decides the avatar, the friends list and the balance, so
        // they are all refreshed from this one place rather than separately.
        this.applyAvatar();
      }),
    );
  }

  private subscribeAvatar(): void {
    this.subscriptions.push(
      bloxity.onAvatarChanged(() => this.applyAvatar()),
      bloxity.onProportionsChanged(() => this.applyAvatar()),
    );
  }

  private subscribeSettings(): void {
    for (const key of SETTING_KEYS) {
      this.subscriptions.push(
        bloxity.listenSetting(key, (value) => this.applySetting(key, value)),
      );
    }
  }

  private subscribePlayerEvents(): void {
    this.subscriptions.push(
      bloxity.onPlayerEvent((event, data) => {
        switch (event) {
          case 'respawn_request':
            // A request, not a teleport. It goes through the game's own
            // respawn path so the server still owns where the player lands.
            this.host.respawn();
            return;
          case 'chat_message_sent':
            if (this.chatEnabled && typeof data === 'string') this.chat.push(data);
            return;
          case 'pointer_lock_changed':
            // Informational: the portal reporting what the browser did. The
            // game's own pointer-lock owner reacts to `pointerlockchange`
            // directly, so acting on this too would fight it.
            return;
          default:
            return;
        }
      }),
      // Older SDK builds report the lock here instead of through onEvent.
      bloxity.onPointerLockChanged(() => undefined),
    );
  }

  // --- settings ---------------------------------------------------------

  /** Route one portal setting to whichever subsystem owns it. */
  private applySetting(key: string, value: string): void {
    switch (key) {
      case 'master_volume':
        this.host.setMasterVolume(settingNumber(value, 80) / 100);
        return;
      case 'music_volume':
        this.host.setMusicVolume(settingNumber(value, 80) / 100);
        return;
      case 'graphics_quality':
        this.host.setGraphicsQuality(value);
        return;
      case 'show_fps':
        this.host.setShowFps(settingBool(value));
        return;
      case 'camera_sensitivity':
        this.host.setCameraSensitivity(settingNumber(value, 1));
        return;
      case 'enable_chat':
        this.chatEnabled = settingBool(value, true);
        if (!this.chatEnabled) this.chat.clear();
        return;
      case 'fullscreen':
        // The portal owns the frame this game is in, so fullscreen is asked
        // for rather than taken - the Fullscreen API would only ever expand
        // the iframe's own document.
        if (settingBool(value)) bloxity.requestFullscreen();
        else bloxity.exitFullscreen();
        return;
      case 'background_transparency':
        // Applied to this game's own panel backdrops, NOT to the WebGL clear
        // colour: the canvas is created without an alpha buffer (the sky is
        // opaque art, not a background to see through), and turning that on
        // would be a rendering change rather than a setting.
        this.host.setPanelOpacity(settingNumber(value, 0.9));
        return;
      default:
        return;
    }
  }

  // --- avatar -----------------------------------------------------------

  /** Push the current equipped items and proportions onto the character. */
  private applyAvatar(): void {
    const character = this.host.getCharacterForAvatar();
    if (!character) return;
    this.avatar ??= new AvatarAppearance(character);
    this.avatar.applyEquipped(bloxity.getEquipped());
    this.avatar.applyProportions(bloxity.getProportions());
  }
}

/**
 * Portal chat, shown as a short stack of lines above the HUD.
 *
 * This game has no chat of its own - messages are composed in the portal and
 * arrive as an event - so all that is needed is somewhere to read them. Lines
 * expire on their own so the feed can never grow over the play area.
 */
class ChatFeed {
  private readonly root: HTMLElement;
  private readonly timers = new Set<number>();

  constructor(parent: HTMLElement) {
    injectChatStyles();
    this.root = document.createElement('div');
    this.root.className = 'obby-chat';
    parent.appendChild(this.root);
  }

  push(message: string): void {
    const line = document.createElement('div');
    line.className = 'obby-chat__line';
    line.textContent = message;
    this.root.appendChild(line);

    const timer = window.setTimeout(() => {
      line.remove();
      this.timers.delete(timer);
    }, 9000);
    this.timers.add(timer);

    // Four lines is as much as can sit above the HUD without covering it.
    while (this.root.childElementCount > 4) this.root.firstElementChild?.remove();
  }

  clear(): void {
    this.root.replaceChildren();
  }

  dispose(): void {
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers.clear();
    this.root.remove();
  }
}

let chatStylesInjected = false;

const injectChatStyles = (): void => {
  if (chatStylesInjected) return;
  chatStylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
.obby-chat {
  position: fixed;
  left: calc(96px * var(--obby-ui-scale, 1));
  bottom: calc(74px * var(--obby-ui-scale, 1));
  display: grid;
  gap: 4px;
  max-width: min(420px, 46vw);
  pointer-events: none;
  z-index: 23;
}
.obby-chat__line {
  padding: 5px 9px;
  border-radius: 8px;
  background: rgba(8, 14, 26, 0.68);
  color: #e8f0ff;
  font: 700 13px/1.35 system-ui, "Segoe UI", Roboto, sans-serif;
  overflow-wrap: anywhere;
}
body.obby-touch-mode .obby-chat { display: none; }
`;
  document.head.appendChild(style);
};
