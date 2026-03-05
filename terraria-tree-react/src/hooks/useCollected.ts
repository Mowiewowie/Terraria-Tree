import { useCallback } from 'react';
import { useStore } from '../store/useStore';
import type { ItemsDatabase, UsageIndex, ItemIndexEntry } from '../types/items';

/**
 * Resolves an ingredient's ID from its Name, falling back to itemIndex search.
 */
function resolveIngredientId(
  ing: { ID?: string; Name?: string; name?: string },
  itemsDatabase: ItemsDatabase,
  itemIndex: ItemIndexEntry[],
): string | null {
  let id = ing.ID;
  if (!id || !itemsDatabase[id]) {
    const ingName = (ing.Name || ing.name || '').toLowerCase();
    const found = itemIndex.find((i) => i.name.toLowerCase() === ingName);
    if (found) id = String(found.id);
  }
  return id ? String(id) : null;
}

/**
 * Recursively cascades collected state DOWN through recipe ingredients.
 * Only operates in recipe mode.
 */
function cascadeCollectedDown(
  id: string,
  collected: boolean,
  collectedItems: Set<string>,
  itemsDatabase: ItemsDatabase,
  itemIndex: ItemIndexEntry[],
  showTransmutations: boolean,
  selectedRecipeIndices: Record<string, number>,
  treeMode: string,
  visited = new Set<string>(),
): void {
  if (treeMode !== 'recipe' || visited.has(id)) return;
  visited.add(id);

  const itemData = itemsDatabase[id];
  if (!itemData?.Recipes) return;

  let validRecipes = itemData.Recipes.filter((r) => showTransmutations || !r.IsTransmutation);
  let rIdx = selectedRecipeIndices[id] || 0;
  if (rIdx >= validRecipes.length) rIdx = 0;
  const recipe = validRecipes[rIdx];
  if (!recipe?.Ingredients) return;

  recipe.Ingredients.forEach((ing) => {
    const ingId = resolveIngredientId(ing, itemsDatabase, itemIndex);
    if (ingId) {
      if (collected) collectedItems.add(ingId);
      else collectedItems.delete(ingId);
      cascadeCollectedDown(
        ingId, collected, collectedItems, itemsDatabase, itemIndex,
        showTransmutations, selectedRecipeIndices, treeMode, visited,
      );
    }
  });
}

/**
 * BFS upward through usageIndex: auto-collect parents when all ingredients satisfied,
 * auto-uncollect when not. Max 5000 nodes.
 */
function propagateCollectedUp(
  seedIds: string[],
  collectedItems: Set<string>,
  itemsDatabase: ItemsDatabase,
  itemIndex: ItemIndexEntry[],
  usageIndex: UsageIndex,
  showTransmutations: boolean,
  selectedRecipeIndices: Record<string, number>,
): void {
  const queue = [...seedIds];
  const processed = new Set<string>();

  while (queue.length > 0 && processed.size < 5000) {
    const id = queue.shift()!;
    if (processed.has(id)) continue;
    processed.add(id);

    const item = itemsDatabase[id];
    if (!item) continue;
    const name = (item.DisplayName || '').toLowerCase();
    const usages = usageIndex[name] || [];

    for (const usage of usages) {
      const parentId = String(usage.id);
      if (processed.has(parentId)) continue;

      const parentData = itemsDatabase[parentId];
      if (!parentData?.Recipes) continue;

      const validRecipes = parentData.Recipes.filter((r) => showTransmutations || !r.IsTransmutation);
      if (validRecipes.length === 0) continue;

      let rIdx = selectedRecipeIndices[parentId] || 0;
      if (rIdx >= validRecipes.length) rIdx = 0;
      const selectedRecipe = validRecipes[rIdx];

      const anySatisfied =
        (selectedRecipe?.Ingredients?.length ?? 0) > 0 &&
        selectedRecipe!.Ingredients.every((ing) => {
          const ingId = resolveIngredientId(ing, itemsDatabase, itemIndex);
          return ingId && collectedItems.has(ingId);
        });

      const wasCollected = collectedItems.has(parentId);
      if (anySatisfied && !wasCollected) {
        collectedItems.add(parentId);
        queue.push(parentId);
      } else if (!anySatisfied && wasCollected) {
        collectedItems.delete(parentId);
        queue.push(parentId);
      }
    }
  }
}

/**
 * Hook providing collected item actions.
 * Returns toggle handler and recheck function for recipe switches.
 */
export function useCollected() {
  const toggleAndCascade = useCallback((itemId: string) => {
    const s = useStore.getState();
    const next = new Set(s.collectedItems);
    const isNowCollected = !next.has(itemId);

    if (isNowCollected) next.add(itemId);
    else next.delete(itemId);

    cascadeCollectedDown(
      itemId, isNowCollected, next,
      s.itemsDatabase, s.itemIndex, s.showTransmutations,
      s.selectedRecipeIndices, s.treeMode,
    );

    propagateCollectedUp(
      [itemId], next, s.itemsDatabase, s.itemIndex, s.usageIndex,
      s.showTransmutations, s.selectedRecipeIndices,
    );

    s.setCollectedItems(next);
    s.saveToLocalStorage();
    return isNowCollected;
  }, []);

  const recheckForRecipeSwitch = useCallback((itemId: string) => {
    const s = useStore.getState();
    const next = new Set(s.collectedItems);

    const itemData = s.itemsDatabase[itemId];
    if (!itemData?.Recipes) return;

    const validRecipes = itemData.Recipes.filter((r) => s.showTransmutations || !r.IsTransmutation);
    if (validRecipes.length === 0) return;

    let rIdx = s.selectedRecipeIndices[itemId] || 0;
    if (rIdx >= validRecipes.length) rIdx = 0;
    const recipe = validRecipes[rIdx];

    const isSatisfied =
      (recipe?.Ingredients?.length ?? 0) > 0 &&
      recipe!.Ingredients.every((ing) => {
        const ingId = resolveIngredientId(ing, s.itemsDatabase, s.itemIndex);
        return ingId && next.has(ingId);
      });

    const wasCollected = next.has(itemId);
    if (isSatisfied && !wasCollected) {
      next.add(itemId);
    } else if (!isSatisfied && wasCollected) {
      next.delete(itemId);
    }

    propagateCollectedUp(
      [itemId], next, s.itemsDatabase, s.itemIndex, s.usageIndex,
      s.showTransmutations, s.selectedRecipeIndices,
    );

    s.setCollectedItems(next);
    s.saveToLocalStorage();
  }, []);

  return { toggleAndCascade, recheckForRecipeSwitch };
}

export { resolveIngredientId };
