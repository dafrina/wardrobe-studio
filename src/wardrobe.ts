import itemBounds from './item-bounds.json' with { type: 'json' };
import assetStatus from './asset-status.json' with { type: 'json' };

export const SIZE = { width: 1024, height: 1536 } as const;
export const VIEW = { x: 255, y: 27, width: 510, height: 1450 } as const;
export const PALETTE = [
  { id: 'white', label: 'White', hex: '#FAFAF8' },
  { id: 'black', label: 'Black', hex: '#24262A' },
  { id: 'cream-light', label: 'Cream light', hex: '#F0E7D5' },
  { id: 'tan', label: 'Sand / tan', hex: '#CFB997' },
  { id: 'navy', label: 'Navy', hex: '#26364B' },
  { id: 'navy-light', label: 'Light navy', hex: '#435C78' },
  { id: 'green', label: 'Dark green', hex: '#244436' },
  { id: 'olive', label: 'Olive', hex: '#748052' },
  { id: 'blue', label: 'Light blue', hex: '#B7CDDD' },
  { id: 'burgundy', label: 'Burgundy', hex: '#733D48' },
  { id: 'gray-light', label: 'Light gray', hex: '#CDD0CF' },
  { id: 'gray-dark', label: 'Dark gray', hex: '#5B6064' },
  { id: 'brown-dark', label: 'Dark brown', hex: '#6D4B32' },
  { id: 'brown-light', label: 'Light brown', hex: '#855B3D' },
] as const;
export type ColorId = (typeof PALETTE)[number]['id'];
export type SectionId =
  | 'shirt'
  | 'sweater'
  | 'jacket'
  | 'belt'
  | 'trousers'
  | 'shoes'
  | 'socks'
  | 'watch';
export const WATCH_IDS = [
  'watch-rectangular-brown',
  'watch-two-tone',
  'watch-green-steel',
  'watch-gold-leather',
  'watch-blue-chrono',
  'watch-navy-field',
  'watch-black-steel',
  'watch-white-steel',
] as const;
export type WatchId = (typeof WATCH_IDS)[number];
export type ItemId =
  | 'polo'
  | 'shirt'
  | 'jacket'
  | 'jacket-polo-beige'
  | 'jacket-polo-navy'
  | 'coat-burberry'
  | 'jacket-quilted'
  | 'belt'
  | 'trousers'
  | 'trousers-long'
  | 'trousers-linen'
  | 'trousers-check'
  | 'sweater-troyer'
  | 'sweater-crew'
  | 'loafers'
  | 'sneakers'
  | 'socks-low'
  | 'socks-sport'
  | WatchId;
export const isWatch = (id: ItemId): id is WatchId =>
  WATCH_IDS.includes(id as WatchId);
export const isItemReady = (id: ItemId): boolean =>
  assetStatus.ready.includes(id);
export const readyItemIds = (): ItemId[] =>
  (Object.keys(ITEMS) as ItemId[]).filter(isItemReady);
export function assetFiles(id: ItemId): string[] {
  return isWatch(id)
    ? [`${id}.png`, `thumbnails/${id}.png`]
    : [`${id}-mask.png`, `${id}-shading.png`];
}
export type Bounds = { x: number; y: number; width: number; height: number };
export const ITEMS: Record<
  ItemId,
  { label: string; bounds: Bounds; defaultColor?: ColorId }
> = {
  polo: { label: 'Polo', bounds: itemBounds.polo },
  shirt: { label: 'Shirt', bounds: itemBounds.shirt },
  jacket: { label: 'Harrington', bounds: itemBounds.jacket },
  'jacket-polo-beige': {
    label: 'Polo lightweight',
    bounds: itemBounds['jacket-polo-beige'],
    defaultColor: 'tan',
  },
  'jacket-polo-navy': {
    label: 'Polo cotton',
    bounds: itemBounds['jacket-polo-navy'],
    defaultColor: 'navy',
  },
  'coat-burberry': {
    label: 'Burberry coat',
    bounds: itemBounds['coat-burberry'],
    defaultColor: 'black',
  },
  'jacket-quilted': {
    label: 'Quilted jacket',
    bounds: itemBounds['jacket-quilted'],
    defaultColor: 'navy',
  },
  belt: { label: 'Leather belt', bounds: itemBounds.belt },
  trousers: { label: 'Ankle length', bounds: itemBounds.trousers },
  'trousers-long': {
    label: 'Full length',
    bounds: itemBounds['trousers-long'],
  },
  'trousers-linen': {
    label: 'Regular linen',
    bounds: itemBounds['trousers-linen'],
  },
  'trousers-check': {
    label: 'Subtle check',
    bounds: itemBounds['trousers-check'],
    defaultColor: 'gray-dark',
  },
  'sweater-troyer': { label: 'Troyer', bounds: itemBounds['sweater-troyer'] },
  'sweater-crew': { label: 'Crew neck', bounds: itemBounds['sweater-crew'] },
  loafers: { label: 'Loafers', bounds: itemBounds.loafers },
  sneakers: { label: 'Sneakers', bounds: itemBounds.sneakers },
  'socks-low': { label: 'Low socks', bounds: itemBounds['socks-low'] },
  'socks-sport': { label: 'Sport socks', bounds: itemBounds['socks-sport'] },
  'watch-rectangular-brown': {
    label: 'Rectangular',
    bounds: itemBounds['watch-rectangular-brown'],
  },
  'watch-two-tone': { label: 'Two tone', bounds: itemBounds['watch-two-tone'] },
  'watch-green-steel': {
    label: 'Green steel',
    bounds: itemBounds['watch-green-steel'],
  },
  'watch-gold-leather': {
    label: 'Gold leather',
    bounds: itemBounds['watch-gold-leather'],
  },
  'watch-blue-chrono': {
    label: 'Blue chrono',
    bounds: itemBounds['watch-blue-chrono'],
  },
  'watch-navy-field': {
    label: 'Navy field',
    bounds: itemBounds['watch-navy-field'],
  },
  'watch-black-steel': {
    label: 'Black steel',
    bounds: itemBounds['watch-black-steel'],
  },
  'watch-white-steel': {
    label: 'White steel',
    bounds: itemBounds['watch-white-steel'],
  },
};
export const SECTIONS: { id: SectionId; label: string; items: ItemId[] }[] = [
  { id: 'shirt', label: 'Shirt', items: ['polo', 'shirt'] },
  {
    id: 'sweater',
    label: 'Sweater',
    items: ['sweater-troyer', 'sweater-crew'],
  },
  {
    id: 'jacket',
    label: 'Jacket',
    items: [
      'jacket',
      'jacket-polo-beige',
      'jacket-polo-navy',
      'coat-burberry',
      'jacket-quilted',
    ],
  },
  { id: 'belt', label: 'Belt', items: ['belt'] },
  {
    id: 'trousers',
    label: 'Trousers',
    items: ['trousers', 'trousers-long', 'trousers-linen', 'trousers-check'],
  },
  { id: 'shoes', label: 'Shoes', items: ['loafers', 'sneakers'] },
  { id: 'socks', label: 'Socks', items: ['socks-low', 'socks-sport'] },
  { id: 'watch', label: 'Watch', items: [...WATCH_IDS] },
];
export type LayerChoice = { item: ItemId; color: ColorId; visible: boolean };
export type Outfit = {
  tucked: boolean;
  layers: Record<SectionId, LayerChoice>;
};
export const initialOutfit = (): Outfit => ({
  tucked: true,
  layers: {
    shirt: { item: 'polo', color: 'cream-light', visible: true },
    sweater: { item: 'sweater-troyer', color: 'navy', visible: false },
    jacket: { item: 'jacket', color: 'tan', visible: true },
    belt: { item: 'belt', color: 'brown-dark', visible: true },
    trousers: { item: 'trousers', color: 'tan', visible: true },
    shoes: { item: 'loafers', color: 'brown-dark', visible: true },
    socks: { item: 'socks-low', color: 'white', visible: false },
    watch: { item: 'watch-rectangular-brown', color: 'white', visible: false },
  },
});
export const getColor = (id: ColorId) =>
  PALETTE.find((color) => color.id === id)!;
export type Action =
  | { type: 'visibility'; section: SectionId; visible: boolean }
  | { type: 'item'; section: SectionId; item: ItemId }
  | { type: 'color'; section: SectionId; color: ColorId }
  | { type: 'tuck'; tucked: boolean }
  | { type: 'reset' };

export function outfitReducer(
  state: Outfit,
  action: Action,
  available: (id: ItemId) => boolean = isItemReady,
): Outfit {
  if (action.type === 'reset') return initialOutfit();
  if (action.type === 'tuck') return { ...state, tucked: action.tucked };
  const choice = state.layers[action.section];
  if (action.type === 'visibility' && action.visible && !available(choice.item))
    return state;
  if (
    action.type === 'item' &&
    (!SECTIONS.find((s) => s.id === action.section)?.items.includes(
      action.item,
    ) ||
      !available(action.item))
  )
    return state;
  if (
    action.type === 'color' &&
    (action.section === 'watch' || !PALETTE.some((c) => c.id === action.color))
  )
    return state;
  const changed =
    action.type === 'visibility'
      ? { ...choice, visible: action.visible }
      : action.type === 'item'
        ? {
            ...choice,
            item: action.item,
            color:
              action.item === choice.item
                ? choice.color
                : (ITEMS[action.item].defaultColor ?? choice.color),
          }
        : { ...choice, color: action.color };
  return { ...state, layers: { ...state.layers, [action.section]: changed } };
}

export type DrawStep =
  | { kind: 'base' }
  | { kind: 'garment'; section: SectionId; choice: LayerChoice }
  | { kind: 'belt-loops'; choice: LayerChoice };
export function layerPlan(
  outfit: Outfit,
  available: (id: ItemId) => boolean = isItemReady,
): DrawStep[] {
  const steps: DrawStep[] = [{ kind: 'base' }];
  const add = (section: SectionId) => {
    if (
      outfit.layers[section].visible &&
      available(outfit.layers[section].item)
    )
      steps.push({ kind: 'garment', section, choice: outfit.layers[section] });
  };
  // Accessories rest on the skin, with shirt and jacket cuffs above them.
  add('watch');
  add('socks');
  add('shoes');
  if (outfit.tucked) add('shirt');
  add('trousers');
  add('belt');
  if (
    outfit.layers.belt.visible &&
    available(outfit.layers.belt.item) &&
    outfit.layers.trousers.visible &&
    available(outfit.layers.trousers.item)
  )
    steps.push({ kind: 'belt-loops', choice: outfit.layers.trousers });
  if (!outfit.tucked) add('shirt');
  add('sweater');
  // Collars stay tucked beneath both sweaters; only the part inside each
  // sweater's neck opening remains visible.
  add('jacket');
  return steps;
}
export const BELT_LOOPS: Bounds[] = [
  { x: 447, y: 603, width: 13, height: 33 },
  { x: 578, y: 603, width: 10, height: 33 },
];
export function describeOutfit(outfit: Outfit): string {
  const clothes = SECTIONS.filter(
    (s) => outfit.layers[s.id].visible && isItemReady(outfit.layers[s.id].item),
  ).map((s) => {
    const choice = outfit.layers[s.id];
    if (s.id === 'watch')
      return `${ITEMS[choice.item].label.toLowerCase()} watch`;
    return `${getColor(choice.color).label.toLowerCase()} ${ITEMS[choice.item].label.toLowerCase()}`;
  });
  return clothes.length
    ? `Mannequin wearing ${clothes.join(', ')}${outfit.layers.shirt.visible ? `; shirt ${outfit.tucked ? 'tucked in' : 'untucked'}` : ''}.`
    : 'Base mannequin with all clothing layers hidden.';
}
