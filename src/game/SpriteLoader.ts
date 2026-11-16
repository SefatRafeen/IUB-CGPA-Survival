/**
 * ImagePreloader & Sprite Sheet Slicer for IUB: CGPA Survival
 * - Fetches, caches, and verifies all landscape backdrops and boss/miniboss/player sprite sheets
 *   before initiating the gameplay loop.
 * - Normalizes Boss & Miniboss sprite sheets into clean transparent grid cells (512x512 per frame,
 *   default facing LEFT with studio background flood-fill removed and text captions cropped)
 *   so Canvas rendering uses `ctx.drawImage(img, frameX * spriteWidth, frameY * spriteHeight, ...)`
 *   and flips via `ctx.scale(-1, 1)` only when facing RIGHT.
 */

export type AnimRow = 'IDLE' | 'WALK' | 'RUN' | 'JUMP';

export type AssetFileName =
  | '1794864838768.jpg' // Level 1 Atrium Backdrop
  | '1794864824499.jpg' // Level 2 Library & Corridors
  | '1794864810609.jpg' // Level 3 Rooftop & Skyline
  | '1794864614904.jpg' // Boss 1: The Syllabus
  | '1794863050921.jpg' // Boss 2: Probation
  | '1794863067894.jpg' // Boss 3: Academic Dismissal
  | '1794863097469.jpg' // Minibosses & Enemies (Prerequisite, All-Nighter, Dean's List, Blank Sheet)
  | '02f76f6fa425719e6f6d37d8c0cb5b17.jpg'; // Player Character

export const ASSET_PATH_MAP: Record<AssetFileName, string> = {
  '1794864838768.jpg': '/assets/aistudio/1794864838768_8efa0742.jpg',
  '1794864824499.jpg': '/assets/aistudio/1794864824499_6364437c.jpg',
  '1794864810609.jpg': '/assets/aistudio/1794864810609_afe83388.jpg',
  '1794864614904.jpg': '/assets/aistudio/1794864614904_e3275454.jpg',
  '1794863050921.jpg': '/assets/aistudio/1794863050921_885d2b2e.jpg',
  '1794863067894.jpg': '/assets/aistudio/1794863067894_a1c46fc1.jpg',
  '1794863097469.jpg': '/assets/aistudio/1794863097469_14292f32.jpg',
  '02f76f6fa425719e6f6d37d8c0cb5b17.jpg': '/assets/aistudio/02f76f6fa425719e6f6d37d8c0cb5b17_9be22ade.jpg',
};

export const SPRITE_CELL_W = 512;
export const SPRITE_CELL_H = 512;

interface NormalizedCropRegion {
  rx: number;
  ry: number;
  rw: number;
  rh: number;
  flipToFaceLeft?: boolean;
}

const SPRITE_URL = ASSET_PATH_MAP['02f76f6fa425719e6f6d37d8c0cb5b17.jpg'];
const COLS = 5;
const ROWS = 4;

class CharacterSpriteManager {
  private frames: Record<AnimRow, HTMLCanvasElement[]> = {
    IDLE: [],
    WALK: [],
    RUN: [],
    JUMP: [],
  };
  private loaded: boolean = false;

  constructor() {
    this.loadSpriteSheet();
  }

  private loadSpriteSheet(): void {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        this.processSheet(img);
        this.loaded = true;
      } catch {
        this.loaded = false;
      }
    };
    img.src = SPRITE_URL;
  }

  public processFromPreloadedImage(img: HTMLImageElement): void {
    if (this.loaded) return;
    try {
      this.processSheet(img);
      this.loaded = true;
    } catch {
      this.loaded = false;
    }
  }

  private isBackgroundPixel(r: number, g: number, b: number): boolean {
    const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    return maxDiff <= 26 && luma >= 146;
  }

  private isCharacterBodyPixel(r: number, g: number, b: number, a: number): boolean {
    if (a < 120) return false;
    const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    return luma < 135 || maxDiff > 24;
  }

  private processSheet(img: HTMLImageElement): void {
    const cellW = Math.floor(img.naturalWidth / COLS);
    const cellH = Math.floor(img.naturalHeight / ROWS);
    const rowKeys: AnimRow[] = ['IDLE', 'WALK', 'RUN', 'JUMP'];

    for (let r = 0; r < ROWS; r++) {
      const rowKey = rowKeys[r];
      this.frames[rowKey] = [];

      for (let c = 0; c < COLS; c++) {
        const canvas = document.createElement('canvas');
        canvas.width = cellW;
        canvas.height = cellH;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;

        ctx.drawImage(img, c * cellW, r * cellH, cellW, cellH, 0, 0, cellW, cellH);
        const imgData = ctx.getImageData(0, 0, cellW, cellH);
        const data = imgData.data;
        const visited = new Uint8Array(cellW * cellH);
        const queue: number[] = [];

        const pushIfBg = (x: number, y: number) => {
          if (x < 0 || x >= cellW || y < 0 || y >= cellH) return;
          const idx = y * cellW + x;
          if (visited[idx]) return;
          const p = idx * 4;
          if (this.isBackgroundPixel(data[p], data[p + 1], data[p + 2])) {
            visited[idx] = 1;
            queue.push(idx);
          }
        };

        for (let x = 0; x < cellW; x++) {
          pushIfBg(x, 0);
          pushIfBg(x, cellH - 1);
        }
        for (let y = 0; y < cellH; y++) {
          pushIfBg(0, y);
          pushIfBg(cellW - 1, y);
        }

        while (queue.length > 0) {
          const curr = queue.pop()!;
          const p = curr * 4;
          data[p + 3] = 0;

          const cx = curr % cellW;
          const cy = Math.floor(curr / cellW);
          pushIfBg(cx + 1, cy);
          pushIfBg(cx - 1, cy);
          pushIfBg(cx, cy + 1);
          pushIfBg(cx, cy - 1);
        }

        for (let y = 0; y < cellH; y++) {
          for (let x = 0; x < cellW; x++) {
            const idx = y * cellW + x;
            if (visited[idx]) continue;
            const p = idx * 4;
            const rVal = data[p];
            const gVal = data[p + 1];
            const bVal = data[p + 2];
            const maxDiff = Math.max(Math.abs(rVal - gVal), Math.abs(gVal - bVal), Math.abs(rVal - bVal));
            const luma = 0.299 * rVal + 0.587 * gVal + 0.114 * bVal;
            const outsideFace = y > cellH * 0.46 || x < cellW * 0.2 || x > cellW * 0.8;
            if (outsideFace && maxDiff <= 22 && luma >= 150) {
              data[p + 3] = 0;
            }
          }
        }

        ctx.putImageData(imgData, 0, 0);

        let minX = cellW;
        let maxX = 0;
        let minY = cellH;
        let maxY = 0;

        for (let y = 0; y < cellH; y++) {
          let rowBodyPixels = 0;
          for (let x = 0; x < cellW; x++) {
            const p = (y * cellW + x) * 4;
            if (this.isCharacterBodyPixel(data[p], data[p + 1], data[p + 2], data[p + 3])) {
              rowBodyPixels++;
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
            }
          }
          if (rowBodyPixels >= 3) {
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }

        if (maxX > minX && maxY > minY) {
          const cropW = maxX - minX + 1;
          const cropH = maxY - minY + 1;
          const cropped = document.createElement('canvas');
          cropped.width = cropW;
          cropped.height = cropH;
          const cCtx = cropped.getContext('2d');
          if (cCtx) {
            cCtx.drawImage(canvas, minX, minY, cropW, cropH, 0, 0, cropW, cropH);
            this.frames[rowKey].push(cropped);
            continue;
          }
        }

        this.frames[rowKey].push(canvas);
      }
    }
  }

  public isReady(): boolean {
    return this.loaded;
  }

  public getFrame(row: AnimRow, frameIndex: number): HTMLCanvasElement | null {
    if (!this.loaded) return null;
    const list = this.frames[row];
    if (!list || list.length === 0) return null;
    return list[Math.abs(frameIndex) % list.length];
  }
}

export const characterSprites = new CharacterSpriteManager();

/**
 * ImagePreloader: Fetches, caches, and verifies all landscape and sprite sheet images
 * before initiating the gameplay loop, and builds normalized transparent sprite sheets
 * for 'The Syllabus', 'Probation', 'Academic Dismissal', and 'Minibosses'.
 */
export class ImagePreloader {
  private rawCache: Map<AssetFileName, HTMLImageElement> = new Map();
  private spriteSheets: Map<AssetFileName, HTMLCanvasElement> = new Map();
  private preloadPromise: Promise<boolean> | null = null;
  private ready: boolean = false;
  private loadedCount: number = 0;
  private readonly totalCount: number = Object.keys(ASSET_PATH_MAP).length;

  constructor() {
    // Begin preloading immediately in the background
    void this.preloadAll();
  }

  public preloadAll(onProgress?: (loaded: number, total: number) => void): Promise<boolean> {
    if (this.preloadPromise) {
      if (this.ready && onProgress) {
        onProgress(this.totalCount, this.totalCount);
      }
      return this.preloadPromise;
    }

    const keys = Object.keys(ASSET_PATH_MAP) as AssetFileName[];
    this.loadedCount = 0;

    this.preloadPromise = Promise.all(
      keys.map(
        (key) =>
          new Promise<void>((resolve) => {
            const url = ASSET_PATH_MAP[key];
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
              if (img.complete && img.naturalWidth > 0) {
                this.rawCache.set(key, img);
                try {
                  this.processAssetIfNeeded(key, img);
                } catch {
                  // Fallback to raw image if offscreen processing fails
                }
              }
              this.loadedCount += 1;
              onProgress?.(this.loadedCount, this.totalCount);
              resolve();
            };
            img.onerror = () => {
              this.loadedCount += 1;
              onProgress?.(this.loadedCount, this.totalCount);
              resolve();
            };
            img.src = url;
          })
      )
    ).then(() => {
      this.ready = true;
      return true;
    });

    return this.preloadPromise;
  }

  public isReady(): boolean {
    return this.ready;
  }

  public getProgress(): { loaded: number; total: number } {
    return { loaded: this.loadedCount, total: this.totalCount };
  }

  /**
   * Verifies and returns a cached landscape or raw image by filename (e.g. '1794864838768.jpg').
   */
  public getImage(name: AssetFileName): HTMLImageElement | null {
    const img = this.rawCache.get(name);
    if (img && img.complete && img.naturalWidth > 0) {
      return img;
    }
    return null;
  }

  /**
   * Returns the normalized sprite sheet canvas (where each cell is `SPRITE_CELL_W x SPRITE_CELL_H`
   * and faces LEFT by default) for use with `ctx.drawImage(sheet, frameX * spriteWidth, frameY * spriteHeight, ...)`.
   */
  public getSpriteSheet(name: AssetFileName): HTMLCanvasElement | HTMLImageElement | null {
    const sheet = this.spriteSheets.get(name);
    if (sheet) return sheet;
    return this.getImage(name);
  }

  private processAssetIfNeeded(key: AssetFileName, img: HTMLImageElement): void {
    if (key === '02f76f6fa425719e6f6d37d8c0cb5b17.jpg') {
      characterSprites.processFromPreloadedImage(img);
      return;
    }

    if (key === '1794864614904.jpg') {
      // Boss 1: 'The Syllabus' — Horizontal strip: [0] Idle, [1] Projectile, [2] Slam, [3] Defeated/Unrolling
      const regions: NormalizedCropRegion[][] = [
        [
          { rx: 0.03, ry: 0.02, rw: 0.43, rh: 0.42, flipToFaceLeft: true }, // [0] Idle
          { rx: 0.02, ry: 0.49, rw: 0.48, rh: 0.43, flipToFaceLeft: true }, // [1] Projectile (Paper Slice)
          { rx: 0.50, ry: 0.48, rw: 0.48, rh: 0.44, flipToFaceLeft: true }, // [2] Slam (Book Slam)
          { rx: 0.48, ry: 0.02, rw: 0.49, rh: 0.42, flipToFaceLeft: true }, // [3] Defeated / Unrolling
        ],
      ];
      this.spriteSheets.set(key, this.buildNormalizedSpriteGrid(img, regions));
    } else if (key === '1794863050921.jpg') {
      // Boss 2: 'Probation' — Horizontal strip: [0] Idle, [1] Chain Attack, [2] Warn/Laser, [3] Crumbling/Defeat
      const regions: NormalizedCropRegion[][] = [
        [
          { rx: 0.04, ry: 0.02, rw: 0.36, rh: 0.43, flipToFaceLeft: true }, // [0] Idle
          { rx: 0.03, ry: 0.51, rw: 0.51, rh: 0.42, flipToFaceLeft: true }, // [1] Chain Attack
          { rx: 0.58, ry: 0.48, rw: 0.40, rh: 0.45, flipToFaceLeft: true }, // [2] Warn/Laser & Sand Rain
          { rx: 0.46, ry: 0.02, rw: 0.50, rh: 0.43, flipToFaceLeft: true }, // [3] Crumbling / Moving / Defeat
        ],
      ];
      this.spriteSheets.set(key, this.buildNormalizedSpriteGrid(img, regions));
    } else if (key === '1794863067894.jpg') {
      // Boss 3: 'Academic Dismissal' — Horizontal strip: [0] Idle, [1] Stamp Slam, [2] Blade Sweep, [3] Final/Winged Phase
      const regions: NormalizedCropRegion[][] = [
        [
          { rx: 0.02, ry: 0.02, rw: 0.29, rh: 0.44, flipToFaceLeft: true }, // [0] Idle
          { rx: 0.02, ry: 0.51, rw: 0.47, rh: 0.43, flipToFaceLeft: true }, // [1] Stamp Slam
          { rx: 0.32, ry: 0.02, rw: 0.33, rh: 0.44, flipToFaceLeft: true }, // [2] Blade Sweep
          { rx: 0.65, ry: 0.03, rw: 0.34, rh: 0.88, flipToFaceLeft: false }, // [3] Final/Winged Phase (front-facing symmetry)
        ],
      ];
      this.spriteSheets.set(key, this.buildNormalizedSpriteGrid(img, regions));
    } else if (key === '1794863097469.jpg') {
      // Minibosses & Enemies ('1794863097469.jpg'):
      // Top Row (frameY = 0): The Prerequisite [0] idle, [1] block, [2] shatter
      // Bottom Row (frameY = 1): All-Nighter [0] idle, [1] dash, [2] stun
      // Row 2 (frameY = 2): Dean's List [0] guard, [1] lunge, [2] Blank Sheet mimic
      const regions: NormalizedCropRegion[][] = [
        // Row 0: The Prerequisite
        [
          { rx: 0.04, ry: 0.33, rw: 0.25, rh: 0.29, flipToFaceLeft: true }, // [0] Prerequisite Idle
          { rx: 0.04, ry: 0.33, rw: 0.25, rh: 0.29, flipToFaceLeft: false }, // [1] Prerequisite Block
          { rx: 0.30, ry: 0.33, rw: 0.27, rh: 0.29, flipToFaceLeft: true }, // [2] Prerequisite Shatter / Unlock
        ],
        // Row 1: All-Nighter
        [
          { rx: 0.04, ry: 0.02, rw: 0.19, rh: 0.27, flipToFaceLeft: true }, // [0] All-Nighter Idle
          { rx: 0.23, ry: 0.02, rw: 0.29, rh: 0.27, flipToFaceLeft: true }, // [1] All-Nighter Dash
          { rx: 0.53, ry: 0.02, rw: 0.21, rh: 0.27, flipToFaceLeft: true }, // [2] All-Nighter Stun / Attack
        ],
        // Row 2: Dean's List & Blank Sheet
        [
          { rx: 0.04, ry: 0.65, rw: 0.23, rh: 0.30, flipToFaceLeft: true }, // [0] Dean's List Guard
          { rx: 0.28, ry: 0.65, rw: 0.34, rh: 0.30, flipToFaceLeft: true }, // [1] Dean's List Shield Lunge
          { rx: 0.75, ry: 0.02, rw: 0.21, rh: 0.28, flipToFaceLeft: true }, // [2] Blank Sheet Void Mimic
        ],
      ];
      this.spriteSheets.set(key, this.buildNormalizedSpriteGrid(img, regions));
    }
  }

  private isDarkStudioBackdrop(r: number, g: number, b: number, seedR: number, seedG: number, seedB: number): boolean {
    const dist = Math.abs(r - seedR) + Math.abs(g - seedG) + Math.abs(b - seedB);
    const maxDiff = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    // The studio backdrop in the boss/enemy sheets is a uniform dark neutral charcoal (#18181c - #29292e)
    return dist <= 46 && maxDiff <= 18 && luma <= 56;
  }

  private buildNormalizedSpriteGrid(
    img: HTMLImageElement,
    grid: NormalizedCropRegion[][]
  ): HTMLCanvasElement {
    const numRows = grid.length;
    const numCols = Math.max(...grid.map((r) => r.length));

    const sheet = document.createElement('canvas');
    sheet.width = numCols * SPRITE_CELL_W;
    sheet.height = numRows * SPRITE_CELL_H;
    const sCtx = sheet.getContext('2d');
    if (!sCtx) return sheet;

    for (let rowIdx = 0; rowIdx < numRows; rowIdx++) {
      const row = grid[rowIdx];
      for (let colIdx = 0; colIdx < row.length; colIdx++) {
        const reg = row[colIdx];
        const sx = Math.floor(reg.rx * img.naturalWidth);
        const sy = Math.floor(reg.ry * img.naturalHeight);
        const sw = Math.max(1, Math.floor(reg.rw * img.naturalWidth));
        const sh = Math.max(1, Math.floor(reg.rh * img.naturalHeight));

        const temp = document.createElement('canvas');
        temp.width = sw;
        temp.height = sh;
        const tCtx = temp.getContext('2d');
        if (!tCtx) continue;

        tCtx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
        const imgData = tCtx.getImageData(0, 0, sw, sh);
        const data = imgData.data;

        // Sample top-left corner as studio background seed color
        const seedR = data[0];
        const seedG = data[1];
        const seedB = data[2];

        const visited = new Uint8Array(sw * sh);
        const queue: number[] = [];

        const pushIfStudioBg = (x: number, y: number) => {
          if (x < 0 || x >= sw || y < 0 || y >= sh) return;
          const idx = y * sw + x;
          if (visited[idx]) return;
          const p = idx * 4;
          if (this.isDarkStudioBackdrop(data[p], data[p + 1], data[p + 2], seedR, seedG, seedB)) {
            visited[idx] = 1;
            queue.push(idx);
          }
        };

        // Flood-fill studio background from all 4 borders of the cropped frame
        for (let x = 0; x < sw; x++) {
          pushIfStudioBg(x, 0);
          pushIfStudioBg(x, sh - 1);
        }
        for (let y = 0; y < sh; y++) {
          pushIfStudioBg(0, y);
          pushIfStudioBg(sw - 1, y);
        }

        while (queue.length > 0) {
          const curr = queue.pop()!;
          const p = curr * 4;
          data[p + 3] = 0;

          const cx = curr % sw;
          const cy = Math.floor(curr / sw);
          pushIfStudioBg(cx + 1, cy);
          pushIfStudioBg(cx - 1, cy);
          pushIfStudioBg(cx, cy + 1);
          pushIfStudioBg(cx, cy - 1);
        }

        tCtx.putImageData(imgData, 0, 0);

        // Compute tight bounding box of non-transparent sprite pixels
        let minX = sw;
        let maxX = 0;
        let minY = sh;
        let maxY = 0;
        for (let y = 0; y < sh; y++) {
          for (let x = 0; x < sw; x++) {
            const a = data[(y * sw + x) * 4 + 3];
            if (a > 25) {
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }

        if (maxX <= minX || maxY <= minY) {
          minX = 0;
          minY = 0;
          maxX = sw - 1;
          maxY = sh - 1;
        }

        const cropW = maxX - minX + 1;
        const cropH = maxY - minY + 1;

        // Fit cleanly into the (colIdx, rowIdx) cell of SPRITE_CELL_W x SPRITE_CELL_H
        const pad = 12;
        const availW = SPRITE_CELL_W - pad * 2;
        const availH = SPRITE_CELL_H - pad * 2;
        const scale = Math.min(availW / cropW, availH / cropH);
        const drawW = cropW * scale;
        const drawH = cropH * scale;

        const cellOriginX = colIdx * SPRITE_CELL_W;
        const cellOriginY = rowIdx * SPRITE_CELL_H;
        const destCenterX = cellOriginX + SPRITE_CELL_W * 0.5;
        // Align bottom of sprite near the bottom of the cell so grounded bosses stand naturally
        const destBottomY = cellOriginY + SPRITE_CELL_H - pad;

        sCtx.save();
        sCtx.translate(destCenterX, destBottomY - drawH * 0.5);
        if (reg.flipToFaceLeft) {
          sCtx.scale(-1, 1);
        }
        sCtx.drawImage(temp, minX, minY, cropW, cropH, -drawW * 0.5, -drawH * 0.5, drawW, drawH);
        sCtx.restore();
      }
    }

    return sheet;
  }
}

export const imagePreloader = new ImagePreloader();
