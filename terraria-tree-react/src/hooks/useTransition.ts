import { useCallback, useRef } from 'react';

/**
 * Hook providing IK (Inverse Kinematics) transition logic.
 * Manages ghost container crossfade between old and new tree content.
 *
 * In the React version, the DOM swap is handled by React's reconciliation,
 * so this hook primarily manages the opacity crossfade effect and
 * provides a way to trigger camera fly animations before content changes.
 */
export function useTransition(
  treeContainerRef: React.RefObject<HTMLDivElement | null>,
) {
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const ghostRef = useRef<HTMLDivElement | null>(null);

  /**
   * Perform a crossfade transition on the tree container.
   * 1. Clone current content as a ghost overlay
   * 2. Fade out ghost while fading in new content
   */
  const performCrossfade = useCallback((skipFade = false) => {
    const container = treeContainerRef.current;
    if (!container) return;

    // Clean up any previous ghost
    if (ghostRef.current?.parentNode) {
      ghostRef.current.parentNode.removeChild(ghostRef.current);
      ghostRef.current = null;
    }
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
    }

    if (skipFade) return;

    const hasContent = container.innerHTML.trim() !== '';
    if (!hasContent) return;

    // Create ghost clone
    const ghost = container.cloneNode(true) as HTMLDivElement;
    ghost.id = 'ghostContainer';
    ghost.style.pointerEvents = 'none';
    ghost.style.zIndex = '5';
    ghost.style.transition = 'none';
    ghost.style.opacity = '1';
    container.parentNode?.insertBefore(ghost, container);
    ghostRef.current = ghost;

    // Fade out old, fade in new
    container.style.transition = 'none';
    container.style.opacity = '0';

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        container.style.transition = 'opacity 0.4s ease';
        ghost.style.transition = 'opacity 0.4s ease';
        ghost.style.opacity = '0';
        container.style.opacity = '1';

        transitionTimeoutRef.current = setTimeout(() => {
          if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
          ghostRef.current = null;
          container.style.transition = '';
        }, 450);
      });
    });
  }, [treeContainerRef]);

  /**
   * Clean up ghost on unmount.
   */
  const cleanup = useCallback(() => {
    if (ghostRef.current?.parentNode) {
      ghostRef.current.parentNode.removeChild(ghostRef.current);
      ghostRef.current = null;
    }
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
    }
  }, []);

  return { performCrossfade, cleanup };
}
