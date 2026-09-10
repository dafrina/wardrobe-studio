# Wardrobe Studio

A React + Vite dress-up app using the approved mannequin and clothing assets. Run `npm install` followed by `npm run dev`. Requires Node 22.13 or newer.

## Controls

- Eight sections with independent show/hide switches and clothing thumbnails. Clothes have fourteen colors; watches retain their model's original colors.
- Polo or shirt, troyer or crew-neck sweater, five outerwear choices, leather belt, four trouser choices, loafers or sneakers, low or sport socks, and eight watch models. Outerwear includes the Harrington, lightweight and cotton Polo jackets, a below-knee Burberry coat, and a diamond-quilted jacket. Trousers include ankle-length and full-length business cuts, regular linen, and subtle checks.
- Tuck in shirt changes the drawing order at the waistband. Hidden sections retain their selected item and color. Reset restores the reference outfit.
- Desktop controls scroll beside the mannequin; mobile uses the section tabs.

## Assets and rendering

All 26 items are available. The 45 mannequin, clothing, and watch PNGs in `public/assets` share a 1024 × 1536 canvas, with eight additional 176 × 120 watch thumbnails. The app crops blank margins when decoding each garment, using `src/item-bounds.json`, and draws the result at its original coordinates.

Each garment is rendered as flat color, then shading, then `destination-in` mask. The mask is applied once, preserving transparent neck/shoe openings and antialiased edges. Shading is alpha black, except for fixed silver buckle detail. Black uses a near-black tone so folds remain visible.

The order is mannequin → watch → socks → shoes → tucked shirt → trousers → belt → trouser belt loops → untucked shirt → sweater → jacket. Disabled and unavailable sections are omitted. Collars stay tucked beneath both the crew neck and troyer, appearing only through each sweater's transparent neck opening. Watch faces sit on the mannequin's left wrist (viewer right), underneath long shirt, sweater, and jacket cuffs. Belt loops reuse small clipped areas of the selected trousers; they do not require extra images. Clothing thumbnails use the same renderer and assets as the mannequin.

Shirts beneath sweaters and both tops beneath jackets follow the outer shoulder and sleeve contour to prevent an underlayer outline around darker outerwear. The original untucked hem and longer shirt cuffs can still show below. Neck masks remove rear collar fabric while preserving the front neckline. All four new outerwear designs have transparent open fronts; the long coat also has registered hand cutouts, with the skirt behind the fingers and above the trousers.

New designs start in the reference colors when selected: tan lightweight Polo, navy cotton Polo, black Burberry coat, navy quilted jacket, and dark gray check trousers. They all use the full palette. Reselecting the current model or toggling visibility retains its custom color. The check pattern is part of the alpha-black shading, so it changes with the trouser fabric rather than staying a fixed color.

The palette includes the original navy and dark green plus light navy and olive. The original brown `#795337` is replaced by dark brown `#6D4B32` and light brown `#855B3D`, calculated with RGB brightness factors of 0.9 and 1.1, rounded to the nearest channel value.

## Asset validation

New artwork is validated before becoming selectable. Pending choices are clearly labeled and disabled, so no missing-image requests or blank mannequin occur. Invalid opaque drafts live outside this app and are not served.

`npm run assets:sync` validates available files, calculates exact content bounds, and updates `src/asset-status.json` and `src/item-bounds.json`. It also runs before `npm run dev` and `npm run build`. The app loads only ready items. A partial pair, previously available but missing file, wrong size, empty image, opaque background, or invalid mask/shading format fails validation. The watch collection activates once all eight models are valid.

For future asset updates:

1. Clothing uses `<id>-mask.png` and `<id>-shading.png`, both 1024 × 1536. Preserve the waist and belt-loop registration. Full-length business trousers retain the original upper 1000 rows exactly; both new trouser cuts cover the ankles.
2. Each watch uses `public/assets/<id>.png` with a fixed-color cutout on a transparent 1024 × 1536 canvas. The face is shown at a three-quarter angle on the outside of the wrist, centered near y704. The fitted v6 watches are enlarged uniformly by 1.05 around the left wrist anchor (668, 704), preserving strap contact and case proportions. Placement is checked against the shirt, sweater, and jacket cuffs. The matching 176 × 120 thumbnail at `public/assets/thumbnails/<id>.png` retains the approved frontal view for easy model selection.
3. Run `npm run assets:sync`, `npm test`, and `npm run build`. Inspect the new ankle coverage and wrist/cuff alignment before considering the artwork finished.

Watch IDs: `watch-rectangular-brown`, `watch-two-tone`, `watch-green-steel`, `watch-gold-leather`, `watch-blue-chrono`, `watch-navy-field`, `watch-black-steel`, `watch-white-steel`. These correspond to the eight men's watches in the supplied photo; the small gold ladies' watch is excluded.

`src/wardrobe.ts` holds the outfit state, palette, and layer order. `src/renderer.ts` loads and composites images, with a bounded cache of colored garment canvases. `src/App.tsx` supplies the React controls, using the generated Shadcn/Base UI switch and radio primitives.

## Validation

- `npm test`: 40 real-image and state checks for garment layering, open jacket fronts, neck openings, shirt collars and sleeve edges, coat length and hand cutouts, trouser registration, ankle coverage, fixed-color watches, wrist contact, cuff occlusion, reference colors, type selection, and visibility state. All current assets are tested with their actual production images.
- `npm run lint`: app code and the UI primitives it uses.
- `npm run build`: TypeScript validation and the production Vite build in `dist`.
- `node --experimental-strip-types scripts/render-review.ts`: exports outfit, collar, watch, new outerwear, and light/dark check-pattern contact sheets to the sibling `puppet-assets-v8/review` directory.

The new artwork was generated with the built-in image generator. Masters, generation prompts, extraction/registration scripts, and review sheets are preserved in the sibling `puppet-assets-v4` directory. The clothing uses `garment-prompts.json`; the watches use `watch-prompts.json` and `watch-correction.json`. The fixed watch colors match eight watches from the user's photo; the small gold ladies' watch is excluded.

The compact collar and angled watch masters are preserved in `puppet-assets-v5`. Wrist fitting is recorded in `puppet-assets-v6/register-watches.cjs`; the requested 5% enlargement around the fixed left wrist anchor is in `puppet-assets-v7/scale-watches.mjs`.

The final shirt and polo cleanup is in `puppet-assets-v7/collars`, including the built-in image edits, prompts, registered masks/shading, and before/after reviews. Changes are confined to the neckline, shoulder joins, and placket within x350–689, y207–429. The rear collar is occluded by the mannequin's neck, and one registered silhouette prevents duplicate shoulder outlines. The lower torso and hems retain their original registration. The crew neck covers both collars without a separate collar overlay. A real-image regression test checks that the upper neck skin remains unchanged with either top in light and dark colors.

The five additions from `Ggg.zip` are preserved in `puppet-assets-v8`: original reference images, five built-in image-generation masters and final prompts, `process-assets.cjs` for chroma extraction/registration and mask/shading separation, and actual-renderer review sheets. The check trousers reuse the approved full-length silhouette and waistband; the pattern is registered into that shape. See that directory's README for the source-to-item mapping.

The app runs entirely in the browser. Clothing selections last for the current session; no account data or outfit data is stored on a server.
