import itemBounds from './item-bounds.json' with { type: 'json' };

export const SIZE = { width: 1024, height: 1536 } as const;
export const VIEW = { x: 255, y: 27, width: 510, height: 1450 } as const;
export const PALETTE = [
  { id: 'white', label: 'White', hex: '#FAFAF8' },
  { id: 'black', label: 'Black', hex: '#24262A' },
  { id: 'cream-light', label: 'Cream light', hex: '#F0E7D5' },
  { id: 'tan', label: 'Sand / tan', hex: '#CFB997' },
  { id: 'navy', label: 'Navy', hex: '#26364B' },
  { id: 'green', label: 'Dark green', hex: '#244436' },
  { id: 'blue', label: 'Light blue', hex: '#B7CDDD' },
  { id: 'burgundy', label: 'Burgundy', hex: '#733D48' },
  { id: 'gray-light', label: 'Light gray', hex: '#CDD0CF' },
  { id: 'gray-dark', label: 'Dark gray', hex: '#5B6064' },
  { id: 'brown', label: 'Brown', hex: '#795337' },
] as const;
export type ColorId = (typeof PALETTE)[number]['id'];
export type SectionId =
  | 'shirt'
  | 'jacket'
  | 'belt'
  | 'trousers'
  | 'shoes'
  | 'socks';
export type ItemId =
  | 'polo'
  | 'shirt'
  | 'jacket'
  | 'belt'
  | 'trousers'
  | 'loafers'
  | 'sneakers'
  | 'socks-low'
  | 'socks-sport';
export type Bounds = { x: number; y: number; width: number; height: number };
export const ITEMS: Record<ItemId, { label: string; bounds: Bounds }> = {
  polo: { label: 'Polo', bounds: itemBounds.polo },
  shirt: { label: 'Shirt', bounds: itemBounds.shirt },
  jacket: { label: 'Harrington', bounds: itemBounds.jacket },
  belt: { label: 'Leather belt', bounds: itemBounds.belt },
  trousers: { label: 'Tailored', bounds: itemBounds.trousers },
  loafers: { label: 'Loafers', bounds: itemBounds.loafers },
  sneakers: { label: 'Sneakers', bounds: itemBounds.sneakers },
  'socks-low': { label: 'Low socks', bounds: itemBounds['socks-low'] },
  'socks-sport': { label: 'Sport socks', bounds: itemBounds['socks-sport'] },
};
export const SECTIONS: { id: SectionId; label: string; items: ItemId[] }[] = [
  { id: 'shirt', label: 'Shirt', items: ['polo', 'shirt'] },
  { id: 'jacket', label: 'Jacket', items: ['jacket'] },
  { id: 'belt', label: 'Belt', items: ['belt'] },
  { id: 'trousers', label: 'Trousers', items: ['trousers'] },
  { id: 'shoes', label: 'Shoes', items: ['loafers', 'sneakers'] },
  { id: 'socks', label: 'Socks', items: ['socks-low', 'socks-sport'] },
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
    jacket: { item: 'jacket', color: 'tan', visible: true },
    belt: { item: 'belt', color: 'brown', visible: true },
    trousers: { item: 'trousers', color: 'tan', visible: true },
    shoes: { item: 'loafers', color: 'brown', visible: true },
    socks: { item: 'socks-low', color: 'white', visible: false },
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

export function outfitReducer(state: Outfit, action: Action): Outfit {
  if (action.type === 'reset') return initialOutfit();
  if (action.type === 'tuck') return { ...state, tucked: action.tucked };
  const choice = state.layers[action.section];
  if (
    action.type === 'item' &&
    !SECTIONS.find((s) => s.id === action.section)?.items.includes(action.item)
  )
    return state;
  if (action.type === 'color' && !PALETTE.some((c) => c.id === action.color))
    return state;
  const changed =
    action.type === 'visibility'
      ? { ...choice, visible: action.visible }
      : action.type === 'item'
        ? { ...choice, item: action.item }
        : { ...choice, color: action.color };
  return { ...state, layers: { ...state.layers, [action.section]: changed } };
}

export type DrawStep =
  | { kind: 'base' }
  | { kind: 'garment'; section: SectionId; choice: LayerChoice }
  | { kind: 'belt-loops'; choice: LayerChoice };
export function layerPlan(outfit: Outfit): DrawStep[] {
  const steps: DrawStep[] = [{ kind: 'base' }];
  const add = (section: SectionId) => {
    if (outfit.layers[section].visible)
      steps.push({ kind: 'garment', section, choice: outfit.layers[section] });
  };
  add('socks');
  add('shoes');
  if (outfit.tucked) add('shirt');
  add('trousers');
  add('belt');
  if (outfit.layers.belt.visible && outfit.layers.trousers.visible)
    steps.push({ kind: 'belt-loops', choice: outfit.layers.trousers });
  if (!outfit.tucked) add('shirt');
  add('jacket');
  return steps;
}
export const BELT_LOOPS: Bounds[] = [
  { x: 447, y: 603, width: 13, height: 33 },
  { x: 578, y: 603, width: 10, height: 33 },
];
export function describeOutfit(outfit: Outfit): string {
  const clothes = SECTIONS.filter((s) => outfit.layers[s.id].visible).map(
    (s) => {
      const choice = outfit.layers[s.id];
      return `${getColor(choice.color).label.toLowerCase()} ${ITEMS[choice.item].label.toLowerCase()}`;
    },
  );
  return clothes.length
    ? `Mannequin wearing ${clothes.join(', ')}${outfit.layers.shirt.visible ? `; shirt ${outfit.tucked ? 'tucked in' : 'untucked'}` : ''}.`
    : 'Base mannequin with all clothing layers hidden.';
}
