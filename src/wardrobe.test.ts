import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { WardrobeRenderer } from './renderer.ts';
import type { WardrobeImages } from './renderer.ts';
import {
  BELT_LOOPS,
  ITEMS,
  PALETTE,
  SECTIONS,
  SIZE,
  initialOutfit,
  layerPlan,
  outfitReducer,
} from './wardrobe.ts';
import type { ColorId, ItemId, Outfit, SectionId } from './wardrobe.ts';

const factory = (w: number, h: number) =>
  createCanvas(w, h) as unknown as HTMLCanvasElement;
const pixels = (canvas: HTMLCanvasElement) =>
  canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
const rgba = (data: Uint8ClampedArray, width: number, x: number, y: number) =>
  Array.from(data.slice((y * width + x) * 4, (y * width + x) * 4 + 4));
let renderer: WardrobeRenderer;
let images: WardrobeImages;

before(async () => {
  const source = async (name: string) =>
    loadImage(
      await readFile(new URL(`../public/assets/${name}.png`, import.meta.url)),
    );
  const base = await source('mannequin');
  assert.equal(base.width, SIZE.width);
  assert.equal(base.height, SIZE.height);
  const entries = await Promise.all(
    (Object.keys(ITEMS) as ItemId[]).map(async (id) => {
      const bounds = ITEMS[id].bounds;
      const crop = async (suffix: string) => {
        const image = await source(`${id}-${suffix}`);
        assert.equal(
          image.width,
          SIZE.width,
          `${id} ${suffix}: shared canvas width`,
        );
        assert.equal(
          image.height,
          SIZE.height,
          `${id} ${suffix}: shared canvas height`,
        );
        const canvas = factory(bounds.width, bounds.height);
        canvas
          .getContext('2d')!
          .drawImage(
            image as unknown as CanvasImageSource,
            -bounds.x,
            -bounds.y,
          );
        return canvas;
      };
      return [
        id,
        { mask: await crop('mask'), shading: await crop('shading'), bounds },
      ] as const;
    }),
  );
  images = {
    base: base as unknown as CanvasImageSource,
    items: Object.fromEntries(entries) as WardrobeImages['items'],
  };
  renderer = new WardrobeRenderer(images, factory);
});

function only(...sections: SectionId[]): Outfit {
  const outfit = initialOutfit();
  for (const section of SECTIONS)
    outfit.layers[section.id].visible = sections.includes(section.id);
  return outfit;
}

// Verify actual rendered pixels, using fully opaque intersections to avoid
// conflating correct antialiased boundaries with lower-layer bleed-through.
function assertOccludes(
  outfit: Outfit,
  higher: ItemId,
  lower: ItemId,
  color: ColorId,
) {
  const high = renderer.garment(higher, color),
    highPixels = pixels(high);
  const lowPixels = pixels(renderer.garment(lower, 'burgundy'));
  const hb = ITEMS[higher].bounds,
    lb = ITEMS[lower].bounds;
  const result = pixels(renderer.compose(outfit));
  let checked = 0;
  for (
    let y = Math.max(hb.y, lb.y);
    y < Math.min(hb.y + hb.height, lb.y + lb.height);
    y++
  ) {
    for (
      let x = Math.max(hb.x, lb.x);
      x < Math.min(hb.x + hb.width, lb.x + lb.width);
      x++
    ) {
      const hi = ((y - hb.y) * hb.width + x - hb.x) * 4;
      const lo = ((y - lb.y) * lb.width + x - lb.x) * 4;
      if (highPixels[hi + 3] !== 255 || lowPixels[lo + 3] !== 255) continue;
      assert.deepEqual(
        rgba(result, SIZE.width, x, y),
        Array.from(highPixels.slice(hi, hi + 4)),
        `${higher} must cover ${lower} at ${x},${y}`,
      );
      checked++;
    }
  }
  assert.ok(
    checked > 20,
    `${higher}/${lower} must have a meaningful real-image overlap (found ${checked})`,
  );
}

void test('mask applies once, keeping antialiasing and transparent cutouts', () => {
  const mask = factory(2, 1),
    shade = factory(2, 1);
  const m = mask.getContext('2d')!,
    s = shade.getContext('2d')!;
  m.fillStyle = 'rgba(255,255,255,0.5)';
  m.fillRect(0, 0, 1, 1);
  s.fillStyle = 'rgba(0,0,0,0.5)';
  s.fillRect(0, 0, 2, 1);
  const fixture: WardrobeImages = {
    ...images,
    items: {
      ...images.items,
      polo: {
        mask,
        shading: shade,
        bounds: { x: 0, y: 0, width: 2, height: 1 },
      },
    },
  };
  const patch = new WardrobeRenderer(fixture, factory).garment('polo', 'white');
  const p = pixels(patch);
  assert.ok(
    p[3] >= 127 && p[3] <= 128,
    'edge opacity must not be multiplied twice',
  );
  assert.ok(
    p[0] >= 123 && p[0] <= 127,
    'black shading must blend over the flat color',
  );
  assert.equal(p[7], 0, 'a mask hole remains fully transparent');
});

void test('hiding every section gives the original mannequin exactly', () => {
  const expected = factory(SIZE.width, SIZE.height);
  expected.getContext('2d')!.drawImage(images.base, 0, 0);
  assert.deepEqual(pixels(renderer.compose(only())), pixels(expected));
});

for (const shirt of ['polo', 'shirt'] as const) {
  void test(`${shirt}: tucking really moves the hem behind trousers`, () => {
    const outfit = only('shirt', 'trousers');
    outfit.layers.shirt.item = shirt;
    outfit.layers.shirt.color = 'blue';
    outfit.layers.trousers.color = 'tan';
    outfit.tucked = true;
    assertOccludes(outfit, 'trousers', shirt, 'tan');
    outfit.tucked = false;
    assertOccludes(outfit, shirt, 'trousers', 'blue');
  });
  void test(`jacket covers ${shirt} for tucked and untucked outfits`, () => {
    for (const tucked of [true, false]) {
      const outfit = only('shirt', 'jacket');
      outfit.tucked = tucked;
      outfit.layers.shirt.item = shirt;
      outfit.layers.jacket.color = 'navy';
      assertOccludes(outfit, 'jacket', shirt, 'navy');
    }
  });
}

for (const shoe of ['loafers', 'sneakers'] as const) {
  for (const sock of ['socks-low', 'socks-sport'] as const) {
    void test(`${shoe} covers ${sock} at their shared edges`, () => {
      const outfit = only('shoes', 'socks');
      outfit.layers.shoes.item = shoe;
      outfit.layers.shoes.color = 'brown';
      outfit.layers.socks.item = sock;
      assertOccludes(outfit, shoe, sock, 'brown');
    });
  }
}

void test('trouser hems cover sport socks', () => {
  const outfit = only('trousers', 'socks');
  outfit.layers.socks.item = 'socks-sport';
  assertOccludes(outfit, 'trousers', 'socks-sport', 'tan');
});

void test('belt remains above the waistband, with both trouser belt loops in front', () => {
  const outfit = only('trousers', 'belt');
  const rendered = pixels(renderer.compose(outfit));
  const trousers = pixels(renderer.garment('trousers', 'tan'));
  const belt = pixels(renderer.garment('belt', 'brown'));
  const tb = ITEMS.trousers.bounds,
    bb = ITEMS.belt.bounds;
  let loopPixels = 0,
    beltPixels = 0;
  for (let y = bb.y; y < bb.y + bb.height; y++)
    for (let x = bb.x; x < bb.x + bb.width; x++) {
      const bi = ((y - bb.y) * bb.width + x - bb.x) * 4;
      if (belt[bi + 3] !== 255) continue;
      const loop = BELT_LOOPS.some(
        (b) => x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height,
      );
      if (loop) {
        const ti = ((y - tb.y) * tb.width + x - tb.x) * 4;
        if (trousers[ti + 3] !== 255) continue;
        assert.deepEqual(
          rgba(rendered, SIZE.width, x, y),
          Array.from(trousers.slice(ti, ti + 4)),
        );
        loopPixels++;
      } else {
        assert.deepEqual(
          rgba(rendered, SIZE.width, x, y),
          Array.from(belt.slice(bi, bi + 4)),
        );
        beltPixels++;
      }
    }
  assert.ok(loopPixels > 100 && beltPixels > 100);
});

void test('every garment keeps the same silhouette in every palette color', () => {
  for (const id of Object.keys(ITEMS) as ItemId[]) {
    const mask = pixels(images.items[id].mask as HTMLCanvasElement);
    for (const color of PALETTE) {
      const garment = pixels(renderer.garment(id, color.id));
      for (let p = 3; p < mask.length; p += 4)
        assert.equal(
          garment[p],
          mask[p],
          `${id}/${color.id}: mask alpha differs`,
        );
    }
  }
});

void test('all visibility/tuck combinations include exactly the enabled garments', () => {
  for (let visibility = 0; visibility < 64; visibility++)
    for (const tucked of [true, false]) {
      const outfit = initialOutfit();
      outfit.tucked = tucked;
      SECTIONS.forEach((section, i) => {
        outfit.layers[section.id].visible = Boolean(visibility & (1 << i));
      });
      const plan = layerPlan(outfit);
      const actual = plan
        .filter((s) => s.kind === 'garment')
        .map((s) => s.section)
        .sort();
      assert.deepEqual(
        actual,
        SECTIONS.filter((s) => outfit.layers[s.id].visible)
          .map((s) => s.id)
          .sort(),
      );
      assert.equal(
        plan.filter((s) => s.kind === 'belt-loops').length,
        Number(outfit.layers.belt.visible && outfit.layers.trousers.visible),
      );
    }
});

void test('visibility switches retain clothing type and color, and reset restores the reference outfit', () => {
  let state = initialOutfit();
  state = outfitReducer(state, {
    type: 'item',
    section: 'shoes',
    item: 'sneakers',
  });
  state = outfitReducer(state, {
    type: 'color',
    section: 'shoes',
    color: 'navy',
  });
  state = outfitReducer(state, {
    type: 'visibility',
    section: 'shoes',
    visible: false,
  });
  state = outfitReducer(state, {
    type: 'visibility',
    section: 'shoes',
    visible: true,
  });
  assert.deepEqual(state.layers.shoes, {
    item: 'sneakers',
    color: 'navy',
    visible: true,
  });
  assert.deepEqual(outfitReducer(state, { type: 'reset' }), initialOutfit());
});

void test('garment selection cannot place a shoe in the shirt layer', () => {
  const state = initialOutfit();
  assert.equal(
    outfitReducer(state, { type: 'item', section: 'shirt', item: 'sneakers' }),
    state,
  );
});

void test('thumbnails render all nine actual clothing assets', () => {
  for (const id of Object.keys(ITEMS) as ItemId[]) {
    const thumbnail = factory(176, 120);
    renderer.thumbnail(thumbnail, id, 'tan');
    assert.ok(
      pixels(thumbnail).some((value, i) => i % 4 === 3 && value > 0),
      `${id} has a visible thumbnail`,
    );
  }
});
