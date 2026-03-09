/**
 * Sustained glow highlight on a card element.
 * Waits for camera animation to settle, then applies a glow
 * that holds briefly and fades out smoothly.
 * Used on navigation (amber) and convergence line clicks (line color).
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
    const savedTransition = cardEl.style.transition;

    // Apply glow instantly
    cardEl.style.transition = 'none';
    cardEl.style.boxShadow = glow;

    // Hold for 500ms, then fade out over 1.5s
    setTimeout(() => {
      cardEl.style.transition = 'box-shadow 1.5s ease-out';
      cardEl.style.boxShadow = saved;
      setTimeout(() => {
        cardEl.style.transition = savedTransition;
      }, 1600);
    }, 500);
  };
  requestAnimationFrame(waitForSettle);
}
