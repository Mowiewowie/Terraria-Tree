import { createDirectImageUrl } from '../utils/image';
import type { ItemsDatabase } from '../types/items';

/**
 * Updates document title, meta description, and JSON-LD structured data
 * based on the current view (tree item or category).
 */
export function updateSEOState(
  viewType: 'tree' | 'category' | 'home',
  idOrCategory: string | undefined,
  itemsDatabase: ItemsDatabase,
): void {
  let title = 'Terraria Crafting Tree & Tool';
  let desc = 'A modern and interactive crafting tree, recipe explorer, and discover tool for Terraria. Find base ingredients, workstations, and total resources required.';
  let schema: object | null = null;

  if (viewType === 'tree' && idOrCategory && itemsDatabase[idOrCategory]) {
    const item = itemsDatabase[idOrCategory];
    const itemName = item.DisplayName;
    title = `How to Craft ${itemName} | Terraria Crafting Tree`;
    desc = item.Tooltip || `Interactive crafting tree and recipe guide for the ${itemName} in Terraria. View base ingredients, workstations, and total resources required.`;

    if (item.Recipes && item.Recipes.length > 0) {
      schema = {
        '@context': 'https://schema.org/',
        '@type': 'HowTo',
        'name': `How to craft ${itemName} in Terraria`,
        'image': item.IconUrl || createDirectImageUrl(itemName),
        'step': item.Recipes[0].Ingredients.map((ing) => ({
          '@type': 'HowToStep',
          'text': `Obtain ${ing.Amount || ing.amount}x ${ing.Name || ing.name}`,
        })),
      };
    }
  } else if (viewType === 'category' && idOrCategory) {
    title = `${idOrCategory} Items | Terraria Crafting Tree`;
    desc = `Explore all ${idOrCategory} items in Terraria. View interactive crafting trees and recipe paths.`;
  }

  document.title = title;

  let metaDesc = document.querySelector('meta[name="description"]');
  if (!metaDesc) {
    metaDesc = document.createElement('meta');
    (metaDesc as HTMLMetaElement).name = 'description';
    document.head.appendChild(metaDesc);
  }
  metaDesc.setAttribute('content', desc);

  let scriptTag = document.getElementById('seo-structured-data');
  if (scriptTag) scriptTag.remove();

  if (schema) {
    const script = document.createElement('script');
    script.id = 'seo-structured-data';
    script.type = 'application/ld+json';
    script.text = JSON.stringify(schema);
    document.head.appendChild(script);
  }
}
