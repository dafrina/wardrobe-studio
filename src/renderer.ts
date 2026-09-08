import {
  BELT_LOOPS,
  ITEMS,
  SIZE,
  VIEW,
  getColor,
  layerPlan,
} from './wardrobe.ts';
import type { Bounds, ColorId, ItemId, Outfit } from './wardrobe.ts';

export type GarmentImages = {
  mask: CanvasImageSource;
  shading: CanvasImageSource;
  bounds: Bounds;
};
export type WardrobeImages = {
  base: CanvasImageSource;
  items: Record<ItemId, GarmentImages>;
};
type CanvasFactory = (width: number, height: number) => HTMLCanvasElement;
const makeCanvas: CanvasFactory = (width, height) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};
function context(canvas: HTMLCanvasElement) {
  const result = canvas.getContext('2d');
  if (!result)
    throw new Error('This browser could not start the outfit preview.');
  return result;
}
async function bitmap(url: string, bounds?: Bounds) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('A clothing image could not be loaded.');
  const blob = await response.blob();
  return bounds
    ? createImageBitmap(blob, bounds.x, bounds.y, bounds.width, bounds.height)
    : createImageBitmap(blob);
}
let imageRequest: Promise<WardrobeImages> | undefined;
export function loadWardrobe(): Promise<WardrobeImages> {
  if (!imageRequest)
    imageRequest = (async () => {
      const base = await bitmap('/assets/mannequin.png');
      const entries = await Promise.all(
        (Object.keys(ITEMS) as ItemId[]).map(async (id) => {
          const bounds = ITEMS[id].bounds;
          const [mask, shading] = await Promise.all([
            bitmap(`/assets/${id}-mask.png`, bounds),
            bitmap(`/assets/${id}-shading.png`, bounds),
          ]);
          return [id, { mask, shading, bounds }] as const;
        }),
      );
      return {
        base,
        items: Object.fromEntries(entries) as WardrobeImages['items'],
      };
    })().catch((error) => {
      imageRequest = undefined;
      throw error;
    });
  return imageRequest;
}
export class WardrobeRenderer {
  private images: WardrobeImages;
  private factory: CanvasFactory;
  private cache = new Map<string, HTMLCanvasElement>();
  private scene: HTMLCanvasElement;
  constructor(images: WardrobeImages, factory: CanvasFactory = makeCanvas) {
    this.images = images;
    this.factory = factory;
    this.scene = factory(SIZE.width, SIZE.height);
  }
  garment(id: ItemId, color: ColorId): HTMLCanvasElement {
    const key = `${id}:${color}`;
    const existing = this.cache.get(key);
    if (existing) {
      this.cache.delete(key);
      this.cache.set(key, existing);
      return existing;
    }
    const { mask, shading, bounds } = this.images.items[id];
    const patch = this.factory(bounds.width, bounds.height),
      ctx = context(patch);
    ctx.fillStyle = getColor(color).hex;
    ctx.fillRect(0, 0, bounds.width, bounds.height);
    ctx.drawImage(shading, 0, 0);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    this.cache.set(key, patch);
    if (this.cache.size > 24)
      this.cache.delete(this.cache.keys().next().value!);
    return patch;
  }
  compose(outfit: Outfit): HTMLCanvasElement {
    const ctx = context(this.scene);
    ctx.clearRect(0, 0, SIZE.width, SIZE.height);
    for (const step of layerPlan(outfit)) {
      if (step.kind === 'base') {
        ctx.drawImage(this.images.base, 0, 0);
        continue;
      }
      const patch = this.garment(step.choice.item, step.choice.color);
      const bounds = this.images.items[step.choice.item].bounds;
      if (step.kind === 'belt-loops') {
        ctx.save();
        ctx.beginPath();
        for (const loop of BELT_LOOPS)
          ctx.rect(loop.x, loop.y, loop.width, loop.height);
        ctx.clip();
        ctx.drawImage(patch, bounds.x, bounds.y);
        ctx.restore();
      } else ctx.drawImage(patch, bounds.x, bounds.y);
    }
    return this.scene;
  }
  paint(canvas: HTMLCanvasElement, outfit: Outfit) {
    const ctx = context(canvas),
      scene = this.compose(outfit);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(
      scene,
      VIEW.x,
      VIEW.y,
      VIEW.width,
      VIEW.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  }
  thumbnail(canvas: HTMLCanvasElement, id: ItemId, color: ColorId) {
    const patch = this.garment(id, color),
      ctx = context(canvas);
    const fit = Math.min(
      (canvas.width - 16) / patch.width,
      (canvas.height - 10) / patch.height,
    );
    const w = patch.width * fit,
      h = patch.height * fit;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(patch, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  }
}
