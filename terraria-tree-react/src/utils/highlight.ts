/**
 * Double-flash highlight on a card element.
 * Waits for camera animation to settle before flashing.
 * Used on tree line clicks (amber) and convergence line clicks (line color).
 */
export function highlightCard(
  cardEl: HTMLElement | null,
  color = '#f59e0b',
  isAnimatingFn?: () => boolean,
): void {
  if (!cardEl) return;
  const glow = `0 0 0 3px ${color}, 0 0 20px 4px ${color}`;

  let checks = 0;
  const waitForSettle = () => {
    if (isAnimatingFn?.() && checks < 60) {
      checks++;
      requestAnimationFrame(waitForSettle);
      return;
    }
    const saved = cardEl.style.boxShadow;
    cardEl.style.boxShadow = glow;
    setTimeout(() => { cardEl.style.boxShadow = saved; }, 200);
    setTimeout(() => { cardEl.style.boxShadow = glow; }, 400);
    setTimeout(() => { cardEl.style.boxShadow = saved; }, 600);
  };
  requestAnimationFrame(waitForSettle);
}
