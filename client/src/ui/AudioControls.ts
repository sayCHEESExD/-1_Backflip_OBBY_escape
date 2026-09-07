import type { AudioEngine } from '../audio/AudioEngine.js';

/**
 * The mute toggle and volume slider, in the left rail.
 *
 * A view over `AudioEngine` and nothing more - it never touches the audio
 * graph, and the engine tells it when to repaint so the two can never show
 * different states.
 */
export class AudioControls {
  private readonly root: HTMLDivElement;
  private readonly button: HTMLButtonElement;
  private readonly slider: HTMLInputElement;
  private readonly audio: AudioEngine;

  constructor(parent: HTMLElement, audio: AudioEngine, top: number) {
    injectStyles();
    this.audio = audio;

    this.root = document.createElement('div');
    this.root.className = 'obby-audio';
    // See CosmeticShop: a custom property so the mobile stylesheet can move it.
    this.root.style.setProperty('--obby-rail-top', `${top}px`);

    this.button = document.createElement('button');
    this.button.className = 'obby-audio__btn';
    this.button.type = 'button';
    this.button.addEventListener('click', () => audio.toggleMuted());

    this.slider = document.createElement('input');
    this.slider.className = 'obby-audio__slider';
    this.slider.type = 'range';
    this.slider.min = '0';
    this.slider.max = '100';
    this.slider.step = '1';
    this.slider.addEventListener('input', () => {
      audio.setVolume(Number(this.slider.value) / 100);
      // Dragging the slider is a clear signal the player wants sound back.
      if (audio.muted && Number(this.slider.value) > 0) audio.setMuted(false);
    });

    this.root.append(this.button, this.slider);
    parent.appendChild(this.root);

    audio.onChange(() => this.render());
    this.render();
  }

  dispose(): void {
    this.root.remove();
  }

  private render(): void {
    this.button.textContent = this.audio.muted ? '🔇' : '🔊';
    this.button.title = this.audio.muted ? 'Unmute' : 'Mute';
    this.root.classList.toggle('obby-audio--muted', this.audio.muted);
    const percent = Math.round(this.audio.volume * 100);
    if (this.slider.value !== String(percent)) this.slider.value = String(percent);
  }
}

let stylesInjected = false;

const injectStyles = (): void => {
  if (stylesInjected) return;
  stylesInjected = true;

  const style = document.createElement('style');
  style.textContent = `
.obby-audio {
  position: fixed;
  left: calc(12px * var(--obby-ui-scale, 1));
  top: calc(var(--obby-rail-top, 298px) * var(--obby-ui-scale, 1));
  width: calc(68px * var(--obby-ui-scale, 1));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(5px * var(--obby-ui-scale, 1));
  z-index: 21;
}
/* Same rail tile as the other launchers - see CosmeticShop for the pattern. */
.obby-audio__btn {
  width: calc(68px * var(--obby-ui-scale, 1));
  height: calc(44px * var(--obby-ui-scale, 1));
  padding: 0;
  border: calc(3px * var(--obby-ui-scale, 1)) solid #ffffff;
  border-radius: calc(13px * var(--obby-ui-scale, 1));
  background-color: #2f7fd0;
  background-image: linear-gradient(180deg, rgba(255, 255, 255, 0.3), rgba(0, 0, 0, 0.3));
  color: #ffffff;
  font: 900 calc(20px * var(--obby-ui-scale, 1))/1 system-ui, "Segoe UI", Roboto, sans-serif;
  box-shadow: 0 4px 0 rgba(0, 0, 0, 0.45);
  cursor: pointer;
}
.obby-audio__btn:hover { filter: brightness(1.1); }
.obby-audio__btn:active { transform: translateY(3px); box-shadow: none; }
.obby-audio--muted .obby-audio__btn { background-color: #5b6a86; }

.obby-audio__slider {
  width: calc(66px * var(--obby-ui-scale, 1));
  height: calc(14px * var(--obby-ui-scale, 1));
  margin: 0;
  cursor: pointer;
  accent-color: #3aa8ff;
}
`;
  document.head.append(style);
};
