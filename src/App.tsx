import { useEffect, useReducer, useRef, useState } from 'react';
import {
  Check,
  RotateCcw,
  Shirt as ShirtIcon,
  ArrowDownToLine,
  Eye,
  EyeOff,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  ITEMS,
  PALETTE,
  SECTIONS,
  VIEW,
  describeOutfit,
  getColor,
  initialOutfit,
  isItemReady,
  readyItemIds,
  outfitReducer,
} from './wardrobe';
import type { Action, ColorId, ItemId, Outfit, SectionId } from './wardrobe';
import { loadWardrobe, WardrobeRenderer } from './renderer';

function ClothingThumbnail({
  renderer,
  item,
  color,
}: {
  renderer: WardrobeRenderer | null;
  item: ItemId;
  color: ColorId;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (renderer && ref.current) renderer.thumbnail(ref.current, item, color);
  }, [renderer, item, color]);
  if (!isItemReady(item))
    return (
      <span className="pending-thumbnail" aria-hidden="true">
        Image pending
      </span>
    );
  return (
    <canvas
      ref={ref}
      width={176}
      height={120}
      aria-hidden="true"
      className="clothing-thumbnail"
    />
  );
}

function WardrobeSection({
  section,
  outfit,
  dispatch,
  renderer,
}: {
  section: (typeof SECTIONS)[number];
  outfit: Outfit;
  dispatch: React.Dispatch<Action>;
  renderer: WardrobeRenderer | null;
}) {
  const choice = outfit.layers[section.id],
    currentColor = getColor(choice.color);
  return (
    <section
      className={`wardrobe-section ${!choice.visible ? 'is-hidden' : ''} ${!section.items.some(isItemReady) ? 'images-pending' : ''}`}
      aria-labelledby={`${section.id}-heading`}
      data-section={section.id}
    >
      <div className="section-heading">
        <h3 id={`${section.id}-heading`}>{section.label}</h3>
        <div className="visibility-control">
          <span aria-hidden="true">
            {!isItemReady(choice.item)
              ? 'Pending'
              : choice.visible
                ? 'Shown'
                : 'Hidden'}
          </span>
          <Switch
            checked={choice.visible && isItemReady(choice.item)}
            disabled={!isItemReady(choice.item)}
            onCheckedChange={(visible) =>
              dispatch({ type: 'visibility', section: section.id, visible })
            }
            aria-label={`Show ${section.label.toLowerCase()}`}
            className="wardrobe-switch"
          />
        </div>
      </div>
      <div className="section-content">
        <RadioGroup
          value={choice.item}
          onValueChange={(value) =>
            dispatch({
              type: 'item',
              section: section.id,
              item: value as ItemId,
            })
          }
          aria-label={`${section.label} type`}
          className={`clothing-options ${section.id === 'watch' ? 'watch-options' : ''} ${section.id === 'jacket' ? 'jacket-options' : ''}`}
        >
          {section.items.map((item) => (
            <label
              key={item}
              className={`clothing-choice ${choice.item === item && isItemReady(item) ? 'selected' : ''} ${!isItemReady(item) ? 'is-pending' : ''}`}
              htmlFor={`item-${item}`}
            >
              <RadioGroupItem
                id={`item-${item}`}
                value={item}
                disabled={!isItemReady(item)}
                aria-label={ITEMS[item].label}
                className="item-radio"
              />
              <ClothingThumbnail
                renderer={renderer}
                item={item}
                color={
                  choice.item === item
                    ? choice.color
                    : (ITEMS[item].defaultColor ?? choice.color)
                }
              />
              <span className="choice-name">{ITEMS[item].label}</span>
              {choice.item === item && isItemReady(item) && (
                <Check
                  className="choice-check"
                  size={12}
                  strokeWidth={2.5}
                  aria-hidden="true"
                />
              )}
            </label>
          ))}
        </RadioGroup>
        {section.id === 'shirt' && (
          <div className="tuck-control">
            <ArrowDownToLine size={15} strokeWidth={1.6} aria-hidden="true" />
            <label htmlFor="tuck-shirt">Tuck in shirt</label>
            <Switch
              id="tuck-shirt"
              checked={outfit.tucked}
              onCheckedChange={(tucked) => dispatch({ type: 'tuck', tucked })}
              className="wardrobe-switch small"
            />
          </div>
        )}
        {section.id !== 'watch' && (
          <>
            <div className="color-heading">
              <span>Color</span>
              <span className="color-name">{currentColor.label}</span>
            </div>
            <RadioGroup
              value={choice.color}
              onValueChange={(value) =>
                dispatch({
                  type: 'color',
                  section: section.id,
                  color: value as ColorId,
                })
              }
              aria-label={`${section.label} color`}
              className="color-options"
            >
              {PALETTE.map((color) => (
                <RadioGroupItem
                  key={color.id}
                  value={color.id}
                  aria-label={color.label}
                  title={color.label}
                  style={{ '--swatch': color.hex } as React.CSSProperties}
                  className="color-option"
                />
              ))}
            </RadioGroup>
          </>
        )}
      </div>
    </section>
  );
}

export function App() {
  const [outfit, dispatch] = useReducer(
    (state: Outfit, action: Action) => outfitReducer(state, action),
    undefined,
    initialOutfit,
  );
  const [renderer, setRenderer] = useState<WardrobeRenderer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const sections = useRef<HTMLDivElement>(null);
  const [mobileSection, setMobileSection] = useState<SectionId>('shirt');
  const visibleCount = SECTIONS.filter(
    (section) =>
      outfit.layers[section.id].visible &&
      isItemReady(outfit.layers[section.id].item),
  ).length;
  useEffect(() => {
    let active = true;
    loadWardrobe()
      .then((images) => {
        if (active) setRenderer(new WardrobeRenderer(images));
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : 'The clothing images could not be loaded.',
          );
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  useEffect(() => {
    if (renderer && canvas.current) renderer.paint(canvas.current, outfit);
  }, [outfit, renderer]);
  function selectSection(id: SectionId) {
    setMobileSection(id);
    const target = document.getElementById(`${id}-heading`);
    if (target && sections.current && window.innerWidth > 760) {
      const section = target.closest('section');
      if (section)
        sections.current.scrollTo({
          top: (section as HTMLElement).offsetTop,
          behavior: 'smooth',
        });
    }
  }
  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="/" aria-label="Wardrobe Studio home">
          <span className="brand-icon">
            <ShirtIcon size={21} strokeWidth={1.5} />
          </span>
          <span>
            Wardrobe<span className="brand-light"> Studio</span>
          </span>
        </a>
        <button
          className="reset-button"
          onClick={() => dispatch({ type: 'reset' })}
          title="Restore the original outfit"
        >
          <RotateCcw size={15} strokeWidth={1.7} />
          <span>Reset outfit</span>
        </button>
      </header>
      <main className="workspace">
        <section className="outfit-panel" aria-label="Outfit preview">
          <div className="preview-heading">
            <h1>Your outfit</h1>
            <span className="view-label">Front view</span>
          </div>
          <div className="mannequin-stage" aria-busy={!renderer && !error}>
            {/* oxlint-disable jsx-a11y/prefer-tag-over-role -- The composed canvas is an image with a dynamic accessible description. */}
            <canvas
              ref={canvas}
              width={VIEW.width}
              height={VIEW.height}
              role="img"
              aria-label={describeOutfit(outfit)}
              className={`outfit-canvas ${renderer ? 'ready' : ''}`}
            />
            {/* oxlint-enable jsx-a11y/prefer-tag-over-role */}
            {!renderer && (
              <div
                className="preview-message"
                role={error ? 'alert' : 'status'}
              >
                {error ? (
                  <>
                    <span>{error}</span>
                    <button
                      onClick={() => {
                        setError(null);
                        setAttempt((a) => a + 1);
                      }}
                    >
                      Try again
                    </button>
                  </>
                ) : (
                  <>
                    <span className="loading-spinner" />
                    <span>Getting your wardrobe ready…</span>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="outfit-footer">
            <span className="layers-caption">
              {visibleCount ? <Eye size={15} /> : <EyeOff size={15} />}
              {visibleCount} of{' '}
              {SECTIONS.filter((s) => s.items.some(isItemReady)).length} layers
              shown
            </span>
            <div className="outfit-colors" aria-label="Visible outfit colors">
              {SECTIONS.filter(
                (s) =>
                  s.id !== 'watch' &&
                  outfit.layers[s.id].visible &&
                  isItemReady(outfit.layers[s.id].item),
              ).map((s) => (
                <span
                  key={s.id}
                  className="outfit-color"
                  style={{
                    background: getColor(outfit.layers[s.id].color).hex,
                  }}
                  title={`${s.label}: ${getColor(outfit.layers[s.id].color).label}`}
                />
              ))}
            </div>
          </div>
          <p className="sr-only" aria-live="polite" aria-atomic="true">
            {describeOutfit(outfit)}
          </p>
        </section>
        <aside className="wardrobe-panel" aria-label="Clothing controls">
          <div className="wardrobe-heading">
            <h2>Your wardrobe</h2>
            <span className="item-count">{readyItemIds().length} pieces</span>
          </div>
          <nav className="section-nav" aria-label="Clothing sections">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => selectSection(s.id)}
                className={mobileSection === s.id ? 'active' : ''}
                aria-current={mobileSection === s.id ? 'true' : undefined}
              >
                {s.label}
              </button>
            ))}
          </nav>
          <div
            className="wardrobe-sections"
            ref={sections}
            data-mobile-section={mobileSection}
          >
            {SECTIONS.map((section) => (
              <WardrobeSection
                key={section.id}
                section={section}
                outfit={outfit}
                dispatch={dispatch}
                renderer={renderer}
              />
            ))}
          </div>
        </aside>
      </main>
    </div>
  );
}
