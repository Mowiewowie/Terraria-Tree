import { useRef, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { createDirectImageUrl, FALLBACK_ICON } from '../../utils/image';
import { getFriendlyKnockback, getFriendlyUseTime, isMobileUX } from '../../utils/helpers';
import { RECIPE_GROUPS } from '../../data/recipe-groups';
import type { TooltipData } from '../../hooks/useTooltip';
import { isGroupTooltip } from '../../hooks/useTooltip';
import type { ItemRecord } from '../../types/items';

interface TooltipProps {
  data: TooltipData;
  onWikiClick?: (url: string) => void;
  onCategoryClick?: (category: string) => void;
}

export default function Tooltip({ data, onWikiClick, onCategoryClick }: TooltipProps) {
  const elRef = useRef<HTMLDivElement>(null);
  const showTransmutations = useStore((s) => s.showTransmutations);
  const selectedRecipeIndices = useStore((s) => s.selectedRecipeIndices);
  const itemsDatabase = useStore((s) => s.itemsDatabase);
  const discoverBoxItems = useStore((s) => s.discoverBoxItems);
  const currentTreeItemId = useStore((s) => s.currentTreeItemId);
  const treeMode = useStore((s) => s.treeMode);

  // Position tooltip — use layout effect for immediate positioning
  useEffect(() => {
    if (!elRef.current || !data.visible) return;
    const el = elRef.current;

    // Use rAF to ensure the DOM has painted and we can measure accurately
    const frame = requestAnimationFrame(() => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const offset = 15;
      let l = data.position.x + offset;
      let t = data.position.y + offset;

      if (l + w > window.innerWidth) l = data.position.x - w - offset;
      if (t + h > window.innerHeight) t = data.position.y - h - offset;
      l = Math.max(10, l);
      t = Math.max(10, t);

      el.style.left = `${l}px`;
      el.style.top = `${t}px`;
      el.style.visibility = 'visible';
    });
    return () => cancelAnimationFrame(frame);
  }, [data.position, data.visible]);

  if (!data.visible || !data.itemData) return null;

  const mobile = isMobileUX();

  // --- Group tooltip ---
  if (isGroupTooltip(data.itemData)) {
    const gd = data.itemData;
    const primaryId = Object.keys(itemsDatabase).find(
      (id) => itemsDatabase[id].DisplayName === gd.groupItems[0],
    );
    const imgSrc = primaryId && itemsDatabase[primaryId].IconUrl
      ? itemsDatabase[primaryId].IconUrl
      : createDirectImageUrl(gd.groupItems[0]);

    return (
      <div ref={elRef} className="tooltip fixed bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg shadow-2xl p-4 max-w-sm text-left z-[9999] pointer-events-none transition-colors" style={{ visibility: 'hidden' }}>
        <div className="flex items-start gap-4 mb-3">
          <img src={imgSrc} alt="" className="w-12 h-12 object-contain rounded bg-slate-50 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700 shrink-0" onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_ICON; }} />
          <div className="w-full">
            <h3 className="terraria-text font-bold text-lg leading-tight text-amber-500">{gd.name}</h3>
            {mobile && (
              <div className="mt-3 flex gap-2 pointer-events-auto">
                <button onClick={() => onWikiClick?.(gd.url)} className="flex-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-white py-1.5 px-2 rounded shadow text-[11px] font-bold transition-colors flex items-center justify-center gap-1.5 border border-slate-300 dark:border-slate-600">
                  <i className="fa-solid fa-external-link-alt" /> Wiki
                </button>
              </div>
            )}
            {!mobile && (
              <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-2 flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <kbd className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded font-mono text-slate-600 dark:text-slate-300 shadow-inner">CTRL</kbd>
                  <span>+ Click for Wiki</span>
                </div>
              </div>
            )}
          </div>
        </div>
        <p className="text-sm text-slate-700 dark:text-slate-300 mb-3">Accepts ANY of the following items.</p>
        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 mt-2">Valid Alternatives:</div>
        <div className="flex flex-wrap gap-1">
          {gd.groupItems.map((itemName) => {
            const itemId = Object.keys(itemsDatabase).find((id) => itemsDatabase[id].DisplayName === itemName);
            const src = itemId && itemsDatabase[itemId].IconUrl ? itemsDatabase[itemId].IconUrl : createDirectImageUrl(itemName);
            return (
              <img key={itemName} src={src} className="w-8 h-8 object-contain rounded bg-slate-100 dark:bg-slate-800 p-1 border border-slate-300 dark:border-slate-600 shadow-sm" title={itemName} onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_ICON; }} />
            );
          })}
        </div>
      </div>
    );
  }

  // --- Normal item tooltip ---
  const item = data.itemData as ItemRecord;
  const rarityVal = item.Stats?.Rarity ?? 0;
  const imgSrc = item.IconUrl || createDirectImageUrl(item.DisplayName);

  const validRecipes = item.Recipes?.filter((r) => showTransmutations || !r.IsTransmutation) || [];
  const rIndex = selectedRecipeIndices[item.ID] || 0;
  const activeRecipe = validRecipes[Math.min(rIndex, validRecipes.length - 1)];
  const stationText = activeRecipe?.Stations?.length ? activeRecipe.Stations.join(', ') : 'By Hand';

  // Extra ingredients (for usage/discover mode context)
  let extraIngs: { Name: string; Amount: number; ID?: string }[] = [];
  if ((treeMode === 'usage' || treeMode === 'discover') && data.extraRecipe) {
    const contextNames = treeMode === 'discover'
      ? discoverBoxItems.map((id) => (itemsDatabase[id]?.DisplayName || '').toLowerCase())
      : currentTreeItemId ? [(itemsDatabase[currentTreeItemId]?.DisplayName || '').toLowerCase()] : [];

    extraIngs = (data.extraRecipe.Ingredients || []).filter((ing) => {
      const ingName = (ing.Name || ing.name || '').toLowerCase();
      if (contextNames.includes(ingName)) return false;
      if (ingName.startsWith('any ')) {
        const groupKey = Object.keys(RECIPE_GROUPS).find((k) => k.toLowerCase() === ingName);
        if (groupKey && RECIPE_GROUPS[groupKey].some((gi) => contextNames.includes(gi.toLowerCase()))) return false;
      }
      return true;
    });
  }

  // Stats to display
  const statsEntries = item.Stats
    ? Object.entries(item.Stats).filter(
        ([k, v]) => !['Rarity', 'MaxStack', 'ToolPower', 'Value', 'IsHardmode'].includes(k) && v !== -1 && v !== null && v !== '',
      )
    : [];

  const drops = item.ObtainedFromDrops?.slice(0, 3) || [];
  const extraDropCount = (item.ObtainedFromDrops?.length || 0) - 3;

  return (
    <div ref={elRef} className={`tooltip fixed bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg shadow-2xl p-4 max-w-sm text-left z-[9999] transition-colors ${mobile ? 'pointer-events-auto' : 'pointer-events-none'}`} style={{ visibility: 'hidden' }}>
      <div className="flex items-start gap-4 mb-3">
        <img src={imgSrc} alt="" draggable={false} className="w-12 h-12 object-contain rounded bg-slate-50 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700 shrink-0" onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_ICON; }} />
        <div className="w-full">
          <h3 className={`terraria-text font-bold text-lg leading-tight rarity-${rarityVal}`}>{item.DisplayName}</h3>
          {!mobile && (item.WikiUrl || item.Category) && (
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-2 flex flex-col gap-1.5">
              {item.WikiUrl && (
                <div className="flex items-center gap-1.5">
                  <kbd className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded font-mono text-slate-600 dark:text-slate-300 shadow-inner">CTRL</kbd>
                  <span>+ Click for Wiki</span><i className="fa-solid fa-external-link-alt ml-0.5" />
                </div>
              )}
              {item.Category && (
                <div className="flex items-center gap-1.5">
                  <kbd className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded font-mono text-slate-600 dark:text-slate-300 shadow-inner">SHIFT</kbd>
                  <span>+ Click for Category</span><i className="fa-solid fa-layer-group ml-0.5" />
                </div>
              )}
            </div>
          )}
          {mobile && (
            <div className="mt-3 flex gap-2 pointer-events-auto">
              {item.WikiUrl && (
                <button onClick={() => onWikiClick?.(item.WikiUrl)} className="flex-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-white py-1.5 px-2 rounded shadow text-[11px] font-bold transition-colors flex items-center justify-center gap-1.5 border border-slate-300 dark:border-slate-600">
                  <i className="fa-solid fa-external-link-alt" /> Wiki
                </button>
              )}
              {item.Category && (
                <button onClick={() => onCategoryClick?.(item.Category)} className="flex-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-800 dark:text-white py-1.5 px-2 rounded shadow text-[11px] font-bold transition-colors flex items-center justify-center gap-1.5 border border-slate-300 dark:border-slate-600">
                  <i className="fa-solid fa-layer-group" /> Category
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {item.Category && (
        <p className="text-sm text-slate-700 dark:text-slate-300 mb-3">Type: {item.Category}</p>
      )}

      {/* Stats */}
      {statsEntries.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-3 text-sm font-mono text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 pb-2">
          {statsEntries.map(([k, v]) => {
            const label = k.replace(/([A-Z])/g, ' $1').trim();
            let display = String(v);
            if (k === 'Knockback') display = `${v} (${getFriendlyKnockback(v as number)})`;
            else if (k === 'UseTime') display = `${v} (${getFriendlyUseTime(v as number)})`;
            return (
              <div key={k}>
                <span className="text-slate-500 capitalize">{label}: </span>
                <span className="text-slate-900 dark:text-white font-medium">{display}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Crafting station */}
      {validRecipes.length > 0 && (
        <div className="mb-2 text-sm text-yellow-600 dark:text-yellow-500/80 font-semibold">
          <i className="fa-solid fa-hammer mr-2" />
          <span>Crafted at: {stationText}</span>
        </div>
      )}

      {/* Drops */}
      {drops.length > 0 && (
        <div className="mb-3 text-sm text-emerald-600 dark:text-emerald-400 font-semibold">
          <div className="uppercase tracking-wide text-slate-500 text-xs mb-1">Obtained From:</div>
          <ul className="list-disc list-inside space-y-0.5">
            {drops.map((src, i) => (
              <li key={i}>
                <span className="text-slate-700 dark:text-slate-300">{src.SourceNPC_Name} </span>
                <span className="text-emerald-600 dark:text-emerald-500 text-xs">({src.DropChance})</span>
              </li>
            ))}
            {extraDropCount > 0 && (
              <li className="text-xs text-slate-500 italic mt-1">+{extraDropCount} more...</li>
            )}
          </ul>
        </div>
      )}

      {/* Extra ingredients (Also Requires) */}
      {extraIngs.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold mb-2">Also Requires:</div>
          <div className="flex flex-wrap gap-1.5">
            {extraIngs.map((ing, i) => {
              const ingName = ing.Name || '';
              const src = createDirectImageUrl(ingName);
              return (
                <img key={i} src={src} className="w-6 h-6 object-contain rounded bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-300 dark:border-slate-600 shadow-sm" title={`${ingName} (x${ing.Amount})`} onError={(e) => { (e.target as HTMLImageElement).src = FALLBACK_ICON; }} />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
