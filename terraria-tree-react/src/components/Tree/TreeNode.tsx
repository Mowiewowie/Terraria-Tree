import { memo, useCallback, useMemo, useRef } from 'react';
import { useStore } from '../../store/useStore';
import { RECIPE_GROUPS } from '../../data/recipe-groups';
import ItemCard from '../Cards/ItemCard';
import GroupCard from '../Cards/GroupCard';
import GenericCard from '../Cards/GenericCard';
import RecipeSelector from './RecipeSelector';
import ExpandButton from './ExpandButton';
import { highlightCard } from '../../utils/highlight';
import { focusSubtree } from '../../router/navigation';
import type { ItemRecord, Recipe, TreeMode, UsageEntry } from '../../types/items';

interface TreeNodeProps {
  id: string;
  isRoot?: boolean;
  visited?: Set<string>;
  parentContextRecipe?: Recipe | null;
  forceDeepExpand?: boolean;
  parentQuantity?: number;
  /** Display amount on the card badge (recipe: "x3", usage: "Req: 2") */
  amount?: number;
  amountText?: string;
  amountMode?: 'recipe' | 'usage';
  // Callbacks passed down from TreeView
  onTooltipShow?: (e: React.MouseEvent, data: any, extraRecipe?: Recipe | null) => void;
  onTooltipMove?: (e: React.MouseEvent) => void;
  onTooltipHide?: () => void;
  onNavigate?: (cardEl: HTMLDivElement, id: string) => void;
  onCategoryView?: (category: string) => void;
  onCollectedToggle?: (id: string) => boolean;
  onModeSwitch?: (mode: TreeMode) => void;
  onTreeReload?: () => void;
}

const TreeNode = memo(function TreeNode({
  id,
  isRoot = false,
  visited = new Set(),
  parentContextRecipe,
  forceDeepExpand = false,
  parentQuantity = 1,
  amount,
  amountText,
  amountMode,
  onTooltipShow,
  onTooltipMove,
  onTooltipHide,
  onNavigate,
  onCategoryView,
  onCollectedToggle,
  onModeSwitch,
  onTreeReload,
}: TreeNodeProps) {
  const itemsDatabase = useStore((s) => s.itemsDatabase);
  const itemIndex = useStore((s) => s.itemIndex);
  const usageIndex = useStore((s) => s.usageIndex);
  const treeMode = useStore((s) => s.treeMode);
  const showTransmutations = useStore((s) => s.showTransmutations);
  const showTotalQuantity = useStore((s) => s.showTotalQuantity);
  // Optimized: only re-render this node when ITS expanded state changes
  const isExpanded = useStore((s) => s.expandedNodes.has(id));
  const selectedRecipeIndices = useStore((s) => s.selectedRecipeIndices);
  const addExpandedNode = useStore((s) => s.addExpandedNode);
  const removeExpandedNode = useStore((s) => s.removeExpandedNode);
  const setSelectedRecipeIndex = useStore((s) => s.setSelectedRecipeIndex);

  const data = itemsDatabase[id] as ItemRecord | undefined;
  const lineTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const nodeRef = useRef<HTMLDivElement>(null);

  // Derive open state from store (no local state — enables Expand All/Collapse All)
  const isOpen = isRoot || isExpanded || forceDeepExpand;

  // Determine children data
  const { hasValidChildren, childrenData, validRecipes, recipeIndex } = useMemo(() => {
    if (!data) return { hasValidChildren: false, childrenData: [] as any[], validRecipes: [] as Recipe[], recipeIndex: 0 };

    if (treeMode === 'recipe') {
      if (!data.Recipes || data.Recipes.length === 0 || visited.has(id)) {
        return { hasValidChildren: false, childrenData: [], validRecipes: [], recipeIndex: 0 };
      }
      const vr = data.Recipes.filter((r) => showTransmutations || !r.IsTransmutation);
      if (vr.length === 0) return { hasValidChildren: false, childrenData: [], validRecipes: vr, recipeIndex: 0 };

      let rIdx = selectedRecipeIndices[id] ?? 0;
      if (rIdx >= vr.length) rIdx = 0;
      return {
        hasValidChildren: true,
        childrenData: vr[rIdx].Ingredients || [],
        validRecipes: vr,
        recipeIndex: rIdx,
      };
    }

    // Usage / Discover mode
    const allUsages = usageIndex[(data.DisplayName || '').toLowerCase()] || [];
    const validUsages = allUsages.filter((u) => showTransmutations || !u.recipe?.IsTransmutation);
    const uniqueMap = new Map<string, UsageEntry>();
    validUsages.forEach((u) => { if (!uniqueMap.has(u.id)) uniqueMap.set(u.id, u); });
    const sorted = Array.from(uniqueMap.values()).sort((a, b) => {
      const nameA = itemsDatabase[a.id]?.DisplayName || '';
      const nameB = itemsDatabase[b.id]?.DisplayName || '';
      return nameA.localeCompare(nameB);
    });

    if (sorted.length > 0 && !visited.has(id)) {
      return { hasValidChildren: true, childrenData: sorted, validRecipes: [], recipeIndex: 0 };
    }
    return { hasValidChildren: false, childrenData: [], validRecipes: [], recipeIndex: 0 };
  }, [data, id, treeMode, showTransmutations, selectedRecipeIndices, usageIndex, itemsDatabase, visited]);

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOpen && !isRoot) {
      removeExpandedNode(id);
    } else {
      addExpandedNode(id);
      // Focus camera on expanded content after React renders new children
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (nodeRef.current) focusSubtree(nodeRef.current, treeMode);
        });
      });
    }
  }, [isOpen, isRoot, id, addExpandedNode, removeExpandedNode, treeMode]);

  const handleRecipePrev = useCallback(() => {
    const newIdx = (recipeIndex - 1 + validRecipes.length) % validRecipes.length;
    setSelectedRecipeIndex(id, newIdx);
    onTreeReload?.();
  }, [id, recipeIndex, validRecipes.length, setSelectedRecipeIndex, onTreeReload]);

  const handleRecipeNext = useCallback(() => {
    const newIdx = (recipeIndex + 1) % validRecipes.length;
    setSelectedRecipeIndex(id, newIdx);
    onTreeReload?.();
  }, [id, recipeIndex, validRecipes.length, setSelectedRecipeIndex, onTreeReload]);

  // --- Tree line event handlers ---
  const handleLineEnter = useCallback((e: React.MouseEvent) => {
    const treeChildren = (e.currentTarget as HTMLElement).closest('.tree-children');
    treeChildren?.classList.add('lines-hovered');
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
    clearTimeout(lineTimeoutRef.current);
    lineTimeoutRef.current = setTimeout(() => {
      if (data) {
        onTooltipShow?.({ clientX: lastMouseRef.current.x, clientY: lastMouseRef.current.y } as React.MouseEvent, data, parentContextRecipe);
      }
    }, 300);
  }, [data, parentContextRecipe, onTooltipShow]);

  const handleLineMove = useCallback((e: React.MouseEvent) => {
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
    onTooltipMove?.(e);
  }, [onTooltipMove]);

  const handleLineLeave = useCallback((e: React.MouseEvent) => {
    const treeChildren = (e.currentTarget as HTMLElement).closest('.tree-children');
    treeChildren?.classList.remove('lines-hovered');
    clearTimeout(lineTimeoutRef.current);
    onTooltipHide?.();
  }, [onTooltipHide]);

  const handleLineClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const node = (e.currentTarget as HTMLElement).closest('.tree-node') || (e.currentTarget as HTMLElement).parentElement;
    const card = node?.querySelector<HTMLElement>('.item-card');
    highlightCard(card || null);
  }, []);

  if (!data) {
    return <GenericCard name="Unknown" amount={1} />;
  }

  const newVisited = useMemo(() => new Set(visited).add(id), [visited, id]);

  // Build children elements
  const renderChildren = () => {
    if (!isOpen || !hasValidChildren) return null;

    const childNodes: React.ReactNode[] = [];

    if (treeMode === 'recipe') {
      childrenData.forEach((ing: any, i: number) => {
        const ingName = ing.Name || ing.name || '';
        const ingAmount = ing.Amount || ing.amount || 1;
        const displayAmount = showTotalQuantity ? ingAmount * parentQuantity : ingAmount;
        const ingLower = ingName.toLowerCase();
        const isGroup = Object.keys(RECIPE_GROUPS).some((k) => k.toLowerCase() === ingLower) || ingLower.startsWith('any ');

        if (isGroup) {
          childNodes.push(
            <div key={`group-${ingName}-${i}`} className={`tree-node ${i === 0 ? 'is-first' : ''} ${i === childrenData.length - 1 ? 'is-last' : ''} ${childrenData.length === 1 ? 'is-only' : ''}`}>
              <div className="line-h" onMouseEnter={handleLineEnter} onMouseMove={handleLineMove} onMouseLeave={handleLineLeave} onClick={handleLineClick} />
              <div className="line-v" onMouseEnter={handleLineEnter} onMouseMove={handleLineMove} onMouseLeave={handleLineLeave} onClick={handleLineClick} />
              <GroupCard groupName={ingName} amount={displayAmount} onTooltipShow={onTooltipShow} onTooltipMove={onTooltipMove} onTooltipHide={onTooltipHide} onCategoryView={onCategoryView} />
            </div>,
          );
        } else {
          let cid = ing.ID;
          if (!cid || !itemsDatabase[cid]) {
            const found = itemIndex.find((idx) => idx.name.toLowerCase() === ingName.toLowerCase());
            if (found) cid = String(found.id);
          }

          const posClasses = `${i === 0 ? 'is-first' : ''} ${i === childrenData.length - 1 ? 'is-last' : ''} ${childrenData.length === 1 ? 'is-only' : ''}`;

          if (cid && itemsDatabase[cid]) {
            childNodes.push(
              <div key={`${cid}-${i}`} className={`tree-node ${posClasses}`}>
                <div className="line-h" onMouseEnter={handleLineEnter} onMouseMove={handleLineMove} onMouseLeave={handleLineLeave} onClick={handleLineClick} />
                <div className="line-v" onMouseEnter={handleLineEnter} onMouseMove={handleLineMove} onMouseLeave={handleLineLeave} onClick={handleLineClick} />
                <TreeNode
                  id={cid}
                  visited={newVisited}
                  parentQuantity={displayAmount}
                  amount={displayAmount}
                  amountMode="recipe"
                  onTooltipShow={onTooltipShow}
                  onTooltipMove={onTooltipMove}
                  onTooltipHide={onTooltipHide}
                  onNavigate={onNavigate}
                  onCategoryView={onCategoryView}
                  onCollectedToggle={onCollectedToggle}
                  onModeSwitch={onModeSwitch}
                  onTreeReload={onTreeReload}
                />
              </div>,
            );
          } else {
            childNodes.push(
              <div key={`generic-${ingName}-${i}`} className={`tree-node ${posClasses}`}>
                <div className="line-h" onMouseEnter={handleLineEnter} onMouseMove={handleLineMove} onMouseLeave={handleLineLeave} onClick={handleLineClick} />
                <div className="line-v" onMouseEnter={handleLineEnter} onMouseMove={handleLineMove} onMouseLeave={handleLineLeave} onClick={handleLineClick} />
                <GenericCard name={ingName} amount={displayAmount} />
              </div>,
            );
          }
        }
      });
    } else {
      // Usage mode
      childrenData.forEach((usage: UsageEntry, i: number) => {
        const badgeText = usage.viaGroup ? `via ${usage.viaGroup}` : `Req: ${usage.amount}`;
        const posClasses = `${i === 0 ? 'is-first' : ''} ${i === childrenData.length - 1 ? 'is-last' : ''} ${childrenData.length === 1 ? 'is-only' : ''}`;

        childNodes.push(
          <div key={`${usage.id}-${i}`} className={`tree-node ${posClasses}`}>
            <div className="line-h" />
            <div className="line-v" />
            <TreeNode
              id={usage.id}
              visited={newVisited}
              parentContextRecipe={usage.recipe}
              forceDeepExpand={forceDeepExpand}
              amountText={badgeText}
              amountMode="usage"
              onTooltipShow={onTooltipShow}
              onTooltipMove={onTooltipMove}
              onTooltipHide={onTooltipHide}
              onNavigate={onNavigate}
              onCategoryView={onCategoryView}
              onCollectedToggle={onCollectedToggle}
              onModeSwitch={onModeSwitch}
              onTreeReload={onTreeReload}
            />
          </div>,
        );
      });
    }

    return (
      <div className={`tree-children`}>
        <button
          className="tree-line-btn"
          onMouseEnter={handleLineEnter}
          onMouseMove={handleLineMove}
          onMouseLeave={handleLineLeave}
          onClick={handleLineClick}
        />
        {childNodes}
      </div>
    );
  };

  return (
    <div ref={nodeRef} className={`tree-node ${isRoot ? 'is-root' : ''}`}>
      {/* Root mode toggle button */}
      {isRoot && treeMode !== 'discover' && (
        <button
          className="absolute left-1/2 -translate-x-1/2 px-5 py-2 rounded-full bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-xl border border-slate-300 dark:border-slate-600 text-sm font-bold z-50 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap cursor-pointer no-pan"
          style={treeMode === 'recipe' ? { top: '-54px' } : { bottom: '-54px' }}
          onClick={(e) => {
            e.stopPropagation();
            onModeSwitch?.(treeMode === 'recipe' ? 'usage' : 'recipe');
          }}
        >
          {treeMode === 'recipe' ? (
            <><i className="fa-solid fa-code-branch text-purple-500" /> Used In</>
          ) : (
            <><i className="fa-solid fa-hammer text-blue-500" /> Recipe</>
          )}
        </button>
      )}

      {/* Item card with optional amount badge */}
      <div className="relative">
        {(amount !== undefined || amountText) && amountMode && (
          <AmountBadge amount={amount} text={amountText} mode={amountMode} />
        )}
        <ItemCard
          data={data}
          sizeClass={isRoot ? 'lg' : 'sm'}
          contextRecipe={parentContextRecipe}
          onTooltipShow={onTooltipShow}
          onTooltipMove={onTooltipMove}
          onTooltipHide={onTooltipHide}
          onNavigate={onNavigate}
          onCategoryView={onCategoryView}
          onCollectedToggle={onCollectedToggle}
        />
      </div>

      {/* Recipe selector pill */}
      {treeMode === 'recipe' && validRecipes.length > 1 && (
        <RecipeSelector
          currentIndex={recipeIndex}
          totalRecipes={validRecipes.length}
          onPrev={handleRecipePrev}
          onNext={handleRecipeNext}
        />
      )}

      {/* Expand button + children */}
      {hasValidChildren && (
        <>
          <ExpandButton isOpen={isOpen} mode={treeMode} onClick={handleToggle} />
          {renderChildren()}
        </>
      )}

      {/* No children message for root */}
      {isRoot && !hasValidChildren && (
        <div className={`px-4 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg shadow-lg text-slate-500 dark:text-slate-400 text-sm flex items-center gap-2 z-10 ${treeMode === 'recipe' ? 'mt-5' : 'mb-5'}`}>
          {treeMode === 'recipe' ? (
            <><i className="fa-solid fa-hammer text-slate-400 dark:text-slate-500" /> Not craftable (Base Item)</>
          ) : (
            <><i className="fa-solid fa-leaf text-slate-400 dark:text-slate-500" /> Not used in any recipes (End Item)</>
          )}
        </div>
      )}
    </div>
  );
});

// --- Amount Badge sub-component ---

const AmountBadge = memo(function AmountBadge({
  amount,
  text,
  mode,
}: {
  amount?: number;
  text?: string;
  mode: 'recipe' | 'usage';
}) {
  const display = text || `x${amount}`;
  const colors = mode === 'usage'
    ? 'bg-purple-100 dark:bg-purple-900 border-purple-300 dark:border-purple-500 text-purple-800 dark:text-purple-200'
    : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-500 text-slate-700 dark:text-slate-300';

  return (
    <span className={`absolute -top-2 -right-2 ${colors} border text-[10px] px-1.5 py-0.5 rounded-full z-20 font-mono shadow`}>
      {display}
    </span>
  );
});

export default TreeNode;
