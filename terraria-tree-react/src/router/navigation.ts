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

export function transitionToNewItem(targetId: string): void {
  const s = useStore.getState();

  saveCurrentState();

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

  const paddingX = 80;
  const paddingY = 80;
  const scaleX = (vWidth - paddingX) / (treeWidth || 1);
  const scaleY = (vHeight - paddingY) / (treeHeight || 1);

  const minScale = Math.min(0.15, 200 / Math.max(vWidth, 1));
  const scale = Math.max(minScale, Math.min(scaleX, scaleY, 1.1));
  const x = (vWidth - ((treeWidth || 0) * scale)) / 2;
  const y = Math.max(40, (vHeight - ((treeHeight || 0) * scale)) / 2);

  return { x, y, scale };
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
