/**
 * The house style for a hanging sign: a rounded blue panel with a light inner
 * stroke, carrying an emoji and big outlined white text.
 *
 * Extracted so the Train Speed banner and the Win Shop sign are literally the
 * same treatment rather than two drawings that happen to look alike - a second
 * copy is how the two would drift apart the first time either is tweaked.
 */

/** Panel fill and its inner stroke. */
const PANEL_FILL = '#2a8fe0';
const PANEL_STROKE = '#7fd6ff';

/** Dark blue the surrounding frame mesh is painted. */
export const SIGN_FRAME_COLOR = 0x1a4f8a;

/** How far the frame mesh oversails the panel, in world units. */
export const SIGN_FRAME_MARGIN = 0.7;

export interface SignOptions {
  /** Emoji shown to the left of the label. Omit for text only. */
  readonly icon?: string;
  /** Canvas pixels. Keep the aspect close to the mesh's, or the text stretches. */
  readonly width?: number;
  readonly height?: number;
}

/**
 * Draw a sign onto a fresh canvas.
 *
 * The icon and label are measured and laid out as one group so they stay
 * centred together whatever the label's length - hard-coding an x for each,
 * as the Win Shop sign used to, only centres one particular string.
 */
export const drawSign = (label: string, options: SignOptions = {}): HTMLCanvasElement => {
  const width = options.width ?? 1024;
  const height = options.height ?? 200;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Panel.
  const inset = 8;
  const radius = Math.min(26, height * 0.14);
  ctx.fillStyle = PANEL_FILL;
  ctx.strokeStyle = PANEL_STROKE;
  ctx.lineWidth = Math.max(6, height * 0.05);
  ctx.beginPath();
  ctx.roundRect(inset, inset, width - inset * 2, height - inset * 2, radius);
  ctx.fill();
  ctx.stroke();

  // Text, sized to the panel so a long label still fits.
  const fontSize = height * 0.48;
  const textFont = `900 ${fontSize}px "Trebuchet MS", "Segoe UI", sans-serif`;
  const iconFont = `${fontSize * 0.95}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
  const gap = fontSize * 0.3;

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  ctx.font = textFont;
  const labelWidth = ctx.measureText(label).width;
  ctx.font = iconFont;
  const iconWidth = options.icon ? ctx.measureText(options.icon).width : 0;

  const total = labelWidth + (options.icon ? iconWidth + gap : 0);
  let x = (width - total) / 2;
  const y = height / 2 + fontSize * 0.04;

  if (options.icon) {
    ctx.font = iconFont;
    ctx.fillText(options.icon, x, y);
    x += iconWidth + gap;
  }

  ctx.font = textFont;
  ctx.lineJoin = 'round';
  ctx.lineWidth = fontSize * 0.19;
  ctx.strokeStyle = 'rgba(10,30,60,0.95)';
  ctx.strokeText(label, x, y);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, x, y);

  return canvas;
};
