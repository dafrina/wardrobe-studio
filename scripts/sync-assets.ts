import { readFile, writeFile, access } from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import {
  ITEMS,
  SIZE,
  WATCH_IDS,
  assetFiles,
  isWatch,
} from '../src/wardrobe.ts';
import type { Bounds, ItemId } from '../src/wardrobe.ts';

const root = new URL('../', import.meta.url);
const exists = async (path: URL) =>
  access(path).then(
    () => true,
    () => false,
  );
type Kind = 'base' | 'mask' | 'shading' | 'watch' | 'thumbnail';

async function inspect(filename: string, kind: Kind) {
  const image = await loadImage(
    await readFile(new URL(`public/assets/${filename}`, root)),
  );
  const width = kind === 'thumbnail' ? 176 : SIZE.width;
  const height = kind === 'thumbnail' ? 120 : SIZE.height;
  if (image.width !== width || image.height !== height)
    throw new Error(`${filename}: expected ${width} × ${height}.`);
  const canvas = createCanvas(width, height),
    ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, width, height).data;
  let left = width,
    right = -1,
    top = height,
    bottom = -1,
    transparent = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (pixels[i + 3] === 0) {
        transparent++;
        continue;
      }
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      if (
        kind === 'mask' &&
        (pixels[i] !== 255 || pixels[i + 1] !== 255 || pixels[i + 2] !== 255)
      )
        throw new Error(
          `${filename}: mask must use white RGB with shape in alpha.`,
        );
      if (
        kind === 'shading' &&
        filename !== 'belt-shading.png' &&
        (pixels[i] || pixels[i + 1] || pixels[i + 2])
      )
        throw new Error(
          `${filename}: shading must use black RGB with texture in alpha.`,
        );
    }
  if (right < left) throw new Error(`${filename}: image is empty.`);
  if (transparent < width * height * 0.1)
    throw new Error(
      `${filename}: real transparent background required; opaque checkerboards are not valid.`,
    );
  const bounds: Bounds = {
    x: left,
    y: top,
    width: right - left + 1,
    height: bottom - top + 1,
  };
  if (
    kind === 'watch' &&
    (left < 650 ||
      right > 730 ||
      top < 680 ||
      bottom > 755 ||
      bounds.width > 65 ||
      bounds.height > 65)
  )
    throw new Error(
      `${filename}: watch must be registered at the mannequin's left wrist.`,
    );
  return { bounds, pixels };
}

const previous = JSON.parse(
  await readFile(new URL('src/asset-status.json', root), 'utf8'),
) as { ready: ItemId[]; pending: ItemId[] };
const bounds = JSON.parse(
  await readFile(new URL('src/item-bounds.json', root), 'utf8'),
) as Record<ItemId, Bounds>;
const ready: ItemId[] = [],
  pending: ItemId[] = [];
await inspect('mannequin.png', 'base');
for (const id of Object.keys(ITEMS) as ItemId[]) {
  const files = assetFiles(id);
  const present = await Promise.all(
    files.map((file) => exists(new URL(`public/assets/${file}`, root))),
  );
  if (!present.some(Boolean)) {
    if (previous.ready.includes(id))
      throw new Error(`${id}: previously available assets are missing.`);
    pending.push(id);
    continue;
  }
  if (!present.every(Boolean))
    throw new Error(
      `${id}: both asset files must be present before activation.`,
    );
  const first = await inspect(files[0], isWatch(id) ? 'watch' : 'mask');
  await inspect(files[1], isWatch(id) ? 'thumbnail' : 'shading');
  if (id === 'trousers-long') {
    if (
      first.bounds.y !== bounds.trousers.y ||
      first.bounds.y + first.bounds.height <=
        bounds.trousers.y + bounds.trousers.height + 25
    )
      throw new Error(
        'Full-length trousers must retain the waistband position and cover the ankles.',
      );
    for (const [x, y] of [
      [450, 1320],
      [600, 1330],
    ])
      if (first.pixels[(y * SIZE.width + x) * 4 + 3] < 250)
        throw new Error(
          `Full-length trousers leave the ankle at ${x},${y} exposed.`,
        );
  }
  bounds[id] = first.bounds;
  ready.push(id);
}
// Enable the eight-watch collection together, rather than exposing a partial set.
const completeWatchSet = WATCH_IDS.every((id) => ready.includes(id));
if (!completeWatchSet)
  for (const id of WATCH_IDS) {
    const index = ready.indexOf(id);
    if (index >= 0) {
      ready.splice(index, 1);
      pending.push(id);
    }
  }
const status = { ready, pending };
const outputs = [
  ['src/asset-status.json', status],
  ['src/item-bounds.json', bounds],
] as const;
for (const [path, value] of outputs) {
  const target = new URL(path, root),
    serialized = `${JSON.stringify(value, null, 2)}\n`;
  if ((await readFile(target, 'utf8')) !== serialized)
    await writeFile(target, serialized);
}
console.log(
  `Assets verified: ${ready.length} ready, ${pending.length} awaiting images.`,
);
