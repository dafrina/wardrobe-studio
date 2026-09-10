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
  WATCH_IDS,
  isWatch,
  isItemReady,
  readyItemIds,
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
    readyItemIds().map(async (id) => {
      const bounds = ITEMS[id].bounds;
      const crop = async (suffix?: string) => {
        const image = await source(suffix ? `${id}-${suffix}` : id);
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
      if (isWatch(id))
        return [
          id,
          {
            image: await crop(),
            thumbnail: (await source(
              `thumbnails/${id}`,
            )) as unknown as CanvasImageSource,
            bounds,
          },
        ] as const;
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
  // Test-only colored sprites exercise fixed-color accessory compositing while
  // artwork is pending. These never enter public/assets or the app bundle.
  for (const id of WATCH_IDS)
    if (!images.items[id]) {
      const bounds = ITEMS[id].bounds;
      const sprite = factory(bounds.width, bounds.height),
        ctx = sprite.getContext('2d')!;
      ctx.fillStyle = '#76502d';
      ctx.fillRect(0, 0, bounds.width, bounds.height);
      ctx.fillStyle = '#d8e1de';
      ctx.fillRect(13, 2, 18, 25);
      const thumbnail = factory(176, 120);
      thumbnail.getContext('2d')!.drawImage(sprite, 10, 10, 156, 100);
      images.items[id] = { image: sprite, thumbnail, bounds };
    }
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
  minimumY = 0,
) {
  const high = renderer.garment(higher, color),
    highPixels = pixels(high);
  const lowPixels = pixels(renderer.garment(lower, 'burgundy'));
  const hb = ITEMS[higher].bounds,
    lb = ITEMS[lower].bounds;
  const result = pixels(renderer.compose(outfit));
  let checked = 0;
  for (
    let y = Math.max(hb.y, lb.y, minimumY);
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
      outfit.layers.shoes.color = 'brown-dark';
      outfit.layers.socks.item = sock;
      assertOccludes(outfit, shoe, sock, 'brown-dark');
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
  const belt = pixels(renderer.garment('belt', 'brown-dark'));
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
    const asset = images.items[id];
    if (!asset || !('mask' in asset)) continue;
    const mask = pixels(asset.mask as HTMLCanvasElement);
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
  for (let visibility = 0; visibility < 2 ** SECTIONS.length; visibility++)
    for (const tucked of [true, false]) {
      const outfit = initialOutfit();
      outfit.tucked = tucked;
      SECTIONS.forEach((section, i) => {
        outfit.layers[section.id].visible = Boolean(visibility & (1 << i));
      });
      const plan = layerPlan(outfit, () => true);
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

void test('shirt and polo rear collars remain behind the visible neck', () => {
  const base = pixels(renderer.compose(only()));
  for (const shirt of ['shirt', 'polo'] as const) {
    for (const color of ['white', 'navy'] as const) {
      const outfit = only('shirt');
      outfit.layers.shirt.item = shirt;
      outfit.layers.shirt.color = color;
      const result = pixels(renderer.compose(outfit));
      // This part of the neck is above the front collar. Rear collar fabric
      // must not paint over its skin, including at the lateral neck edges.
      for (let y = 235; y <= 245; y++)
        for (let x = 475; x <= 560; x++) {
          if (rgba(base, SIZE.width, x, y)[3] !== 255) continue;
          assert.deepEqual(
            rgba(result, SIZE.width, x, y),
            rgba(base, SIZE.width, x, y),
            `${shirt}: rear collar covers skin at ${x},${y}`,
          );
        }
    }
  }
});

void test('shirt and polo collars stay beneath the crew-neck sweater', () => {
  for (const shirt of ['shirt', 'polo'] as const) {
    const outfit = only('shirt', 'sweater');
    outfit.layers.shirt.item = shirt;
    outfit.layers.shirt.color = 'white';
    outfit.layers.sweater.item = 'sweater-crew';
    outfit.layers.sweater.color = 'navy';
    assertOccludes(outfit, 'sweater-crew', shirt, 'navy');
  }
});

for (const sweater of ['sweater-crew', 'sweater-troyer'] as const) {
  void test(
    `${sweater}: the underlying shirt cannot outline the outer sleeves`,
    { skip: !isItemReady(sweater) },
    () => {
      const outfit = only('sweater');
      outfit.layers.sweater.item = sweater;
      const baseline = pixels(renderer.compose(outfit));
      outfit.layers.shirt.item = 'shirt';
      outfit.layers.shirt.color = 'white';
      outfit.layers.shirt.visible = true;
      const dressed = pixels(renderer.compose(outfit));
      const bounds = ITEMS[sweater].bounds;
      const mask = pixels(renderer.garment(sweater, 'navy'));
      for (let y = 330; y <= 650; y += 10) {
        const occupied = Array.from(
          { length: bounds.width },
          (_, x) => x,
        ).filter(
          (x) => mask[((y - bounds.y) * bounds.width + x) * 4 + 3] >= 128,
        );
        for (const x of [
          occupied[0] + bounds.x - 3,
          occupied.at(-1)! + bounds.x + 3,
        ])
          assert.deepEqual(
            rgba(dressed, SIZE.width, x, y),
            rgba(baseline, SIZE.width, x, y),
          );
      }
    },
  );
  void test(
    `${sweater}: rear neck band cannot cross the mannequin's throat`,
    { skip: !isItemReady(sweater) },
    () => {
      const bounds = ITEMS[sweater].bounds;
      const mask = pixels(renderer.garment(sweater, 'white'));
      for (const [x, y] of [
        [510, 253],
        [530, 253],
        [520, 275],
      ])
        assert.equal(
          rgba(mask, bounds.width, x - bounds.x, y - bounds.y)[3],
          0,
        );
      const base = pixels(renderer.compose(only()));
      for (const shirt of ['polo', 'shirt'] as const) {
        const outfit = only('shirt', 'sweater');
        outfit.layers.shirt.item = shirt;
        outfit.layers.sweater.item = sweater;
        const rendered = pixels(renderer.compose(outfit));
        for (const [x, y] of [
          [510, 253],
          [530, 253],
        ])
          assert.deepEqual(
            rgba(rendered, SIZE.width, x, y),
            rgba(base, SIZE.width, x, y),
          );
      }
    },
  );
  void test(
    `${sweater}: body and cuffs conceal shirts, belt, and watch`,
    { skip: !isItemReady(sweater) },
    () => {
      for (const shirt of ['polo', 'shirt'] as const) {
        const outfit = only('shirt', 'sweater');
        outfit.layers.shirt.item = shirt;
        outfit.layers.sweater.item = sweater;
        outfit.layers.sweater.color = 'navy';
        for (const tucked of [true, false]) {
          outfit.tucked = tucked;
          assertOccludes(outfit, sweater, shirt, 'navy', 330);
        }
      }
      for (const section of ['belt', 'watch'] as const) {
        const outfit = only('sweater', section);
        outfit.layers.sweater.item = sweater;
        outfit.layers.sweater.color = 'navy';
        assertOccludes(outfit, sweater, outfit.layers[section].item, 'navy');
      }
      const jacket = only('sweater', 'jacket');
      jacket.layers.sweater.item = sweater;
      jacket.layers.jacket.color = 'tan';
      assertOccludes(jacket, 'jacket', sweater, 'tan');
    },
  );
}

void test(
  'linen trousers cover ankles and socks with a wider lower leg',
  { skip: !isItemReady('trousers-linen') },
  () => {
    const outfit = only('trousers', 'socks');
    outfit.layers.trousers.item = 'trousers-linen';
    outfit.layers.socks.item = 'socks-sport';
    assertOccludes(outfit, 'trousers-linen', 'socks-sport', 'tan');
    const bounds = ITEMS['trousers-linen'].bounds;
    const mask = pixels(renderer.garment('trousers-linen', 'white'));
    for (const [x, y] of [
      [450, 1320],
      [600, 1330],
    ])
      assert.ok(rgba(mask, bounds.width, x - bounds.x, y - bounds.y)[3] >= 250);
    const regular = pixels(renderer.garment('trousers', 'white'));
    const originalBounds = ITEMS.trousers.bounds;
    const widthAt = (data: Uint8ClampedArray, b: typeof bounds, y: number) => {
      let count = 0;
      for (let x = 0; x < b.width; x++)
        if (data[((y - b.y) * b.width + x) * 4 + 3] > 240) count++;
      return count;
    };
    assert.ok(
      widthAt(mask, bounds, 1200) > widthAt(regular, originalBounds, 1200),
    );
  },
);

void test('thumbnails render every clothing item and watch', () => {
  for (const id of Object.keys(images.items) as ItemId[]) {
    const thumbnail = factory(176, 120);
    renderer.thumbnail(thumbnail, id, 'tan');
    assert.ok(
      pixels(thumbnail).some((value, i) => i % 4 === 3 && value > 0),
      `${id} has a visible thumbnail`,
    );
  }
});

void test('watches offer eight fixed-color models and reject recoloring', () => {
  assert.equal(WATCH_IDS.length, 8);
  const state = initialOutfit();
  assert.equal(
    outfitReducer(state, {
      type: 'color',
      section: 'watch',
      color: 'burgundy',
    }),
    state,
  );
  for (const id of WATCH_IDS) {
    const original = pixels(renderer.garment(id, 'white'));
    for (const color of PALETTE)
      assert.deepEqual(pixels(renderer.garment(id, color.id)), original);
  }
});

void test('watch model is preserved when hidden and shown again', () => {
  let state = outfitReducer(
    initialOutfit(),
    {
      type: 'item',
      section: 'watch',
      item: 'watch-green-steel',
    },
    () => true,
  );
  state = outfitReducer(
    state,
    {
      type: 'visibility',
      section: 'watch',
      visible: false,
    },
    () => true,
  );
  state = outfitReducer(
    state,
    {
      type: 'visibility',
      section: 'watch',
      visible: true,
    },
    () => true,
  );
  assert.equal(state.layers.watch.item, 'watch-green-steel');
  assert.equal(
    outfitReducer(state, { type: 'item', section: 'watch', item: 'polo' }),
    state,
  );
});

void test('every watch strap reaches the inner wrist without a skin gap', () => {
  const base = factory(SIZE.width, SIZE.height);
  base.getContext('2d')!.drawImage(images.base, 0, 0);
  const skin = pixels(base);
  for (const id of WATCH_IDS) {
    const watch = renderer.garment(id, 'white');
    const data = pixels(watch),
      bounds = ITEMS[id].bounds;
    for (const y of [702, 704, 706]) {
      let edge = 650;
      while (edge < 715 && rgba(skin, SIZE.width, edge, y)[3] < 128) edge++;
      assert.ok(edge < 715, 'the anatomical wrist is present');
      const alpha = rgba(
        data,
        bounds.width,
        edge + 1 - bounds.x,
        y - bounds.y,
      )[3];
      assert.ok(
        alpha >= 160,
        `${id}: strap must meet the wrist edge at row ${y}`,
      );
    }
  }
});

void test('watch renderer respects both shirt and jacket cuffs', () => {
  for (const watch of WATCH_IDS)
    for (const sleeve of ['shirt', 'jacket'] as const) {
      const outfit = only('watch', sleeve);
      outfit.layers.watch.item = watch;
      outfit.layers[sleeve].item = sleeve;
      outfit.layers[sleeve].color = 'navy';
      assertOccludes(outfit, sleeve, watch, 'navy');
    }
});

void test(
  'full-length trousers retain the waistband and extend over the ankles',
  { skip: !isItemReady('trousers-long') },
  () => {
    const shortBounds = ITEMS.trousers.bounds;
    const longBounds = ITEMS['trousers-long'].bounds;
    assert.equal(longBounds.y, shortBounds.y);
    assert.ok(
      longBounds.y + longBounds.height >
        shortBounds.y + shortBounds.height + 25,
    );
    const shortOutfit = only('trousers', 'belt');
    const shortPixels = pixels(renderer.compose(shortOutfit));
    const longOutfit = only('trousers', 'belt');
    longOutfit.layers.trousers.item = 'trousers-long';
    const longPixels = pixels(renderer.compose(longOutfit));
    assert.deepEqual(
      longPixels.slice(0, SIZE.width * 1000 * 4),
      shortPixels.slice(0, SIZE.width * 1000 * 4),
      'waist, belt loops, seat, and thighs must stay exactly aligned',
    );
    const trousers = renderer.garment('trousers-long', 'tan');
    const longMask = pixels(trousers);
    for (const [x, y] of [
      [450, 1320],
      [600, 1330],
    ]) {
      assert.ok(
        rgba(
          longMask,
          longBounds.width,
          x - longBounds.x,
          y - longBounds.y,
        )[3] >= 250,
        `ankle at ${x},${y} is covered`,
      );
    }
    longOutfit.layers.belt.visible = false;
    longOutfit.layers.socks.visible = true;
    longOutfit.layers.socks.item = 'socks-sport';
    assertOccludes(longOutfit, 'trousers-long', 'socks-sport', 'tan');
  },
);

const newOuterwear = [
  'jacket-polo-beige',
  'jacket-polo-navy',
  'coat-burberry',
  'jacket-quilted',
] as const;
for (const jacket of newOuterwear) {
  void test(`${jacket}: open front shows underlayers and outer sleeves conceal them`, () => {
    assert.ok(isItemReady(jacket), 'new artwork must be installed');
    for (const sweater of [null, 'sweater-crew', 'sweater-troyer'] as const) {
      const outfit = only('shirt', ...(sweater ? (['sweater'] as const) : []));
      outfit.layers.shirt.item = 'shirt';
      outfit.layers.shirt.color = 'white';
      if (sweater) outfit.layers.sweater.item = sweater;
      outfit.layers.sweater.color = 'cream-light';
      const underneath = pixels(renderer.compose(outfit));
      outfit.layers.jacket.visible = true;
      outfit.layers.jacket.item = jacket;
      outfit.layers.jacket.color = 'navy';
      const result = pixels(renderer.compose(outfit));
      for (const y of [350, 480, 580])
        assert.deepEqual(
          rgba(result, SIZE.width, 516, y),
          rgba(underneath, SIZE.width, 516, y),
          'open center must show the actual underlayer',
        );
      assertOccludes(outfit, jacket, sweater ?? 'shirt', 'navy', 330);
      const jacketOnly = only('jacket');
      jacketOnly.layers.jacket = { ...outfit.layers.jacket };
      const baseline = pixels(renderer.compose(jacketOnly));
      const bounds = ITEMS[jacket].bounds,
        mask = pixels(renderer.garment(jacket, 'navy'));
      for (let y = 280; y <= 650; y += 10) {
        const row = Array.from({ length: bounds.width }, (_, x) => x).filter(
          (x) => mask[((y - bounds.y) * bounds.width + x) * 4 + 3] >= 128,
        );
        for (const x of [row[0] + bounds.x - 2, row.at(-1)! + bounds.x + 2])
          assert.deepEqual(
            rgba(result, SIZE.width, x, y),
            rgba(baseline, SIZE.width, x, y),
            'underlayer must not outline the outer shoulders or sleeves',
          );
      }
    }
    for (const watch of WATCH_IDS) {
      const outfit = only('jacket', 'watch');
      outfit.layers.jacket.item = jacket;
      outfit.layers.jacket.color = 'navy';
      outfit.layers.watch.item = watch;
      assertOccludes(outfit, jacket, watch, 'navy');
    }
    const base = pixels(renderer.compose(only()));
    const outfit = only('jacket');
    outfit.layers.jacket.item = jacket;
    const result = pixels(renderer.compose(outfit));
    for (let y = 235; y <= 245; y++)
      for (let x = 475; x <= 560; x++)
        if (rgba(base, SIZE.width, x, y)[3] === 255)
          assert.deepEqual(
            rgba(result, SIZE.width, x, y),
            rgba(base, SIZE.width, x, y),
            'rear collar must not paint over the neck',
          );
  });
}

void test('long coat covers trousers below the knees, with hands in front and its center open', () => {
  const outfit = only('jacket', 'trousers');
  outfit.layers.jacket.item = 'coat-burberry';
  outfit.layers.jacket.color = 'black';
  outfit.layers.trousers.item = 'trousers-check';
  assertOccludes(outfit, 'coat-burberry', 'trousers-check', 'black', 750);
  const bounds = ITEMS['coat-burberry'].bounds;
  assert.ok(
    bounds.y + bounds.height >= 1030 && bounds.y + bounds.height <= 1070,
    'coat hem is just below the knees',
  );
  const result = pixels(renderer.compose(outfit)),
    base = pixels(renderer.compose(only()));
  outfit.layers.jacket.visible = false;
  const withoutCoat = pixels(renderer.compose(outfit));
  let handPixels = 0;
  // Check exposed skin beside the trousers, excluding the adjacent hip.
  for (let y = 725; y <= 835; y++)
    for (const [left, right] of [
      [310, 377],
      [642, 720],
    ])
      for (let x = left; x <= right; x++) {
        if (rgba(base, SIZE.width, x, y)[3] !== 255) continue;
        if (
          !rgba(withoutCoat, SIZE.width, x, y).every(
            (value, channel) => value === rgba(base, SIZE.width, x, y)[channel],
          )
        )
          continue;
        assert.deepEqual(
          rgba(result, SIZE.width, x, y),
          rgba(base, SIZE.width, x, y),
          `coat skirt must sit behind the hand at ${x},${y}`,
        );
        handPixels++;
      }
  assert.ok(handPixels > 1000, 'check both actual hands');
  const coat = pixels(renderer.garment('coat-burberry', 'black'));
  for (const [x, y] of [
    [638, 760],
    [642, 725],
    [638, 820],
  ])
    assert.ok(
      rgba(coat, bounds.width, x - bounds.x, y - bounds.y)[3] >= 250,
      'hand cutout must not remove the coat over the adjacent hip',
    );
  for (const y of [750, 900, 1030])
    assert.deepEqual(
      rgba(result, SIZE.width, 516, y),
      rgba(withoutCoat, SIZE.width, 516, y),
    );
});

void test('check trousers preserve the full-length silhouette and waistband while adding fabric shading', () => {
  const check = images.items['trousers-check'] as {
    mask: HTMLCanvasElement;
    shading: HTMLCanvasElement;
    bounds: (typeof ITEMS)['trousers-check']['bounds'];
  };
  const plain = images.items['trousers-long'] as typeof check;
  assert.deepEqual(check.bounds, plain.bounds);
  assert.deepEqual(pixels(check.mask), pixels(plain.mask));
  const newShade = pixels(check.shading),
    oldShade = pixels(plain.shading);
  assert.deepEqual(
    newShade.slice(0, (637 - check.bounds.y) * check.bounds.width * 4),
    oldShade.slice(0, (637 - check.bounds.y) * check.bounds.width * 4),
    'belt loops and waistband stay registered',
  );
  let changed = 0;
  for (let p = 3; p < newShade.length; p += 4)
    if (newShade[p] !== oldShade[p]) changed++;
  assert.ok(
    changed > 10000,
    'patterned trousers must have distinct fabric shading',
  );
  const outfit = only('trousers', 'socks');
  outfit.layers.trousers.item = 'trousers-check';
  outfit.layers.socks.item = 'socks-sport';
  assertOccludes(outfit, 'trousers-check', 'socks-sport', 'tan');
});

void test('new designs start in reference colors, and keep a custom color when reselected or toggled', () => {
  for (const item of [...newOuterwear, 'trousers-check'] as const) {
    const section = item === 'trousers-check' ? 'trousers' : 'jacket';
    let state = outfitReducer(initialOutfit(), { type: 'item', section, item });
    assert.equal(state.layers[section].item, item);
    assert.equal(state.layers[section].color, ITEMS[item].defaultColor);
    state = outfitReducer(state, { type: 'color', section, color: 'olive' });
    state = outfitReducer(state, { type: 'item', section, item });
    state = outfitReducer(state, {
      type: 'visibility',
      section,
      visible: false,
    });
    state = outfitReducer(state, {
      type: 'visibility',
      section,
      visible: true,
    });
    assert.deepEqual(state.layers[section], {
      item,
      color: 'olive',
      visible: true,
    });
  }
});

void test('pending images cannot be selected or shown and are omitted from rendering', () => {
  const pending = (Object.keys(ITEMS) as ItemId[]).filter(
    (id) => !isItemReady(id),
  );
  for (const item of pending) {
    const section = SECTIONS.find((s) => s.items.includes(item))!.id;
    const state = initialOutfit();
    assert.equal(outfitReducer(state, { type: 'item', section, item }), state);
    const stale = {
      ...state,
      layers: {
        ...state.layers,
        [section]: { ...state.layers[section], item, visible: false },
      },
    };
    assert.equal(
      outfitReducer(stale, { type: 'visibility', section, visible: true }),
      stale,
    );
    stale.layers[section].visible = true;
    assert.ok(
      !layerPlan(stale).some(
        (step) => step.kind === 'garment' && step.choice.item === item,
      ),
    );
  }
});

void test('missing optional images never prevent existing clothing from rendering', () => {
  const existing = {
    ...images,
    items: Object.fromEntries(
      readyItemIds().map((id) => [id, images.items[id]]),
    ),
  };
  const safeRenderer = new WardrobeRenderer(existing, factory);
  const outfit = initialOutfit();
  outfit.layers.watch.visible = false;
  const baseline = pixels(safeRenderer.compose(outfit));
  if (!isItemReady(outfit.layers.watch.item)) {
    outfit.layers.watch.visible = true;
    assert.deepEqual(pixels(safeRenderer.compose(outfit)), baseline);
  }
  assert.ok(baseline.some((value, index) => index % 4 === 3 && value > 0));
});
