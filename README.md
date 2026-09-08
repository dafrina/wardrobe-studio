# Wardrobe Studio

A React + Vite dress-up app using the approved mannequin and clothing assets. Run `npm install` followed by `npm run dev`. Requires Node 22.13 or newer.

## Controls

- Six sections with independent show/hide switches, clothing thumbnails, and eleven colors.
- Polo or shirt, Harrington jacket, leather belt, tailored trousers, loafers or sneakers, and low or sport socks.
- Tuck in shirt changes the drawing order at the waistband. Hidden sections retain their selected item and color. Reset restores the reference outfit.
- Desktop controls scroll beside the mannequin; mobile uses the section tabs.

## Assets and rendering

All 19 PNGs in `public/assets` retain their shared 1024 × 1536 canvas. The app crops blank margins when decoding each garment, using `src/item-bounds.json`, and draws the result at its original coordinates.

Each garment is rendered as flat color, then shading, then `destination-in` mask. The mask is applied once, preserving transparent neck/shoe openings and antialiased edges. Shading is alpha black, except for fixed silver buckle detail. Black uses a near-black tone so folds remain visible.

The order is mannequin → socks → shoes → tucked shirt → trousers → belt → trouser belt loops → untucked shirt → jacket. Disabled sections are omitted. Belt loops reuse small clipped areas of the trousers; they do not require extra images. Thumbnails use the same renderer and assets as the mannequin.

`src/wardrobe.ts` holds the outfit state, palette, and layer order. `src/renderer.ts` loads and composites images, with a bounded cache of colored garment canvases. `src/App.tsx` supplies the React controls, using the generated Shadcn/Base UI switch and radio primitives.

## Validation

- `npm test`: real-image pixel checks for garment occlusion, shirt tucking, belt loops, all nine items in eleven colors, transparency, thumbnails, and visibility state.
- `npm run lint`: app code and the UI primitives it uses.
- `npm run build`: TypeScript validation and the production Vite build in `dist`.

The app runs entirely in the browser. Clothing selections last for the current session; no account data or outfit data is stored on a server.
