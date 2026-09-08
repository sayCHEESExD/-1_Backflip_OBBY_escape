import {
  LEADERBOARD_BOARDS,
  LEADERBOARD_PANEL,
  LEADERBOARD_SIZE,
  SPAWN_PLATFORM,
  SPAWN_WALLS,
  formatSpeed,
  type LeaderboardBoard,
} from '@obby/shared';
import {
  BoxGeometry,
  CanvasTexture,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type BufferGeometry,
  type Material,
} from 'three';

/** One ranked row as the client receives it. */
export interface LeaderboardRow {
  readonly name: string;
  readonly value: number;
}

/** Canvas pixels per board. Sized to the panel's own aspect so text is square. */
const CANVAS_WIDTH = 560;
const CANVAS_HEIGHT = Math.round(
  (CANVAS_WIDTH * LEADERBOARD_PANEL.height) / LEADERBOARD_PANEL.width,
);

/** Thickness of the frame mesh behind the panel. */
const FRAME_DEPTH = 0.35;

/** How far the frame oversails the panel, per side, in world units. */
const FRAME_MARGIN = 0.45;

const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

/**
 * The three spawn scoreboards.
 *
 * Drawn the same way every other sign in the world is: a canvas texture on a
 * plane, inside a chunky frame mesh. That keeps them consistent with the Win
 * Shop and Train Speed boards and adds no new rendering path.
 *
 * The DATA is server-authoritative and global - this class only draws what it
 * is handed. It redraws on a version change rather than per frame, so an idle
 * scoreboard costs three static textures and three draws.
 */
export class Leaderboards {
  readonly root = new Group();

  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: Material[] = [];
  private readonly canvases = new Map<LeaderboardBoard, HTMLCanvasElement>();
  private readonly textures = new Map<LeaderboardBoard, CanvasTexture>();

  constructor() {
    const { width, height, centerY, standoff } = LEADERBOARD_PANEL;

    // One geometry per part, shared by all three boards - only the position,
    // the colours and the canvas differ.
    const frameGeometry = new BoxGeometry(
      FRAME_DEPTH,
      height + FRAME_MARGIN * 2,
      width + FRAME_MARGIN * 2,
    );
    const panelGeometry = new PlaneGeometry(width, height);
    this.geometries.push(frameGeometry, panelGeometry);

    // Mounted on the inner face of the left wall, facing back across the
    // platform so they read from the normal third-person camera.
    const wallX = SPAWN_WALLS.leftInnerX;
    const frameX = wallX - standoff;
    const panelX = frameX - FRAME_DEPTH / 2 - 0.02;
    const y = SPAWN_PLATFORM.topY + centerY;

    for (const board of LEADERBOARD_BOARDS) {
      const frameMaterial = new MeshLambertMaterial({ color: board.accent });
      this.materials.push(frameMaterial);
      const frame = new Mesh(frameGeometry, frameMaterial);
      frame.position.set(frameX, y, board.centerZ);
      frame.castShadow = true;
      this.root.add(frame);

      const canvas = document.createElement('canvas');
      canvas.width = CANVAS_WIDTH;
      canvas.height = CANVAS_HEIGHT;
      this.canvases.set(board, canvas);

      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      this.textures.set(board, texture);

      const panelMaterial = new MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: DoubleSide,
        depthWrite: false,
        fog: false,
      });
      this.materials.push(panelMaterial);

      const panel = new Mesh(panelGeometry, panelMaterial);
      panel.position.set(panelX, y, board.centerZ);
      // Face -X, into the walkable platform.
      panel.rotation.y = -Math.PI / 2;
      this.root.add(panel);

      this.draw(board, []);
    }
  }

  /**
   * Replace what a board shows.
   *
   * Fewer than nine rows is normal - a new server has none at all - so the
   * board always draws `LEADERBOARD_SIZE` slots and leaves the unfilled ones
   * empty rather than shrinking or failing.
   */
  setRows(metric: LeaderboardBoard['metric'], rows: readonly LeaderboardRow[]): void {
    const board = LEADERBOARD_BOARDS.find((b) => b.metric === metric);
    if (!board) return;
    this.draw(board, rows);
    const texture = this.textures.get(board);
    if (texture) texture.needsUpdate = true;
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const texture of this.textures.values()) texture.dispose();
  }

  /** Paint one board: title bar, then nine rows. */
  private draw(board: LeaderboardBoard, rows: readonly LeaderboardRow[]): void {
    const canvas = this.canvases.get(board);
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const accent = hex(board.accent);
    const panel = hex(board.panel);
    const pill = hex(board.pill);

    // The title sits in a RAISED TAB that overhangs the top of the plate, as
    // in the reference - so the top of the canvas is reserved for it and the
    // plate starts below.
    const titleH = Math.round(H * 0.13);
    const plateTop = Math.round(titleH * 0.52);
    const pad = 8;

    // --- Plate: a rounded panel inside a chunky frame in the board colour. ---
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.roundRect(pad, plateTop, W - pad * 2, H - plateTop - pad, 26);
    ctx.fill();

    const inset = pad + 13;
    ctx.fillStyle = panel;
    ctx.beginPath();
    ctx.roundRect(inset, plateTop + 13, W - inset * 2, H - plateTop - 13 - inset, 18);
    ctx.fill();

    // --- Title tab, centred and overhanging. ---
    const tabW = Math.round(W * 0.74);
    const tabX = (W - tabW) / 2;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.roundRect(tabX, 2, tabW, titleH, 18);
    ctx.fill();
    // A lighter top edge, which is what gives the tab its moulded look.
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.roundRect(tabX + 5, 6, tabW - 10, titleH - 10, 14);
    ctx.stroke();

    const titleSize = Math.round(titleH * 0.58);
    ctx.font = `900 ${titleSize}px "Trebuchet MS", "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = titleSize * 0.22;
    ctx.strokeStyle = 'rgba(12, 20, 40, 0.9)';
    ctx.strokeText(board.title, W / 2, 2 + titleH / 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(board.title, W / 2, 2 + titleH / 2);

    // --- Nine rows. Always nine, filled or not. ---
    const top = plateTop + titleH * 0.72;
    const rowH = (H - top - inset - 6) / LEADERBOARD_SIZE;
    const rowSize = Math.round(rowH * 0.5);
    const rankX = inset + 14;
    const nameX = rankX + Math.round(W * 0.115);
    const pillRight = W - inset - 12;

    for (let i = 0; i < LEADERBOARD_SIZE; i += 1) {
      const row = rows[i];
      const cy = top + rowH * i + rowH / 2;

      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';

      // Rank, always shown - an empty board still reads as a scoreboard.
      ctx.textAlign = 'left';
      ctx.font = `900 ${rowSize}px "Trebuchet MS", "Segoe UI", sans-serif`;
      ctx.lineWidth = rowSize * 0.22;
      ctx.strokeStyle = 'rgba(12, 20, 40, 0.85)';
      ctx.strokeText(`#${i + 1}`, rankX, cy);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`#${i + 1}`, rankX, cy);

      if (!row) continue;

      // Name, clipped so a long id cannot run under the value pill.
      const value = `${formatSpeed(row.value)} ${board.unit}`;
      const valueSize = Math.round(rowSize * 0.72);
      ctx.font = `900 ${valueSize}px "Trebuchet MS", "Segoe UI", sans-serif`;
      const valueWidth = ctx.measureText(value).width;
      const pillW = valueWidth + 22;
      const pillX = pillRight - pillW;

      ctx.save();
      ctx.beginPath();
      ctx.rect(nameX, cy - rowH / 2, pillX - nameX - 10, rowH);
      ctx.clip();
      ctx.font = `900 ${Math.round(rowSize * 0.86)}px "Trebuchet MS", "Segoe UI", sans-serif`;
      ctx.lineWidth = rowSize * 0.18;
      ctx.strokeStyle = 'rgba(12, 20, 40, 0.85)';
      ctx.strokeText(row.name, nameX, cy);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(row.name, nameX, cy);
      ctx.restore();

      // Value on a lighter pill, right-aligned.
      ctx.fillStyle = pill;
      ctx.beginPath();
      ctx.roundRect(pillX, cy - rowH * 0.34, pillW, rowH * 0.68, rowH * 0.28);
      ctx.fill();

      ctx.textAlign = 'center';
      ctx.font = `900 ${valueSize}px "Trebuchet MS", "Segoe UI", sans-serif`;
      ctx.lineWidth = valueSize * 0.2;
      ctx.strokeStyle = 'rgba(12, 20, 40, 0.85)';
      ctx.strokeText(value, pillX + pillW / 2, cy);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText(value, pillX + pillW / 2, cy);
    }
  }
}
