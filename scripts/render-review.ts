import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { WardrobeRenderer } from '../src/renderer.ts';
import type { WardrobeImages } from '../src/renderer.ts';
import {
  ITEMS,
  SIZE,
  VIEW,
  WATCH_IDS,
  SECTIONS,
  initialOutfit,
  readyItemIds,
  isWatch,
} from '../src/wardrobe.ts';
import type { Outfit, ItemId, ColorId } from '../src/wardrobe.ts';

const root = new URL('../', import.meta.url);
const output = new URL('../../puppet-assets-v8/review/', import.meta.url);
await mkdir(output, { recursive: true });
const readImage = async (name: string) =>
  loadImage(await readFile(new URL(`public/assets/${name}.png`, root)));
const factory = (w: number, h: number) =>
  createCanvas(w, h) as unknown as HTMLCanvasElement;
const entries = await Promise.all(
  readyItemIds().map(async (id) => {
    const bounds = ITEMS[id].bounds;
    const crop = async (name: string) => {
      const canvas = factory(bounds.width, bounds.height);
      canvas
        .getContext('2d')!
        .drawImage(
          (await readImage(name)) as unknown as CanvasImageSource,
          -bounds.x,
          -bounds.y,
        );
      return canvas;
    };
    return [
      id,
      isWatch(id)
        ? {
            image: await crop(id),
            thumbnail: await readImage(`thumbnails/${id}`),
            bounds,
          }
        : {
            mask: await crop(`${id}-mask`),
            shading: await crop(`${id}-shading`),
            bounds,
          },
    ];
  }),
);
const renderer = new WardrobeRenderer(
  {
    base: await readImage('mannequin'),
    items: Object.fromEntries(entries),
  } as unknown as WardrobeImages,
  factory,
);
const looks: { label: string; outfit: Outfit }[] = [];
function look(
  label: string,
  sweater: ItemId | null,
  trousers: ItemId,
  shirt: 'polo' | 'shirt',
  color: ColorId,
  jacket = false,
) {
  const outfit = initialOutfit();
  outfit.layers.shirt.item = shirt;
  outfit.layers.shirt.color = 'white';
  outfit.layers.sweater.visible = Boolean(sweater);
  if (sweater) outfit.layers.sweater.item = sweater;
  outfit.layers.sweater.color = color;
  outfit.layers.trousers.item = trousers;
  outfit.layers.jacket.visible = jacket;
  outfit.layers.watch.visible = true;
  looks.push({ label, outfit });
}
look('Full-length business', null, 'trousers-long', 'polo', 'navy');
look('Regular linen', null, 'trousers-linen', 'shirt', 'navy');
look(
  'Crew neck + shirt',
  'sweater-crew',
  'trousers-long',
  'shirt',
  'navy-light',
);
look('Crew neck + polo', 'sweater-crew', 'trousers-linen', 'polo', 'burgundy');
look(
  'Troyer + shirt',
  'sweater-troyer',
  'trousers-long',
  'shirt',
  'cream-light',
);
look('Troyer + polo', 'sweater-troyer', 'trousers-linen', 'polo', 'olive');
look(
  'Crew + Harrington',
  'sweater-crew',
  'trousers-long',
  'shirt',
  'navy',
  true,
);
look(
  'Troyer + Harrington',
  'sweater-troyer',
  'trousers-linen',
  'polo',
  'gray-light',
  true,
);
const sheet = createCanvas(1600, 1420),
  ctx = sheet.getContext('2d');
ctx.fillStyle = '#ffffff';
ctx.fillRect(0, 0, sheet.width, sheet.height);
ctx.fillStyle = '#27342c';
ctx.font = '24px sans-serif';
for (let i = 0; i < looks.length; i++) {
  const { label, outfit } = looks[i];
  const x = (i % 4) * 400,
    y = Math.floor(i / 4) * 710;
  ctx.fillStyle = '#27342c';
  ctx.fillText(label, x + 18, y + 32);
  const canvas = renderer.compose(outfit);
  ctx.drawImage(
    canvas as never,
    VIEW.x,
    VIEW.y,
    VIEW.width,
    VIEW.height,
    x + 85,
    y + 45,
    225,
    640,
  );
  await writeFile(
    new URL(`outfit-${i + 1}.png`, output),
    (canvas as unknown as typeof sheet).toBuffer('image/png'),
  );
}
await writeFile(
  new URL('expanded-outfits.png', output),
  sheet.toBuffer('image/png'),
);
const collars = createCanvas(1200, 760),
  c = collars.getContext('2d');
c.fillStyle = '#fff';
c.fillRect(0, 0, 1200, 760);
for (let i = 2; i < looks.length; i++) {
  const x = ((i - 2) % 3) * 400,
    y = Math.floor((i - 2) / 3) * 380;
  c.fillStyle = '#27342c';
  c.font = '20px sans-serif';
  c.fillText(looks[i].label, x + 14, y + 28);
  c.drawImage(
    renderer.compose(looks[i].outfit) as never,
    395,
    210,
    250,
    200,
    x + 12,
    y + 48,
    375,
    300,
  );
}
await writeFile(
  new URL('collar-layering.png', output),
  collars.toBuffer('image/png'),
);
const necklines = createCanvas(1280, 720),
  n = necklines.getContext('2d');
n.fillStyle = '#fff';
n.fillRect(0, 0, necklines.width, necklines.height);
for (const [row, shirt] of (['polo', 'shirt'] as const).entries()) {
  for (const [column, mode] of ['white', 'navy', 'crew', 'troyer'].entries()) {
    const outfit = initialOutfit();
    for (const section of SECTIONS)
      outfit.layers[section.id].visible = section.id === 'shirt';
    outfit.layers.shirt.item = shirt;
    outfit.layers.shirt.color = mode === 'navy' ? 'navy' : 'white';
    if (mode === 'crew' || mode === 'troyer') {
      outfit.layers.sweater.visible = true;
      outfit.layers.sweater.item =
        mode === 'crew' ? 'sweater-crew' : 'sweater-troyer';
      outfit.layers.sweater.color = 'navy-light';
    }
    const x = column * 320,
      y = row * 360;
    n.fillStyle = '#27342c';
    n.font = '18px sans-serif';
    n.fillText(`${ITEMS[shirt].label} · ${mode}`, x + 15, y + 28);
    n.drawImage(
      renderer.compose(outfit) as never,
      385,
      212,
      270,
      235,
      x,
      y + 45,
      320,
      278,
    );
  }
}
await writeFile(
  new URL('collar-cleanup.png', output),
  necklines.toBuffer('image/png'),
);
const watches = createCanvas(800, 340),
  w = watches.getContext('2d');
w.fillStyle = '#fff';
w.fillRect(0, 0, 800, 340);
for (let i = 0; i < WATCH_IDS.length; i++) {
  const thumbnail = factory(176, 120),
    id = WATCH_IDS[i];
  renderer.thumbnail(thumbnail, id, 'white');
  const x = (i % 4) * 200,
    y = Math.floor(i / 4) * 170;
  w.drawImage(thumbnail as never, x + 12, y + 10);
  w.font = '17px sans-serif';
  w.fillStyle = '#27342c';
  w.fillText(ITEMS[id].label, x + 16, y + 151);
}
await writeFile(
  new URL('watch-models.png', output),
  watches.toBuffer('image/png'),
);
const wrists = createCanvas(1440, 800),
  wristContext = wrists.getContext('2d');
wristContext.fillStyle = '#fff';
wristContext.fillRect(0, 0, wrists.width, wrists.height);
for (const [row, sleeve] of [null, 'shirt', 'sweater', 'jacket'].entries()) {
  for (const [column, watch] of WATCH_IDS.entries()) {
    const outfit = initialOutfit();
    for (const section of SECTIONS)
      outfit.layers[section.id].visible =
        section.id === 'watch' || section.id === sleeve;
    outfit.layers.watch.item = watch;
    outfit.layers.shirt.item = 'shirt';
    outfit.layers.shirt.color = 'white';
    outfit.layers.sweater.item = 'sweater-crew';
    outfit.layers.sweater.color = 'navy-light';
    wristContext.drawImage(
      renderer.compose(outfit) as never,
      640,
      670,
      90,
      100,
      column * 180,
      row * 200,
      180,
      200,
    );
  }
}
await writeFile(
  new URL('watch-wrist-views.png', output),
  wrists.toBuffer('image/png'),
);
const additions: { label: string; outfit: Outfit }[] = [];
for (const [index, id] of [
  'jacket-polo-beige',
  'jacket-polo-navy',
  'coat-burberry',
  'jacket-quilted',
  'trousers-check',
].entries()) {
  const item = id as ItemId;
  const outfit = initialOutfit();
  outfit.layers.shirt.item = index === 0 || index === 4 ? 'polo' : 'shirt';
  outfit.layers.shirt.color = index === 3 ? 'blue' : 'white';
  outfit.layers.trousers.item =
    index % 2 === 0 ? 'trousers-check' : 'trousers-long';
  outfit.layers.trousers.color =
    index === 4 ? 'gray-light' : index % 2 === 0 ? 'gray-dark' : 'tan';
  outfit.layers.jacket.visible = index < 4;
  if (index < 4) {
    outfit.layers.jacket.item = item;
    outfit.layers.jacket.color = ITEMS[item].defaultColor!;
  }
  outfit.layers.sweater.visible = index === 1 || index === 2;
  outfit.layers.sweater.item = index === 1 ? 'sweater-crew' : 'sweater-troyer';
  outfit.layers.sweater.color = index === 1 ? 'cream-light' : 'gray-light';
  outfit.layers.watch.visible = true;
  additions.push({ label: ITEMS[item].label, outfit });
}
const newSheet = createCanvas(1600, 1000),
  ns = newSheet.getContext('2d');
ns.fillStyle = '#fff';
ns.fillRect(0, 0, newSheet.width, newSheet.height);
for (const [i, { label, outfit }] of additions.entries()) {
  const composed = renderer.compose(outfit);
  ns.fillStyle = '#27342c';
  ns.font = '22px sans-serif';
  ns.fillText(label, i * 320 + 28, 48);
  ns.drawImage(
    composed as never,
    VIEW.x,
    VIEW.y,
    VIEW.width,
    VIEW.height,
    i * 320 + 12,
    75,
    296,
    842,
  );
  await writeFile(
    new URL(`addition-${i + 1}.png`, output),
    (composed as unknown as typeof newSheet).toBuffer('image/png'),
  );
}
await writeFile(
  new URL('new-wardrobe-outfits.png', output),
  newSheet.toBuffer('image/png'),
);
const details = createCanvas(1600, 1000),
  dc = details.getContext('2d');
dc.fillStyle = '#fff';
dc.fillRect(0, 0, details.width, details.height);
for (let i = 0; i < 4; i++) {
  const composed = renderer.compose(additions[i].outfit);
  dc.fillStyle = '#27342c';
  dc.font = '20px sans-serif';
  dc.fillText(additions[i].label, i * 400 + 15, 32);
  dc.drawImage(composed as never, 360, 210, 320, 230, i * 400, 50, 400, 288);
  dc.drawImage(
    composed as never,
    635,
    650,
    110,
    200,
    i * 400 + 90,
    365,
    220,
    400,
  );
  const thumbnail = factory(176, 120);
  renderer.thumbnail(
    thumbnail,
    additions[i].outfit.layers.jacket.item,
    additions[i].outfit.layers.jacket.color,
  );
  dc.drawImage(thumbnail as never, i * 400 + 112, 820);
}
await writeFile(
  new URL('new-outerwear-details.png', output),
  details.toBuffer('image/png'),
);
const checks = createCanvas(1000, 850),
  pc = checks.getContext('2d');
pc.fillStyle = '#fff';
pc.fillRect(0, 0, checks.width, checks.height);
for (const [i, color] of (['gray-light', 'gray-dark'] as const).entries()) {
  const outfit = additions[4].outfit;
  outfit.layers.trousers.color = color;
  pc.drawImage(
    renderer.compose(outfit) as never,
    365,
    595,
    300,
    510,
    i * 500 + 20,
    45,
    460,
    782,
  );
}
await writeFile(
  new URL('check-pattern-light-dark.png', output),
  checks.toBuffer('image/png'),
);
console.log(
  `Wrote outfit, collar, and watch reviews (${SIZE.width} × ${SIZE.height} registered assets).`,
);
