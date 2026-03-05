import type {
  ItemsDatabase,
  ItemRecord,
  ItemIndexEntry,
  UsageIndex,
  Recipe,
  Ingredient,
} from '../types/items';
import { RECIPE_GROUPS } from './recipe-groups';
import { useStore } from '../store/useStore';

// --- Schema Normalization ---

/**
 * Converts raw JSON data (array or dict, legacy or modern schema) into
 * a normalized ItemsDatabase. Handles:
 * - Legacy Python schema (lowercase fields) → modern C# schema
 * - Transmutation detection (Shimmer, DemonAltar, Chlorophyte Extractor)
 * - ShimmerDecraft reverse recipe synthesis
 */
export function convertArrayToDict(data: unknown): ItemsDatabase {
  const db: ItemsDatabase = {};

  const rawItems = Array.isArray(data) ? data : Object.values(data as Record<string, unknown>);

  rawItems.forEach((rawItem: any) => {
    const isLegacySchema = rawItem.ID === undefined && rawItem.id !== undefined;

    if (isLegacySchema) {
      const item: ItemRecord = {
        ID: rawItem.id.toString(),
        InternalName: rawItem.name.replace(/\s+/g, ''),
        DisplayName: rawItem.name,
        ModSource: 'Vanilla',
        Category: rawItem.specific_type || 'Unknown',
        Tooltip: rawItem.description !== 'N/A' ? rawItem.description : '',
        WikiUrl:
          rawItem.url ||
          `https://terraria.wiki.gg/wiki/${rawItem.name.replace(/\s+/g, '_')}`,
        IconUrl: rawItem.image_url || '',
        IsHardmode: rawItem.hardmode || false,
        Stats: {
          Damage: rawItem.stats?.damage || -1,
          DamageClass: rawItem.damage_class || 'Unknown',
          Knockback: rawItem.stats?.knockback || 0.0,
          CritChance: 0,
          UseTime: rawItem.stats?.usetime || 100,
          Velocity: rawItem.stats?.velocity || 0.0,
          Defense: rawItem.stats?.defense || 0,
          Value: rawItem.stats?.sell ? { Raw: rawItem.stats.sell } : null,
          Rarity: rawItem.stats?.rarity || 0,
        },
        Recipes: (rawItem.crafting?.recipes || []).map((r: any): Recipe => ({
          Stations: r.station ? [r.station] : [],
          Conditions: [],
          Ingredients: (r.ingredients || []).map((ing: any): Ingredient => ({
            ID: ing.id !== undefined ? ing.id.toString() : undefined,
            Name: ing.name,
            Amount: ing.amount,
          })),
          IsTransmutation: r.transmutation || false,
        })),
        ObtainedFromDrops: (rawItem.acquisition || []).map((acq: any) => ({
          SourceNPC_Name: acq.source,
          DropChance: acq.rate,
          Conditions: [],
        })),
        ShimmerDecraft: null,
      };
      db[item.ID] = item;
    } else {
      db[rawItem.ID] = rawItem as ItemRecord;
    }
  });

  // --- Post-process: Detect transmutation in 1.4.4 data ---
  const TRANSMUTATION_STATIONS = ['shimmer', 'chlorophyteextractinator'];

  for (const id in db) {
    const item = db[id];
    if (!item.Recipes) continue;
    item.Recipes.forEach((recipe) => {
      if (recipe.IsTransmutation !== undefined) return; // Already marked (1.4.5 data)
      const stations = (recipe.Stations || []).map((s) => s.toLowerCase());
      const isTransmutationStation = stations.some((s) =>
        TRANSMUTATION_STATIONS.some((ts) => s.includes(ts))
      );
      // DemonAltar/CrimsonAltar with a single ingredient at amount 1 = ore swap
      const isDemonAltarSwap =
        stations.some((s) => s.includes('demonaltar') || s.includes('crimsonaltar')) &&
        recipe.Ingredients?.length === 1 &&
        (recipe.Ingredients[0].Amount || recipe.Ingredients[0].amount) === 1;
      recipe.IsTransmutation = isTransmutationStation || isDemonAltarSwap;
    });
  }

  // --- Build reverse ShimmerDecraft map ---
  // If item A decrafts into item B, then item B has a Shimmer recipe using A as ingredient
  const shimmerReverseMap: Record<string, string[]> = {};
  for (const id in db) {
    const item = db[id];
    if (item.ShimmerDecraft) {
      const targetName = item.ShimmerDecraft.toLowerCase();
      if (!shimmerReverseMap[targetName]) shimmerReverseMap[targetName] = [];
      shimmerReverseMap[targetName].push(id);
    }
  }
  for (const id in db) {
    const item = db[id];
    const itemName = (item.DisplayName || '').toLowerCase();
    if (shimmerReverseMap[itemName]) {
      if (!item.Recipes) item.Recipes = [];
      shimmerReverseMap[itemName].forEach((sourceId) => {
        const sourceItem = db[sourceId];
        item.Recipes.push({
          Stations: ['Shimmer'],
          Conditions: [],
          Ingredients: [
            {
              ID: sourceId,
              Name: sourceItem.DisplayName,
              Amount: 1,
            },
          ],
          IsTransmutation: true,
        });
      });
    }
  }

  return db;
}

// --- Usage Index Builder ---

/**
 * Builds a reverse lookup index: for each ingredient name (lowercase),
 * stores all items that use it in a recipe, including recipe group expansions.
 */
export function buildUsageIndex(db: ItemsDatabase): UsageIndex {
  const index: UsageIndex = {};

  Object.values(db).forEach((item) => {
    if (!item.Recipes || item.Recipes.length === 0) return;

    item.Recipes.forEach((recipe) => {
      if (!recipe.Ingredients) return;

      recipe.Ingredients.forEach((ing) => {
        const ingName = ing.Name || ing.name;
        const ingAmount = ing.Amount || ing.amount || 1;

        const addUsage = (targetName: string | undefined, groupName: string | null) => {
          if (!targetName) return;
          const key = targetName.toLowerCase();
          if (!index[key]) index[key] = [];
          index[key].push({
            id: item.ID,
            amount: ingAmount,
            recipe,
            viaGroup: groupName,
          });
        };

        addUsage(ingName, null);

        // Expand recipe groups: "Any Wood" → add usage for each wood type
        if (ingName && RECIPE_GROUPS[ingName]) {
          RECIPE_GROUPS[ingName].forEach((groupItem) => addUsage(groupItem, ingName));
        }
      });
    });
  });

  return index;
}

// --- Build Item Index ---

/**
 * Creates a flat searchable index from the items database.
 */
export function buildItemIndex(db: ItemsDatabase): ItemIndexEntry[] {
  return Object.values(db).map((item) => ({
    id: item.ID,
    name: item.DisplayName || 'Unknown',
    type: (item.Category || item.ModSource || '').toLowerCase(),
    icon_url: item.IconUrl || '',
    fallback_image: item.WikiUrl || '',
  }));
}

// --- Version Data Loader ---

interface LoadResult {
  database: ItemsDatabase;
  itemIndex: ItemIndexEntry[];
  usageIndex: UsageIndex;
  version: string;
  modsLoaded: string;
  itemCount: number;
}

/**
 * Fetches and initializes item data from the server.
 * Falls back through: requested env → Vanilla → Legacy Python.
 */
export async function loadVersionData(
  targetVersion: string,
  modCalamity: boolean = false,
  modFargos: boolean = false,
): Promise<LoadResult> {
  const store = useStore.getState();
  store.setLoadingStatus({ isLoading: true, statusText: `Loading v${targetVersion}...`, loadError: null });

  // Determine requested environment from mod selections
  let envName = 'Vanilla';
  if (modCalamity && modFargos) envName = 'All';
  else if (modCalamity) envName = 'Vanilla_Calamity';
  else if (modFargos) envName = 'Vanilla_Fargowiltas';

  let loadedEnv = envName;
  let usedLegacy = false;

  try {
    // Phase 1: Try the exact requested environment
    let res = await fetch(`Terraria_${envName}_${targetVersion}_Export.json`);

    // Phase 2: Fallback to Modern Vanilla
    if (!res.ok && envName !== 'Vanilla') {
      console.warn(`[Engine] ${envName} not found. Falling back to Modern Vanilla...`);
      res = await fetch(`Terraria_Vanilla_${targetVersion}_Export.json`);
      if (res.ok) {
        loadedEnv = 'Vanilla';
      }
    }

    // Phase 3: Fallback to Legacy Python Data
    if (!res.ok) {
      if (targetVersion === '1.4.5') {
        console.warn('[Engine] Modern exports not found. Falling back to Legacy Python...');
        res = await fetch('terraria_items.json');
        if (!res.ok) throw new Error('No data files found for this version.');
        loadedEnv = 'Vanilla';
        usedLegacy = true;
      } else {
        throw new Error(`Data for ${targetVersion} not found.`);
      }
    }

    // Load and normalize data
    const rawArray = await res.json();
    const database = convertArrayToDict(rawArray);
    const itemIdx = buildItemIndex(database);
    const usageIdx = buildUsageIndex(database);

    // Format mods display string
    let modsLoaded = 'Vanilla';
    if (loadedEnv === 'Vanilla_Calamity') modsLoaded = 'Vanilla, Calamity';
    else if (loadedEnv === 'Vanilla_Fargowiltas') modsLoaded = "Vanilla, Fargo's";
    else if (loadedEnv === 'All') modsLoaded = "Vanilla, Calamity, Fargo's";

    const itemCount = Object.keys(database).length;

    // Update store
    store.setItemsDatabase(database);
    store.setItemIndex(itemIdx);
    store.setUsageIndex(usageIdx);
    store.setDataLoaded(true);
    store.setLoadingStatus({ isLoading: false, statusText: `v${targetVersion} (${modsLoaded}) • ${itemCount.toLocaleString()} Items`, loadError: null });

    return {
      database,
      itemIndex: itemIdx,
      usageIndex: usageIdx,
      version: targetVersion,
      modsLoaded,
      itemCount,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    console.warn('Auto-load failed:', message);
    store.setLoadingStatus({ isLoading: false, loadError: message });
    throw e;
  }
}
