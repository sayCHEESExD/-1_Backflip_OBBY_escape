import {
  CanvasTexture,
  EquirectangularReflectionMapping,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';

/**
 * Procedural canvas textures for the gorge.
 *
 * Everything here is drawn at runtime on a small canvas - no image files, so
 * the whole toy-brick look costs nothing in the 12 MB budget. Textures are
 * cached and shared: a caller asking twice gets the same GPU upload.
 */
export class WorldTextures {
  private readonly cache = new Map<string, Texture>();

  /** Bright grass with moulded studs, for the spawn pad and the gorge rim. */
  grassStuds(color: string, highlight: string): Texture {
    return this.cached(`studs:${color}:${highlight}`, () => {
      const size = 128;
      const ctx = context(size);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, size, size);

      // A 4x4 grid of studs; drawn as a soft top-lit disc plus a shadow arc.
      const cells = 4;
      const step = size / cells;
      const radius = step * 0.26;
      for (let ix = 0; ix < cells; ix += 1) {
        for (let iz = 0; iz < cells; iz += 1) {
          const cx = (ix + 0.5) * step;
          const cy = (iz + 0.5) * step;

          ctx.strokeStyle = 'rgba(0,0,0,0.14)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy + 1, radius, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = highlight;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      return ctx.canvas;
    });
  }

  /** Square tiling, for the water and the canyon walls. */
  tiles(color: string, line: string, alt: string): Texture {
    return this.cached(`tiles:${color}:${line}:${alt}`, () => {
      const size = 128;
      const ctx = context(size);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, size, size);

      // Faint checker so the surface reads as tiled rather than flat.
      const cells = 4;
      const step = size / cells;
      ctx.fillStyle = alt;
      for (let ix = 0; ix < cells; ix += 1) {
        for (let iz = 0; iz < cells; iz += 1) {
          if ((ix + iz) % 2 === 0) continue;
          ctx.fillRect(ix * step, iz * step, step, step);
        }
      }

      ctx.strokeStyle = line;
      ctx.lineWidth = 1.5;
      for (let i = 0; i <= cells; i += 1) {
        const at = i * step;
        ctx.beginPath();
        ctx.moveTo(at, 0);
        ctx.lineTo(at, size);
        ctx.moveTo(0, at);
        ctx.lineTo(size, at);
        ctx.stroke();
      }
      return ctx.canvas;
    });
  }

  /**
   * Bright sky with soft cumulus.
   *
   * Used as `scene.background` with equirectangular mapping rather than a sky
   * dome mesh - three renders it as a true background, which costs no draw
   * call and cannot be frustum-culled.
   */
  sky(): Texture {
    const texture = this.cached('sky', () => {
      const width = 1024;
      const height = 512;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return canvas;

      // Blue across the whole range rather than fading to white at one end:
      // only a narrow band is ever on screen, and which band that is depends
      // on the equirect orientation, so the sky must read correctly anywhere.
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#0d63cc');
      gradient.addColorStop(0.35, '#2585e6');
      gradient.addColorStop(0.65, '#3d9ff2');
      gradient.addColorStop(1, '#74c0f8');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // Clouds spread across most of the sphere for the same reason.
      //
      // Keep the count and radius modest: this canvas is only 1024x512, and
      // enough overlapping puffs will happily paint the entire sky white.
      const random = seeded(90210);
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 22; i += 1) {
        const cx = random() * width;
        const cy = height * (0.2 + random() * 0.6);
        const scale = 12 + random() * 16;
        ctx.globalAlpha = 0.7 + random() * 0.25;
        // Each cloud is a handful of overlapping discs.
        for (let puff = 0; puff < 5; puff += 1) {
          const px = cx + (random() - 0.5) * scale * 2.6;
          const py = cy + (random() - 0.5) * scale * 0.5;
          const pr = scale * (0.45 + random() * 0.5);
          ctx.beginPath();
          ctx.arc(px, py, pr, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      return canvas;
    }, false);

    texture.mapping = EquirectangularReflectionMapping;
    return texture;
  }

  dispose(): void {
    for (const texture of this.cache.values()) texture.dispose();
    this.cache.clear();
  }

  private cached(key: string, draw: () => HTMLCanvasElement, repeat = true): Texture {
    const existing = this.cache.get(key);
    if (existing) return existing;

    const texture = new CanvasTexture(draw());
    texture.colorSpace = SRGBColorSpace;
    if (repeat) {
      texture.wrapS = RepeatWrapping;
      texture.wrapT = RepeatWrapping;
    }
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    this.cache.set(key, texture);
    return texture;
  }
}

const context = (size: number): CanvasRenderingContext2D => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  return ctx;
};

/** Deterministic PRNG so the sky is identical on every client. */
const seeded = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
