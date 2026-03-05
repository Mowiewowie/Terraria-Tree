// --- Image URL utilities ---

/** Offline-ready inline SVG fallback icon (slate question mark) */
export const FALLBACK_ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'%3E%3C/circle%3E%3Cpath d='M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3'%3E%3C/path%3E%3Cline x1='12' y1='17' x2='12.01' y2='17'%3E%3C/line%3E%3C/svg%3E";

/**
 * Constructs a sprite URL from an item's display name.
 * Replicates the Python safe_chars whitelist sanitization.
 */
export function createDirectImageUrl(name: string | undefined): string {
  if (!name) return FALLBACK_ICON;

  // 1. Replace spaces with underscores
  let rawName = name.replace(/ /g, '_') + '.png';

  // 2. Replicate the Python safe_chars whitelist
  let sanitized = rawName.replace(/[^a-zA-Z0-9_\-. ]/g, '');

  // 3. Fallback
  if (!sanitized || sanitized === '.png') {
    sanitized = 'unknown_file.png';
  }

  return `/sprites/${sanitized}`;
}

/**
 * Debounced lazy-loading image observer.
 * Images with `data-src` get their `src` set when they enter the viewport.
 * 150ms debounce prevents sweep-loading during fast panning.
 */
export function createImageObserver(): IntersectionObserver {
  const pendingImages = new Map<Element, ReturnType<typeof setTimeout>>();

  return new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        const img = entry.target as HTMLImageElement;

        if (entry.isIntersecting) {
          if (img.dataset.src && !pendingImages.has(img)) {
            const timeoutId = setTimeout(() => {
              if (img.dataset.src) {
                img.src = img.dataset.src;
                img.removeAttribute('data-src');
              }
              observer.unobserve(img);
              pendingImages.delete(img);
            }, 150);
            pendingImages.set(img, timeoutId);
          }
        } else {
          if (pendingImages.has(img)) {
            clearTimeout(pendingImages.get(img)!);
            pendingImages.delete(img);
          }
        }
      });
    },
    { rootMargin: '300px' }
  );
}
