import { RECIPE_GROUPS } from '../data/recipe-groups';
import type { ItemsDatabase, UsageIndex, ItemIndexEntry } from '../types/items';

export interface DiscoverUsage {
  id: string;
  amount: number;
  recipe?: any;
}

export interface DiscoveryPathNode {
  id: string;
  children: DiscoveryPathNode[];
  convergenceIdx: number | null;
}

export interface ConvergenceEntry {
  targetId: string;
  targetName: string;
  ingredientIds: string[];
  color: string;
}

export interface DiscoveryGraph {
  trees: { boxItemId: string; children: DiscoveryPathNode[] }[];
  convergences: ConvergenceEntry[];
}

/**
 * Get items directly craftable from all discover box items (single-recipe match).
 * Used when box has 0-1 items.
 */
export function getDiscoverableItems(
  discoverBoxItems: string[],
  itemsDatabase: ItemsDatabase,
  _usageIndex: UsageIndex,
  showTransmutations: boolean,
): DiscoverUsage[] {
  if (discoverBoxItems.length === 0) return [];

  const boxItemNames = discoverBoxItems.map(
    (id) => (itemsDatabase[id]?.DisplayName || '').toLowerCase(),
  );
  const uniqueUsagesMap = new Map<string, DiscoverUsage>();

  for (const itemId in itemsDatabase) {
    const item = itemsDatabase[itemId];
    if (!item.Recipes || item.Recipes.length === 0) continue;

    for (const recipe of item.Recipes) {
      if (!showTransmutations && recipe.IsTransmutation) continue;
      let recipeMatchesAll = true;

      for (const boxName of boxItemNames) {
        let hasBoxItem = false;
        if (!recipe.Ingredients) continue;
        for (const ing of recipe.Ingredients) {
          const ingLower = (ing.Name || '').toLowerCase();
          if (ingLower === boxName) { hasBoxItem = true; break; }
          if (ingLower.startsWith('any ')) {
            const groupKey = Object.keys(RECIPE_GROUPS).find((k) => k.toLowerCase() === ingLower);
            if (groupKey && RECIPE_GROUPS[groupKey].map((x) => x.toLowerCase()).includes(boxName)) {
              hasBoxItem = true; break;
            }
          }
        }
        if (!hasBoxItem) { recipeMatchesAll = false; break; }
      }

      if (recipeMatchesAll) {
        if (!uniqueUsagesMap.has(itemId)) {
          uniqueUsagesMap.set(itemId, { id: itemId, amount: 1, recipe });
        }
        break;
      }
    }
  }

  const result = Array.from(uniqueUsagesMap.values());
  result.sort((a, b) => {
    const nameA = itemsDatabase[a.id]?.DisplayName || '';
    const nameB = itemsDatabase[b.id]?.DisplayName || '';
    return nameA.localeCompare(nameB);
  });
  return result;
}

/**
 * BFS contribution tracking to find items reachable through chained crafting
 * where ALL box items contribute through the crafting ancestry.
 * Used when box has 2+ items.
 */
export function getRecursiveDiscoverableItems(
  discoverBoxItems: string[],
  itemsDatabase: ItemsDatabase,
  itemIndex: ItemIndexEntry[],
  usageIndex: UsageIndex,
  showTransmutations: boolean,
): DiscoverUsage[] {
  if (discoverBoxItems.length < 2) {
    return getDiscoverableItems(discoverBoxItems, itemsDatabase, usageIndex, showTransmutations);
  }

  const boxItemNames = new Set(
    discoverBoxItems.map((id) => (itemsDatabase[id]?.DisplayName || '').toLowerCase()),
  );
  const boxItemIds = new Set(discoverBoxItems.map(String));

  const contributions = new Map<string, Set<string>>();
  for (const name of boxItemNames) contributions.set(name, new Set([name]));

  const queue = [...boxItemNames];
  let iterations = 0;

  while (queue.length > 0 && iterations < 50000) {
    iterations++;
    const itemName = queue.shift()!;
    const usages = usageIndex[itemName] || [];

    for (const usage of usages) {
      if (!showTransmutations && usage.recipe.IsTransmutation) continue;
      const parentId = String(usage.id);
      const parentData = itemsDatabase[parentId];
      if (!parentData) continue;
      const parentName = (parentData.DisplayName || '').toLowerCase();

      const parentContribs = contributions.get(parentName) || new Set();
      const oldSize = parentContribs.size;

      for (const ing of usage.recipe.Ingredients || []) {
        const ingName = (ing.Name || '').toLowerCase();
        const ingContribs = contributions.get(ingName);
        if (ingContribs) for (const c of ingContribs) parentContribs.add(c);

        if (RECIPE_GROUPS[ing.Name]) {
          for (const member of RECIPE_GROUPS[ing.Name]) {
            const memberContribs = contributions.get(member.toLowerCase());
            if (memberContribs) for (const c of memberContribs) parentContribs.add(c);
          }
        }
      }

      if (parentContribs.size > oldSize || !contributions.has(parentName)) {
        contributions.set(parentName, parentContribs);
        queue.push(parentName);
      }
    }
  }

  const results = new Map<string, DiscoverUsage>();
  for (const [name, contribs] of contributions) {
    if (contribs.size === boxItemNames.size && !boxItemNames.has(name)) {
      const found = itemIndex.find((i) => (i.name || '').toLowerCase() === name);
      if (found && !boxItemIds.has(String(found.id)) && !results.has(String(found.id))) {
        results.set(String(found.id), { id: String(found.id), amount: 1 });
      }
    }
  }

  const result = Array.from(results.values());
  result.sort((a, b) => {
    const nameA = itemsDatabase[a.id]?.DisplayName || '';
    const nameB = itemsDatabase[b.id]?.DisplayName || '';
    return nameA.localeCompare(nameB);
  });
  return result;
}

/**
 * Build the full discovery DAG with forward usage trees and convergence detection.
 * Returns null if fewer than 2 box items or no convergences found.
 */
export function buildDiscoveryGraph(
  discoverBoxItems: string[],
  itemsDatabase: ItemsDatabase,
  usageIndex: UsageIndex,
  showTransmutations: boolean,
): DiscoveryGraph | null {
  if (discoverBoxItems.length < 2) return null;

  const boxItemNames = new Set(
    discoverBoxItems.map((id) => (itemsDatabase[id]?.DisplayName || '').toLowerCase()),
  );
  const boxItemIds = new Set(discoverBoxItems.map(String));

  const nameToId = new Map<string, string>();
  for (const id of Object.keys(itemsDatabase)) {
    const name = (itemsDatabase[id]?.DisplayName || '').toLowerCase();
    if (name) nameToId.set(name, String(id));
  }

  // Step 1: BFS contribution tracking
  const contributions = new Map<string, Set<string>>();
  for (const name of boxItemNames) contributions.set(name, new Set([name]));

  const queue = [...boxItemNames];
  let iterations = 0;
  while (queue.length > 0 && iterations < 50000) {
    iterations++;
    const itemName = queue.shift()!;
    const usages = usageIndex[itemName] || [];
    for (const usage of usages) {
      if (!showTransmutations && usage.recipe.IsTransmutation) continue;
      const parentId = String(usage.id);
      const parentData = itemsDatabase[parentId];
      if (!parentData) continue;
      const parentName = (parentData.DisplayName || '').toLowerCase();

      const parentContribs = contributions.get(parentName) || new Set();
      const oldSize = parentContribs.size;
      for (const ing of usage.recipe.Ingredients || []) {
        const ingName = (ing.Name || '').toLowerCase();
        const ic = contributions.get(ingName);
        if (ic) for (const c of ic) parentContribs.add(c);
        if (RECIPE_GROUPS[ing.Name]) {
          for (const member of RECIPE_GROUPS[ing.Name]) {
            const mc = contributions.get(member.toLowerCase());
            if (mc) for (const c of mc) parentContribs.add(c);
          }
        }
      }
      if (parentContribs.size > oldSize || !contributions.has(parentName)) {
        contributions.set(parentName, parentContribs);
        queue.push(parentName);
      }
    }
  }

  // Step 2: Find first-level convergence targets
  const convergenceTargetNames = new Set<string>();
  const convergences: ConvergenceEntry[] = [];

  for (const [name, contribs] of contributions) {
    if (contribs.size !== boxItemNames.size || boxItemNames.has(name)) continue;
    const itemId = nameToId.get(name);
    if (!itemId || boxItemIds.has(itemId)) continue;
    const itemData = itemsDatabase[itemId];
    if (!itemData?.Recipes) continue;

    for (const recipe of itemData.Recipes) {
      if (!showTransmutations && recipe.IsTransmutation) continue;
      if (!recipe.Ingredients) continue;

      const coveredByAll = new Set<string>();
      let anyIngCoversAll = false;
      for (const ing of recipe.Ingredients) {
        let ingC = contributions.get((ing.Name || '').toLowerCase()) || new Set<string>();
        if (RECIPE_GROUPS[ing.Name]) {
          const merged = new Set(ingC);
          for (const m of RECIPE_GROUPS[ing.Name]) {
            const mc = contributions.get(m.toLowerCase());
            if (mc) for (const c of mc) merged.add(c);
          }
          ingC = merged;
        }
        for (const c of ingC) coveredByAll.add(c);
        if (ingC.size >= boxItemNames.size) anyIngCoversAll = true;
      }

      if (coveredByAll.size === boxItemNames.size && !anyIngCoversAll) {
        const ingredientIds: string[] = [];
        for (const ing of recipe.Ingredients) {
          const ingName = (ing.Name || '').toLowerCase();
          let ingContribs = contributions.get(ingName) || new Set<string>();
          if (RECIPE_GROUPS[ing.Name]) {
            const merged = new Set(ingContribs);
            for (const m of RECIPE_GROUPS[ing.Name]) {
              const mc = contributions.get(m.toLowerCase());
              if (mc) for (const c of mc) merged.add(c);
            }
            ingContribs = merged;
          }
          if (ingContribs.size > 0) {
            let ingId = nameToId.get(ingName);
            if (!ingId && RECIPE_GROUPS[ing.Name]) {
              for (const member of RECIPE_GROUPS[ing.Name]) {
                const mid = nameToId.get(member.toLowerCase());
                if (mid && contributions.has(member.toLowerCase())) { ingId = mid; break; }
              }
            }
            if (ingId) ingredientIds.push(ingId);
          }
        }

        convergenceTargetNames.add(name);
        convergences.push({
          targetId: itemId,
          targetName: name,
          ingredientIds,
          color: `hsl(${(convergences.length * 137.5) % 360}, 70%, 55%)`,
        });
        break;
      }
    }
  }

  if (convergences.length === 0) return null;

  // Build set of convergence ingredient IDs for keep-alive during tree pruning
  const convIngredientIds = new Set<string>();
  for (const conv of convergences) {
    for (const iid of conv.ingredientIds) convIngredientIds.add(iid);
  }

  // Step 3: Build forward usage trees from each box item
  const claimed = new Set<string>();
  const trees: DiscoveryGraph['trees'] = [];

  for (const boxId of discoverBoxItems) {
    const boxName = (itemsDatabase[boxId]?.DisplayName || '').toLowerCase();

    function buildSubTree(
      itemName: string,
      visited: Set<string>,
      depth: number,
    ): DiscoveryPathNode | null {
      if (depth > 15 || visited.has(itemName)) return null;
      visited.add(itemName);

      const id = nameToId.get(itemName);
      if (!id) return null;

      if (convergenceTargetNames.has(itemName)) {
        if (claimed.has(id)) return null;
        claimed.add(id);
        const convIdx = convergences.findIndex((c) => c.targetId === id);
        return { id, children: [], convergenceIdx: convIdx };
      }

      const usages = usageIndex[itemName] || [];
      const children: DiscoveryPathNode[] = [];
      const seenIds = new Set<string>();

      for (const usage of usages) {
        if (!showTransmutations && usage.recipe.IsTransmutation) continue;
        const childId = String(usage.id);
        if (seenIds.has(childId)) continue;
        const childData = itemsDatabase[childId];
        if (!childData) continue;
        const childName = (childData.DisplayName || '').toLowerCase();

        const childContribs = contributions.get(childName);
        if (!childContribs || !childContribs.has(boxName)) continue;

        const childTree = buildSubTree(childName, new Set(visited), depth + 1);
        if (childTree) { seenIds.add(childId); children.push(childTree); }
      }

      if (children.length === 0 && !convIngredientIds.has(id)) return null;
      return { id, children, convergenceIdx: null };
    }

    const usages = usageIndex[boxName] || [];
    const firstLayerChildren: DiscoveryPathNode[] = [];
    const seenIds = new Set<string>();

    for (const usage of usages) {
      if (!showTransmutations && usage.recipe.IsTransmutation) continue;
      const childId = String(usage.id);
      if (seenIds.has(childId)) continue;
      const childData = itemsDatabase[childId];
      if (!childData) continue;
      const childName = (childData.DisplayName || '').toLowerCase();

      const childContribs = contributions.get(childName);
      if (!childContribs || !childContribs.has(boxName)) continue;

      const childTree = buildSubTree(childName, new Set([boxName]), 1);
      if (childTree) { seenIds.add(childId); firstLayerChildren.push(childTree); }
    }

    if (firstLayerChildren.length > 0) {
      trees.push({ boxItemId: String(boxId), children: firstLayerChildren });
    }
  }

  return { trees, convergences };
}
