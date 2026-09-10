import {
  BELT_LOOPS,
  ITEMS,
  SIZE,
  VIEW,
  getColor,
  isWatch,
  readyItemIds,
  assetFiles,
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
  items: Partial<Record<ItemId, GarmentImages | WatchImages>>;
};
export type WatchImages = {
  image: CanvasImageSource;
  thumbnail: CanvasImageSource;
  bounds: Bounds;
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
const assetUrl = (filename: string) =>
  `${import.meta.env.BASE_URL}assets/${filename}`;
let imageRequest: Promise<WardrobeImages> | undefined;
export function loadWardrobe(): Promise<WardrobeImages> {
  if (!imageRequest)
    imageRequest = (async () => {
      const base = await bitmap(assetUrl('mannequin.png'));
      const entries = await Promise.all(
        readyItemIds().map(async (id) => {
          const bounds = ITEMS[id].bounds;
          const [first, second] = assetFiles(id);
          if (isWatch(id)) {
            const [image, thumbnail] = await Promise.all([
              bitmap(assetUrl(first), bounds),
              bitmap(assetUrl(second)),
            ]);
            return [id, { image, thumbnail, bounds }] as const;
          }
          const [mask, shading] = await Promise.all([
            bitmap(assetUrl(first), bounds),
            bitmap(assetUrl(second), bounds),
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
  private outerContours = new Map<
    ItemId,
    { y: number; left: number; right: number }[]
  >();
  constructor(images: WardrobeImages, factory: CanvasFactory = makeCanvas) {
    this.images = images;
    this.factory = factory;
    this.scene = factory(SIZE.width, SIZE.height);
  }
  has(id: ItemId): boolean {
    return Boolean(this.images.items[id]);
  }
  garment(id: ItemId, color: ColorId): HTMLCanvasElement {
    const key = `${id}:${isWatch(id) ? 'fixed' : color}`;
    const existing = this.cache.get(key);
    if (existing) {
      this.cache.delete(key);
      this.cache.set(key, existing);
      return existing;
    }
    const asset = this.images.items[id];
    if (!asset)
      throw new Error(
        `The ${ITEMS[id].label.toLowerCase()} image is not ready.`,
      );
    const { bounds } = asset;
    const patch = this.factory(bounds.width, bounds.height),
      ctx = context(patch);
    if ('image' in asset) {
      ctx.drawImage(asset.image, 0, 0);
    } else {
      ctx.fillStyle = getColor(color).hex;
      ctx.fillRect(0, 0, bounds.width, bounds.height);
      ctx.drawImage(asset.shading, 0, 0);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(asset.mask, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
    }
    this.cache.set(key, patch);
    if (this.cache.size > 24)
      this.cache.delete(this.cache.keys().next().value!);
    return patch;
  }
  compose(outfit: Outfit): HTMLCanvasElement {
    const ctx = context(this.scene);
    ctx.clearRect(0, 0, SIZE.width, SIZE.height);
    for (const step of layerPlan(outfit, (id) => this.has(id))) {
      if (step.kind === 'base') {
        ctx.drawImage(this.images.base, 0, 0);
        continue;
      }
      const outer: ItemId[] = [];
      if (step.kind === 'garment') {
        if (
          step.section === 'shirt' &&
          outfit.layers.sweater.visible &&
          this.has(outfit.layers.sweater.item)
        )
          outer.push(outfit.layers.sweater.item);
        if (
          (step.section === 'shirt' || step.section === 'sweater') &&
          outfit.layers.jacket.visible &&
          this.has(outfit.layers.jacket.item)
        )
          outer.push(outfit.layers.jacket.item);
      }
      const patch = outer.length
        ? this.fittedGarment(step.choice.item, step.choice.color, outer)
        : this.garment(step.choice.item, step.choice.color);
      const bounds = this.images.items[step.choice.item]!.bounds;
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
  private contour(id: ItemId) {
    let contour = this.outerContours.get(id);
    if (!contour) {
      const outer = this.images.items[id] as GarmentImages;
      const mask = this.factory(outer.bounds.width, outer.bounds.height);
      context(mask).drawImage(outer.mask, 0, 0);
      const alpha = context(mask).getImageData(
        0,
        0,
        mask.width,
        mask.height,
      ).data;
      contour = [];
      const start = id.startsWith('sweater-') ? 280 : outer.bounds.y;
      for (let y = start; y < outer.bounds.y + outer.bounds.height; y++) {
        let left = -1,
          right = -1;
        for (let x = 0; x < mask.width; x++) {
          if (alpha[((y - outer.bounds.y) * mask.width + x) * 4 + 3] < 128)
            continue;
          if (left < 0) left = x;
          right = x;
        }
        if (left >= 0)
          contour.push({
            y,
            left: left + outer.bounds.x + 1,
            right: right + outer.bounds.x - 1,
          });
      }
      this.outerContours.set(id, contour);
    }
    return contour;
  }
  private fittedGarment(id: ItemId, color: ColorId, outer: ItemId[]) {
    const key = `${id}:${color}:under:${outer.join(',')}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const bounds = this.images.items[id]!.bounds;
    const patch = this.factory(bounds.width, bounds.height),
      ctx = context(patch);
    ctx.drawImage(this.garment(id, color), 0, 0);
    // Underlayers follow the outer shoulder/sleeve silhouette without clipping
    // the open front. Longer cuffs and untucked hems can still show below.
    for (const garment of outer) {
      // Do not leave detached rear-collar fragments above the outer jacket.
      const contour = this.contour(garment);
      if (!garment.startsWith('sweater-')) {
        const collarTop =
          contour.find((row) => row.left < 490 && row.right > 540)?.y ??
          this.images.items[garment]!.bounds.y;
        ctx.clearRect(0, 0, bounds.width, Math.max(0, collarTop - bounds.y));
      }
      for (const { y, left, right } of contour) {
        ctx.clearRect(0, y - bounds.y, Math.max(0, left - bounds.x), 1);
        ctx.clearRect(right + 1 - bounds.x, y - bounds.y, bounds.width, 1);
      }
    }
    this.cache.set(key, patch);
    if (this.cache.size > 24)
      this.cache.delete(this.cache.keys().next().value!);
    return patch;
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
    const asset = this.images.items[id];
    if (!asset) {
      context(canvas).clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    if ('thumbnail' in asset) {
      const ctx = context(canvas);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(asset.thumbnail, 0, 0, canvas.width, canvas.height);
      return;
    }
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
