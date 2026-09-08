/**
 * Responsive overrides for small and touch screens.
 *
 * ONE stylesheet rather than edits spread across seven components, and every
 * rule lives inside a media query - so the desktop layout is not merely
 * "mostly" preserved, it is literally the same cascade it always was. Nothing
 * here changes what a panel does; it changes where it sits and how big it is.
 *
 * Every override requires BOTH a small screen and `body.obby-touch-mode` - the
 * class the input layer adds when the on-screen controls actually appear. A
 * desktop browser window dragged narrow therefore keeps the desktop layout: a
 * width breakpoint alone would have recompacted the rail on any half-screen
 * window, which is a desktop change however small.
 *
 * The `body.obby-touch-mode` prefix (specificity 0,2,1) also beats the
 * components' own single-class rules regardless of which stylesheet the
 * browser parsed first - injection order depends on construction order, which
 * is not something layout should rely on.
 */

let injected = false;

/** Phone-sized in either orientation. */
const SMALL = '(max-width: 900px), (max-height: 560px)';

/** Short and wide: a phone held sideways, where vertical room is the scarce axis. */
const LANDSCAPE = '(max-height: 560px) and (orientation: landscape)';

export const injectMobileStyles = (): void => {
  if (injected) return;
  injected = true;

  const style = document.createElement('style');
  style.textContent = `
/*
 * Safe areas, published once as variables so every panel can respect the
 * notch and the home indicator without repeating env() everywhere.
 */
:root {
  --obby-safe-t: env(safe-area-inset-top, 0px);
  --obby-safe-r: env(safe-area-inset-right, 0px);
  --obby-safe-b: env(safe-area-inset-bottom, 0px);
  --obby-safe-l: env(safe-area-inset-left, 0px);
}

@media ${SMALL} {
  /*
   * The desktop rail scale does not apply on a phone: the compact sizes below
   * are absolute, and a 2x column would take a third of the screen.
   */
  body.obby-touch-mode { --obby-ui-scale: 1; }

  /* ---- The left rail: smaller tiles, restacked to fit a short screen. ---- */
  body.obby-touch-mode .obby-wins {
    left: calc(var(--obby-safe-l) + 8px);
    top: calc(var(--obby-safe-t) + 8px);
    padding: 4px 11px 4px 7px;
  }
  body.obby-touch-mode .obby-rebirth-btn,
  body.obby-touch-mode .obby-cos-btn,
  body.obby-touch-mode .obby-audio {
    left: calc(var(--obby-safe-l) + 8px);
    width: 54px;
  }
  body.obby-touch-mode .obby-rebirth-btn,
  body.obby-touch-mode .obby-cos-btn {
    height: 54px;
    border-radius: 11px;
    font-size: 10px;
  }
  /* Same proportions as desktop - roughly 78% of the tile - at mobile size. */
  body.obby-touch-mode .obby-rebirth-btn__icon,
  body.obby-touch-mode .obby-cos-btn__icon { font-size: 41px; }
  body.obby-touch-mode .obby-rebirth-btn__label,
  body.obby-touch-mode .obby-cos-btn__label { margin-top: -7px; }

  /* Desktop tops are 70 / 146 / 222 / 298 (step 76); mobile is 52 / 112 / 172 / 232. */
  body.obby-touch-mode .obby-rebirth-btn { top: calc(var(--obby-safe-t) + 52px); }
  body.obby-touch-mode .obby-cos-btn { top: calc(var(--obby-safe-t) + 52px + (var(--obby-rail-top, 70px) - 70px) * 0.79); }
  body.obby-touch-mode .obby-audio {
    top: auto;
    bottom: auto;
    top: calc(var(--obby-safe-t) + 232px);
  }
  body.obby-touch-mode .obby-audio__btn { width: 54px; height: 36px; }
  body.obby-touch-mode .obby-audio__slider { width: 52px; }

  /*
   * The HUD sits ABOVE the touch controls rather than beside them: the stick
   * owns the bottom-left and the jump button the bottom-right, so anything
   * centred at the bottom edge would be under a thumb.
   */
  body.obby-touch-mode .obby-hud {
    width: min(680px, calc(100vw - 130px));
    bottom: calc(var(--obby-safe-b) + 124px);
  }
  body.obby-touch-mode .obby-tread { bottom: calc(var(--obby-safe-b) + 210px); }

  /* ---- Panels: fill the small screen and scroll inside. ---- */
  body.obby-touch-mode .obby-cos__card,
  body.obby-touch-mode .obby-rebirth__card {
    width: min(540px, calc(100vw - 16px));
    max-height: calc(100dvh - var(--obby-safe-t) - var(--obby-safe-b) - 16px);
  }
  body.obby-touch-mode .obby-cos__title { font-size: 22px; }
  body.obby-touch-mode .obby-cos__header { padding: 8px 9px 7px; }
  /*
   * A close control has to stay inside the viewport on a phone. The rebirth
   * card hangs its button outside the card corner, which is off-screen once
   * the card is as wide as the screen.
   */
  body.obby-touch-mode .obby-cos__close,
  body.obby-touch-mode .obby-rebirth__close {
    min-width: 44px;
    min-height: 44px;
  }
  body.obby-touch-mode .obby-rebirth__close { top: 6px; right: 6px; }
  body.obby-touch-mode .obby-rebirth__card { padding: 16px 14px 18px; }

  /* Touch targets: the platform minimum is 44px in the shorter axis. */
  body.obby-touch-mode .obby-cos__row { min-height: 52px; }
  body.obby-touch-mode .obby-cos__action,
  body.obby-touch-mode .obby-rebirth__confirm { min-height: 44px; }
  /* Capped above, so it has to be able to scroll or the confirm is unreachable. */
  body.obby-touch-mode .obby-rebirth__card { overflow-y: auto; }
}

@media ${LANDSCAPE} {
  /*
   * Held sideways there is no vertical room for a five-tile column, so the
   * rail runs along the top edge instead, clear of both thumbs.
   */
  body.obby-touch-mode .obby-rebirth-btn,
  body.obby-touch-mode .obby-cos-btn,
  body.obby-touch-mode .obby-audio {
    top: calc(var(--obby-safe-t) + 6px);
  }
  body.obby-touch-mode .obby-rebirth-btn { left: calc(var(--obby-safe-l) + 118px); }
  body.obby-touch-mode .obby-cos-btn {
    left: calc(var(--obby-safe-l) + 118px + (var(--obby-rail-top, 70px) - 70px) * 0.79);
  }
  body.obby-touch-mode .obby-audio { left: calc(var(--obby-safe-l) + 298px); }
  body.obby-touch-mode .obby-wins { top: calc(var(--obby-safe-t) + 6px); }

  body.obby-touch-mode .obby-hud { bottom: calc(var(--obby-safe-b) + 8px); width: min(420px, 46vw); }
  body.obby-touch-mode .obby-tread { bottom: calc(var(--obby-safe-b) + 74px); }

  body.obby-touch-mode .obby-cos__card,
  body.obby-touch-mode .obby-rebirth__card {
    max-height: calc(100dvh - var(--obby-safe-t) - var(--obby-safe-b) - 8px);
  }
}

/*
 * Touch mode, whatever the screen size: nothing may sit under a thumb, and no
 * gesture may scroll, select or zoom the page behind the game.
 */
body.obby-touch-mode {
  touch-action: none;
  overscroll-behavior: none;
}
/* Keyboard shortcut badges mean nothing without a keyboard. */
body.obby-touch-mode .obby-menu-key { display: none; }
body.obby-touch-mode .obby-cos__list,
body.obby-touch-mode .obby-rebirth__card {
  /* Panels are the ONE place a drag should scroll, and only along one axis. */
  touch-action: pan-y;
  -webkit-overflow-scrolling: touch;
}
`;
  document.head.append(style);
};
