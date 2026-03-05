import type { RecipeGroups } from '../types/items';

/**
 * Recipe groups map "Any X" ingredient names to the list of valid item alternatives.
 * Used by the crafting system to allow substitution (e.g., any wood type works).
 * 26 groups as of Terraria 1.4.4.
 */
export const RECIPE_GROUPS: RecipeGroups = {
  'Any Wood': [
    'Wood', 'Boreal Wood', 'Rich Mahogany', 'Ebonwood',
    'Shadewood', 'Pearlwood', 'Spooky Wood', 'Dynasty Wood', 'Ash Wood',
  ],
  'Any Iron Bar': ['Iron Bar', 'Lead Bar'],
  'Any Copper Bar': ['Copper Bar', 'Tin Bar'],
  'Any Silver Bar': ['Silver Bar', 'Tungsten Bar'],
  'Any Gold Bar': ['Gold Bar', 'Platinum Bar'],
  'Any Cobalt Bar': ['Cobalt Bar', 'Palladium Bar'],
  'Any Mythril Bar': ['Mythril Bar', 'Orichalcum Bar'],
  'Any Adamantite Bar': ['Adamantite Bar', 'Titanium Bar'],
  'Any Demonite Bar': ['Demonite Bar', 'Crimtane Bar'],
  'Any Sand': ['Sand Block', 'Ebonsand Block', 'Crimsand Block', 'Pearlsand Block'],
  'Any Bird': ['Bird', 'Blue Jay', 'Cardinal', 'Goldfinch'],
  'Any Scorpion': ['Scorpion', 'Black Scorpion'],
  'Any Squirrel': ['Squirrel', 'Red Squirrel', 'Gold Squirrel'],
  'Any Bug': ['Grubby', 'Sluggy', 'Buggy'],
  'Any Jungle Bug': ['Grubby', 'Sluggy', 'Buggy'],
  'Any Duck': ['Duck', 'Mallard Duck'],
  'Any Butterfly': [
    'Monarch Butterfly', 'Sulphur Butterfly', 'Zebra Swallowtail Butterfly',
    'Ulysses Butterfly', 'Julia Butterfly', 'Red Admiral Butterfly',
    'Purple Emperor Butterfly', 'Tree Nymph Butterfly',
  ],
  'Any Firefly': ['Firefly', 'Lightning Bug'],
  'Any Snail': ['Snail', 'Glowing Snail', 'Magma Snail'],
  'Any Fruit': [
    'Apple', 'Apricot', 'Banana', 'Blackcurrant', 'Blood Orange', 'Cherry',
    'Coconut', 'Dragon Fruit', 'Elderberry', 'Grapefruit', 'Lemon', 'Mango',
    'Peach', 'Pineapple', 'Plum', 'Rambutan', 'Starfruit', 'Spicy Pepper', 'Pomegranate',
  ],
  'Any Dragonfly': [
    'Black Dragonfly', 'Blue Dragonfly', 'Green Dragonfly',
    'Orange Dragonfly', 'Red Dragonfly', 'Yellow Dragonfly',
  ],
  'Any Turtle': ['Turtle', 'Jungle Turtle'],
  'Any Macaw': ['Blue Macaw', 'Scarlet Macaw'],
  'Any Cockatiel': ['Gray Cockatiel', 'Yellow Cockatiel'],
  'Any Balloon': ['Shiny Red Balloon', 'Green Balloon', 'Pink Balloon'],
  'Any Cloud': ['Cloud', 'Rain Cloud', 'Snow Cloud'],
  'Any Pressure Plate': [
    'Red Pressure Plate', 'Green Pressure Plate', 'Gray Pressure Plate',
    'Brown Pressure Plate', 'Blue Pressure Plate', 'Yellow Pressure Plate',
    'Lihzahrd Pressure Plate',
  ],
};
