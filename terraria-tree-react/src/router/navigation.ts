import { useStore } from '../store/useStore';
import { updateSEOState } from './seo';
import { buildDiscoveryGraph } from '../algorithms/discovery';
import type { HistoryEntry, TreeMode } from '../types/items';

// --- Safe History API wrappers ---

function safeReplaceState(state: any, url: string): void {
  try { history.replaceState(state, '', url); } catch { /* local file history blocked */ }
}

function safePushState(state: any, url: string): void {
  try { history.pushState(state, '', url); } catch { /* local file history blocked */ }
}

// --- Helper: get local center of element relative to tree container ---

export function getLocalCenter(
  element: HTMLElement,
  treeContainer: HTMLElement,
  scale: number,
): { x: number; y: number; w: number } {
  const tr = treeContainer.getBoundingClientRect();
  const er = element.getBoundingClientRect();
  return {
    x: (er.left - tr.left) / scale + (er.width / scale) / 2,
    y: (er.top - tr.top) / scale + (er.height / scale) / 2,
    w: er.width / scale,
  };
}

// --- Save current state to history + localStorage ---

export function saveCurrentState(skipBrowserState = false): void {
  const s = useStore.getState();
  s.saveToLocalStorage();

  if (s.historyIdx >= 0 && s.appHistory[s.historyIdx]) {
    const updates: Partial<HistoryEntry> = {
      cameraX: s.targetX,
      cameraY: s.targetY,
      cameraScale: s.targetScale,
    };

    if (s.currentViewType === 'tree') {
      updates.expanded = Array.from(s.expandedNodes);
      updates.discoverItems = [...s.discoverBoxItems];
      updates.selectedRecipeIndices = { ...s.selectedRecipeIndices };

      // Capture item locations from DOM
      const treeContainer = document.getElementById('treeContainer');
      if (treeContainer) {
        const locations: Record<string, { x: number; y: number; w: number }> = {};
        treeContainer.querySelectorAll<HTMLElement>('.item-card').forEach((card) => {
          if (card.dataset.id) {
            locations[card.dataset.id] = getLocalCenter(card, treeContainer, s.targetScale);
          }
        });
        updates.itemLocations = locations;
      }
    }

    s.updateCurrentHistory(updates);

    if (!skipBrowserState) {
      const entry = s.appHistory[s.historyIdx];
      safeReplaceState(
        { idx: s.historyIdx, isHome: entry?.isHome },
        window.location.search,
      );
    }
  }
}

// --- Navigate to item (from search or click) ---

export function viewItem(id: string, _isFromSearch = false): void {
  const s = useStore.getState();

  saveCurrentState();
  updateSEOState('tree', id, s.itemsDatabase);

  const entry: HistoryEntry = {
    viewType: 'tree',
    id,
    mode: s.treeMode,
    expanded: [],
    discoverItems: [...s.discoverBoxItems],
    selectedRecipeIndices: { ...s.selectedRecipeIndices },
  };

  s.pushHistory(entry);
  // pushHistory updates idx internally
  safePushState({ idx: useStore.getState().historyIdx }, `?id=${id}`);

  // Update view state
  s.setCurrentTreeItemId(id);
  s.setViewType('tree');
  s.clearExpandedNodes();
}

// --- Navigate to category ---

export function viewCategory(typeStr: string): void {
  if (!typeStr) return;
  const s = useStore.getState();

  saveCurrentState();
  updateSEOState('category', typeStr, s.itemsDatabase);

  const entry: HistoryEntry = {
    viewType: 'category',
    category: typeStr,
  };

  s.pushHistory(entry);
  safePushState({ idx: useStore.getState().historyIdx }, `?category=${encodeURIComponent(typeStr)}`);

  s.setCurrentCategoryName(typeStr);
  s.setViewType('category');
}

// --- Navigate to home ---

export function viewHome(): void {
  const s = useStore.getState();

  saveCurrentState();

  const entry: HistoryEntry = {
    viewType: 'home',
    isHome: true,
  };

  s.pushHistory(entry);
  safePushState({ idx: useStore.getState().historyIdx, isHome: true }, window.location.pathname);

  s.setViewType('home');
  s.setCurrentTreeItemId(null);
  s.setCurrentCategoryName(null);
}

// --- Switch tree mode (recipe/usage/discover) with history ---

export function switchMode(newMode: TreeMode): void {
  const s = useStore.getState();
  if (s.treeMode === newMode) return;

  if (s.currentViewType !== 'tree') {
    s.setTreeMode(newMode);
    return;
  }

  // Discover mode: seed discover box with current item
  if (newMode === 'discover') {
    if (s.currentTreeItemId && !s.discoverBoxItems.includes(s.currentTreeItemId)) {
      s.setDiscoverBoxItems([s.currentTreeItemId]);
    }
  } else if (s.treeMode === 'discover') {
    // Leaving discover: use last discover box item as tree item
    if (s.discoverBoxItems.length > 0) {
      s.setCurrentTreeItemId(s.discoverBoxItems[s.discoverBoxItems.length - 1]);
    } else {
      viewHome();
      return;
    }
  }

  saveCurrentState();

  s.setTreeMode(newMode);
  s.clearExpandedNodes();
  // Auto-open the discover DAG when entering discover mode
  if (newMode === 'discover') {
    s.addExpandedNode('discover_root');
  }

  const entry: HistoryEntry = {
    viewType: 'tree',
    id: useStore.getState().currentTreeItemId || undefined,
    mode: newMode,
    expanded: newMode === 'discover' ? ['discover_root'] : [],
    discoverItems: [...useStore.getState().discoverBoxItems],
    selectedRecipeIndices: { ...s.selectedRecipeIndices },
  };

  s.pushHistory(entry);
  safePushState(
    { idx: useStore.getState().historyIdx },
    `?id=${useStore.getState().currentTreeItemId}`,
  );
}

// --- Transition to new item (from card click with FLIP animation) ---

export function transitionToNewItem(targetId: string, skipSave = false): void {
  const s = useStore.getState();

  if (!skipSave) saveCurrentState();

  const entry: HistoryEntry = {
    viewType: 'tree',
    id: targetId,
    mode: s.treeMode,
    expanded: [],
    discoverItems: [...s.discoverBoxItems],
    selectedRecipeIndices: { ...s.selectedRecipeIndices },
  };

  s.pushHistory(entry);
  safePushState({ idx: useStore.getState().historyIdx }, `?id=${targetId}`);

  s.setCurrentTreeItemId(targetId);
  s.setViewType('tree');
  s.clearExpandedNodes();
}

// --- Calculate reset view (center tree in viewport) ---

export function calculateResetView(
  vizArea: HTMLElement,
  treeContainer: HTMLElement,
): { x: number; y: number; scale: number } {
  void vizArea.offsetWidth; // force reflow
  const vizRect = vizArea.getBoundingClientRect();

  const vWidth = vizRect.width || window.innerWidth;
  const vHeight = vizRect.height || window.innerHeight;

  const treeWidth = treeContainer.scrollWidth;
  const treeHeight = treeContainer.scrollHeight;

  // Responsive min scale: higher on mobile for readability, prevents lag on large trees
  const minScale = vWidth < 768 ? 0.4 : 0.25;

  const paddingX = 80;
  const paddingY = 80;
  const scaleX = (vWidth - paddingX) / (treeWidth || 1);
  const scaleY = (vHeight - paddingY) / (treeHeight || 1);
  const scale = Math.max(minScale, Math.min(scaleX, scaleY, 1.1));

  // Horizontal: center the tree
  const x = (vWidth - (treeWidth * scale)) / 2;

  // Vertical: anchor to root card for reliable positioning
  // (scrollHeight can be inaccurate with content-visibility: auto)
  const isUsageMode = treeContainer.classList.contains('mode-usage');
  const rootCard = treeContainer.querySelector<HTMLElement>('.is-root .item-card')
    || treeContainer.querySelector<HTMLElement>('.is-root');

  let y: number;
  if (rootCard) {
    const trRect = treeContainer.getBoundingClientRect();
    const matrix = new DOMMatrix(getComputedStyle(treeContainer).transform);
    const currentScale = matrix.a || 1;

    const rootRect = rootCard.getBoundingClientRect();
    const rootLocalTop = (rootRect.top - trRect.top) / currentScale;
    const rootLocalBottom = rootLocalTop + rootRect.height / currentScale;

    if (isUsageMode) {
      // Usage mode (column-reverse): root at bottom, show near bottom of viewport
      y = (vHeight - 60) - rootLocalBottom * scale;
      // If tree fits entirely, center instead
      if (treeHeight * scale <= vHeight - paddingY) {
        y = (vHeight - (treeHeight * scale)) / 2;
      }
    } else {
      // Recipe/Discover: root at top, show near top of viewport
      const topPad = 40;
      y = topPad - rootLocalTop * scale;
      // If tree fits entirely, center instead
      const centeredY = (vHeight - (treeHeight * scale)) / 2;
      if (centeredY > topPad) y = centeredY;
    }
  } else {
    // Fallback: center vertically
    y = Math.max(40, (vHeight - (treeHeight * scale)) / 2);
  }

  return { x, y, scale };
}

// --- Focus camera on expanded subtree ---

export function focusSubtree(nodeEl: HTMLElement, _mode: TreeMode): void {
  const treeContainer = document.getElementById('treeContainer');
  const vizArea = treeContainer?.parentElement;
  if (!treeContainer || !vizArea) return;

  const s = useStore.getState();
  const { targetX, targetY, targetScale } = s;

  // Use actual rendered scale for accurate local coord computation
  const matrix = new DOMMatrix(getComputedStyle(treeContainer).transform);
  const renderedScale = matrix.a || targetScale;

  const tr = treeContainer.getBoundingClientRect();
  const card = nodeEl.querySelector('.item-card');
  const children = nodeEl.querySelector('.tree-children');
  if (!card) return;

  // Content bounds in tree-local coordinates
  const cr = card.getBoundingClientRect();
  let minX = (cr.left - tr.left) / renderedScale;
  let maxX = (cr.right - tr.left) / renderedScale;
  let minY = (cr.top - tr.top) / renderedScale;
  let maxY = (cr.bottom - tr.top) / renderedScale;

  if (children) {
    const chr = children.getBoundingClientRect();
    minX = Math.min(minX, (chr.left - tr.left) / renderedScale);
    maxX = Math.max(maxX, (chr.right - tr.left) / renderedScale);
    minY = Math.min(minY, (chr.top - tr.top) / renderedScale);
    maxY = Math.max(maxY, (chr.bottom - tr.top) / renderedScale);
  }

  // Viewport bounds with edge padding (in vizArea-relative screen pixels)
  const vizRect = vizArea.getBoundingClientRect();
  const pad = 40;
  const vpLeft   = pad;
  const vpRight  = vizRect.width - pad;
  const vpTop    = pad;
  const vpBottom = vizRect.height - pad;
  const vpWidth  = vpRight - vpLeft;
  const vpHeight = vpBottom - vpTop;

  // Project content bounds to screen space using target camera position
  const contentLeft   = targetX + minX * targetScale;
  const contentRight  = targetX + maxX * targetScale;
  const contentTop    = targetY + minY * targetScale;
  const contentBottom = targetY + maxY * targetScale;

  // Case 1: Everything already visible — do nothing
  if (contentLeft >= vpLeft && contentRight <= vpRight &&
      contentTop >= vpTop && contentBottom <= vpBottom) {
    return;
  }

  const contentW = (maxX - minX) * targetScale;
  const contentH = (maxY - minY) * targetScale;

  // Case 2: Fits at current scale, just needs minimal pan
  if (contentW <= vpWidth && contentH <= vpHeight) {
    let dx = 0, dy = 0;
    if (contentLeft < vpLeft)         dx = vpLeft - contentLeft;
    else if (contentRight > vpRight)  dx = vpRight - contentRight;
    if (contentTop < vpTop)           dy = vpTop - contentTop;
    else if (contentBottom > vpBottom) dy = vpBottom - contentBottom;
    s.setTarget(targetX + dx, targetY + dy, targetScale);
    return;
  }

  // Case 3: Need to zoom out
  const sX = vpWidth / (maxX - minX);
  const sY = vpHeight / (maxY - minY);
  const minScale = vizRect.width < 768 ? 0.4 : 0.25;
  const newScale = Math.max(minScale, Math.min(sX, sY, targetScale));

  // Zoom around viewport center for visual stability
  const vpCenterX = vizRect.width / 2;
  const vpCenterY = vizRect.height / 2;
  const localCenterX = (vpCenterX - targetX) / targetScale;
  const localCenterY = (vpCenterY - targetY) / targetScale;
  let newX = vpCenterX - localCenterX * newScale;
  let newY = vpCenterY - localCenterY * newScale;

  // Recompute content bounds at new zoom + position, then minimal pan
  const newContentLeft   = newX + minX * newScale;
  const newContentRight  = newX + maxX * newScale;
  const newContentTop    = newY + minY * newScale;
  const newContentBottom = newY + maxY * newScale;

  let dx = 0, dy = 0;
  if (newContentLeft < vpLeft)           dx = vpLeft - newContentLeft;
  else if (newContentRight > vpRight)    dx = vpRight - newContentRight;
  if (newContentTop < vpTop)             dy = vpTop - newContentTop;
  else if (newContentBottom > vpBottom)  dy = vpBottom - newContentBottom;

  s.setTarget(newX + dx, newY + dy, newScale);
}

// --- Estimate tree size for expand-all warning ---

export function estimateTreeSize(rootId: string | null, mode: TreeMode): number {
  const s = useStore.getState();
  const { itemsDatabase, usageIndex, itemIndex, showTransmutations, selectedRecipeIndices, discoverBoxItems } = s;

  // Discover mode: count actual nodes in the filtered discovery graph
  if (mode === 'discover') {
    const graph = buildDiscoveryGraph(discoverBoxItems, itemsDatabase, usageIndex, showTransmutations);
    if (!graph) return 0;
    let count = 0;
    const countNodes = (node: any) => { count++; node.children.forEach(countNodes); };
    for (const tree of graph.trees) tree.children.forEach(countNodes);
    return count;
  }

  let count = 0;
  const visited = new Set<string>();
  const queue: string[] = rootId ? [rootId] : [];

  while (queue.length > 0 && count < 5000) {
    const curr = queue.shift()!;
    count++;
    const data = itemsDatabase[curr];
    if (!data) continue;

    if (mode === 'recipe') {
      if (data.Recipes && data.Recipes.length > 0 && !visited.has(curr)) {
        visited.add(curr);
        let validRecipes = data.Recipes;
        if (!showTransmutations) validRecipes = validRecipes.filter(r => !r.IsTransmutation);
        if (validRecipes.length === 0) continue;
        let rIndex = selectedRecipeIndices[curr] || 0;
        if (rIndex >= validRecipes.length) rIndex = 0;
        const recipe = validRecipes[rIndex];
        if (recipe?.Ingredients) {
          recipe.Ingredients.forEach((ing) => {
            let cid = ing.ID;
            if (!cid) {
              const found = itemIndex.find(idx => idx.name.toLowerCase() === (ing.Name || '').toLowerCase());
              if (found) cid = String(found.id);
            }
            if (cid) queue.push(cid);
          });
        }
      }
    } else if (mode === 'usage') {
      if (!visited.has(curr)) {
        visited.add(curr);
        let usages = usageIndex[(data.DisplayName || '').toLowerCase()] || [];
        if (!showTransmutations) usages = usages.filter(u => !u.recipe?.IsTransmutation);
        const uSet = new Set(usages.map(u => u.id));
        uSet.forEach(id => queue.push(id));
      }
    }
  }
  return count;
}
