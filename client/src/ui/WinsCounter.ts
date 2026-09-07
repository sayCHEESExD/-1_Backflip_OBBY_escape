import { formatSpeed } from '@obby/shared';
import { iconElement } from '../config/uiIcons.js';

/**
 * Trophy wins total, pinned top-left.
 *
 * Shows the SERVER-AUTHORITATIVE wins count. It never adds anything itself -
 * `TrophyService` is the only place wins are granted.
 */
export class WinsCounter {
  private readonly root: HTMLDivElement;
  private readonly amount: HTMLSpanElement;
  private last = -1;

  constructor(parent: HTMLElement) {
    injectStyles();

    this.root = document.createElement('div');
    this.root.className = 'obby-wins';

    const icon = document.createElement('span');
    icon.className = 'obby-wins__icon';
    icon.append(iconElement('trophy'));

    this.amount = document.createElement('span');
    this.amount.className = 'obby-wins__amount';
    this.amount.textContent = '0';

    this.root.append(icon, this.amount);
    parent.appendChild(this.root);
  }

  update(wins: number): void {
    if (wins === this.last) return;
    const gained = wins > this.last && this.last >= 0;
    this.last = wins;
    this.amount.textContent = formatSpeed(wins);

    if (!gained) return;
    // Brief pop so a collection is felt, not just read.
    this.root.classList.remove('obby-wins--pop');
    void this.root.offsetWidth;
    this.root.classList.add('obby-wins--pop');
  }

  dispose(): void {
    this.root.remove();
  }
}

let stylesInjected = false;

const injectStyles = (): void => {
  if (stylesInjected) return;
  stylesInjected = true;

  const style = document.createElement('style');
  style.textContent = `
.obby-wins {
  position: fixed;
  left: calc(14px * var(--obby-ui-scale, 1));
  top: calc(14px * var(--obby-ui-scale, 1));
  display: flex;
  align-items: center;
  gap: calc(8px * var(--obby-ui-scale, 1));
  padding: calc(6px * var(--obby-ui-scale, 1)) calc(16px * var(--obby-ui-scale, 1)) calc(6px * var(--obby-ui-scale, 1)) calc(10px * var(--obby-ui-scale, 1));
  border-radius: calc(10px * var(--obby-ui-scale, 1));
  background: rgba(14, 22, 34, 0.72);
  border: 2px solid #0b111b;
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.35);
  pointer-events: none;
  user-select: none;
  font-family: system-ui, "Segoe UI", Roboto, sans-serif;
  z-index: 20;
}
.obby-wins__icon {
  font-size: calc(clamp(20px, 3vw, 28px) * var(--obby-ui-scale, 1));
  line-height: 1;
  filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.5));
}
.obby-wins__amount {
  font-size: calc(clamp(17px, 2.7vw, 25px) * var(--obby-ui-scale, 1));
  font-weight: 800;
  color: #ffffff;
  text-shadow: 0 2px 0 #16202e, 0 -1px 0 #16202e, 1px 0 0 #16202e, -1px 0 0 #16202e;
}
.obby-wins--pop { animation: obby-wins-pop 460ms ease-out; }
@keyframes obby-wins-pop {
  0% { transform: scale(1); }
  30% { transform: scale(1.14); }
  100% { transform: scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .obby-wins--pop { animation: none; }
}
`;
  document.head.appendChild(style);
};
