// --- TypeScript types for Terraria item data ---

export interface Ingredient {
  ID?: string;
  Name: string;
  Amount: number;
  // Legacy schema fields (normalized during import)
  id?: string;
  name?: string;
  amount?: number;
}

export interface Recipe {
  Stations: string[];
  Conditions: string[];
  Ingredients: Ingredient[];
  IsTransmutation: boolean;
}

export interface DropSource {
  SourceNPC_Name: string;
  DropChance: string;
  Conditions: string[];
}

export interface ItemStats {
  Damage: number;
  DamageClass: string;
  Knockback: number;
  CritChance: number;
  UseTime: number;
  Velocity: number;
  Defense: number;
  Value: { Raw: number } | null;
  Rarity: number;
}

export interface ItemRecord {
  ID: string;
  InternalName: string;
  DisplayName: string;
  ModSource: string;
  Category: string;
  Tooltip: string;
  WikiUrl: string;
  IconUrl: string;
  IsHardmode: boolean;
  Stats: ItemStats;
  Recipes: Recipe[];
  ObtainedFromDrops: DropSource[];
  ShimmerDecraft: string | null;
}

export interface ItemIndexEntry {
  id: string;
  name: string;
  type: string;
  icon_url: string;
  fallback_image: string;
}

/** Map of item ID to ItemRecord */
export type ItemsDatabase = Record<string, ItemRecord>;

/** Map of lowercase ingredient name to usage entries */
export type UsageIndex = Record<string, UsageEntry[]>;

export interface UsageEntry {
  id: string;
  amount: number;
  recipe: Recipe;
  viaGroup: string | null;
}

/** Recipe group: "Any Wood" → ["Wood", "Boreal Wood", ...] */
export type RecipeGroups = Record<string, string[]>;

// --- History & Navigation Types ---

export type ViewType = 'home' | 'tree' | 'category';
export type TreeMode = 'recipe' | 'usage' | 'discover';

export interface ItemLocation {
  x: number;
  y: number;
  w: number;
}

export interface HistoryEntry {
  viewType: ViewType;
  isHome?: boolean;
  id?: string;
  category?: string;
  mode?: TreeMode;
  expanded?: string[];
  discoverItems?: string[];
  selectedRecipeIndices?: Record<string, number>;
  cameraX?: number;
  cameraY?: number;
  cameraScale?: number;
  itemLocations?: Record<string, ItemLocation>;
}
