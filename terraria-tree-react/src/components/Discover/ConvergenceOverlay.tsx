import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../../store/useStore';
import { screenToLocal, computeEdgePoints, buildBezierPath } from '../../algorithms/convergence';
import { highlightCard } from '../../utils/highlight';
import type { ConvergenceEntry } from '../../algorithms/discovery';
import type { ItemRecord } from '../../types/items';

interface ConvergenceOverlayProps {
  convergences: ConvergenceEntry[];
  containerRef: React.RefObject<HTMLDivElement | null>;
  onTooltipShow?: (e: React.MouseEvent, data: any) => void;
  onTooltipMove?: (e: React.MouseEvent) => void;
  onTooltipHide?: () => void;
}

/**
 * SVG overlay that draws bezier convergence lines between source ingredients
 * and convergence target items. Lines have hover tooltips and click-to-center.
 *
 * Uses imperative SVG manipulation for performance — the SVG content is rebuilt
 * whenever `redraw` is called (on expand/collapse, resize, etc.).
 */
export default function ConvergenceOverlay({
  convergences,
  containerRef,
  onTooltipShow,
  onTooltipMove,
  onTooltipHide,
}: ConvergenceOverlayProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const itemsDatabase = useStore((s) => s.itemsDatabase);

  const redraw = useCallback(() => {
    const svg = svgRef.current;
    const container = containerRef.current;
    if (!svg || !container) return;

    // Clear previous
    svg.innerHTML = '';

    const svgParent = svg.parentElement;
    if (!svgParent) return;
    const refRect = svgParent.getBoundingClientRect();
    const scale = useStore.getState().targetScale || 1;

    // Create arrowhead markers
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    convergences.forEach((conv, i) => {
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      marker.setAttribute('id', `conv-arrow-${i}`);
      marker.setAttribute('viewBox', '0 0 10 10');
      marker.setAttribute('refX', '9');
      marker.setAttribute('refY', '5');
      marker.setAttribute('markerWidth', '7');
      marker.setAttribute('markerHeight', '7');
      marker.setAttribute('orient', 'auto-start-reverse');
      const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      arrow.setAttribute('d', 'M 0 1 L 8 5 L 0 9 z');
      arrow.setAttribute('fill', conv.color);
      marker.appendChild(arrow);
      defs.appendChild(marker);
    });
    svg.appendChild(defs);

    // Count total lines for perpendicular offset distribution
    let lineIndex = 0;
    const totalLines = convergences.reduce(
      (sum, conv) => sum + conv.ingredientIds.filter((id) => id !== conv.targetId).length,
      0,
    );

    convergences.forEach((conv, convIdx) => {
      const targetEl = container.querySelector<HTMLElement>(`.item-card[data-id="${conv.targetId}"]`);
      if (!targetEl || targetEl.offsetParent === null) return;
      const tr = targetEl.getBoundingClientRect();
      if (tr.width === 0 && tr.height === 0) return;
      const tRect = screenToLocal(tr, refRect, scale);

      conv.ingredientIds.forEach((ingId) => {
        if (ingId === conv.targetId) return;
        const sourceEl = container.querySelector<HTMLElement>(`.item-card[data-id="${ingId}"]`);
        if (!sourceEl || sourceEl.offsetParent === null) return;
        const sr = sourceEl.getBoundingClientRect();
        if (sr.width === 0 && sr.height === 0) return;
        const sRect = screenToLocal(sr, refRect, scale);

        const { sx, sy, ex, ey } = computeEdgePoints(sRect, tRect, lineIndex, totalLines);
        const d = buildBezierPath(sx, sy, ex, ey);

        // Invisible wider hit-area path
        const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        hitPath.setAttribute('d', d);
        hitPath.setAttribute('stroke', 'transparent');
        hitPath.setAttribute('stroke-width', '14');
        hitPath.setAttribute('fill', 'none');
        hitPath.setAttribute('pointer-events', 'stroke');
        hitPath.style.cursor = 'pointer';

        // Visible path
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        path.setAttribute('stroke', conv.color);
        path.setAttribute('stroke-width', '2.5');
        path.setAttribute('fill', 'none');
        path.setAttribute('opacity', '0.8');
        path.setAttribute('pointer-events', 'none');
        path.setAttribute('marker-end', `url(#conv-arrow-${convIdx})`);

        // Hover interactions
        const srcData = itemsDatabase[ingId] as ItemRecord | undefined;
        let savedBoxShadow = '';
        let convTooltipTimeout: ReturnType<typeof setTimeout>;

        hitPath.addEventListener('mouseenter', (e) => {
          convTooltipTimeout = setTimeout(() => {
            if (srcData && onTooltipShow) {
              onTooltipShow(e as unknown as React.MouseEvent, srcData);
            }
          }, 300);
          path.setAttribute('stroke-width', '4');
          path.setAttribute('opacity', '1');
          const srcCard = container.querySelector<HTMLElement>(`.item-card[data-id="${ingId}"]`);
          if (srcCard) {
            savedBoxShadow = srcCard.style.boxShadow;
            srcCard.style.boxShadow = `0 0 0 3px ${conv.color}, 0 0 12px ${conv.color}`;
          }
        });

        hitPath.addEventListener('mousemove', (e) => {
          if (onTooltipMove) onTooltipMove(e as unknown as React.MouseEvent);
        });

        hitPath.addEventListener('mouseleave', () => {
          clearTimeout(convTooltipTimeout);
          onTooltipHide?.();
          path.setAttribute('stroke-width', '2.5');
          path.setAttribute('opacity', '0.8');
          const srcCard = container.querySelector<HTMLElement>(`.item-card[data-id="${ingId}"]`);
          if (srcCard) srcCard.style.boxShadow = savedBoxShadow;
        });

        hitPath.addEventListener('click', (e) => {
          e.stopPropagation();
          const srcCard = container.querySelector<HTMLElement>(`.item-card[data-id="${ingId}"]`);
          if (!srcCard) return;
          // Center camera on source card
          const treeContainer = container.closest('#treeContainer');
          const vizArea = treeContainer?.parentElement;
          if (!treeContainer || !vizArea) return;

          const trRect = treeContainer.getBoundingClientRect();
          const crRect = srcCard.getBoundingClientRect();
          const currentScale = useStore.getState().targetScale;
          const localCX = (crRect.left + crRect.width / 2 - trRect.left) / currentScale;
          const localCY = (crRect.top + crRect.height / 2 - trRect.top) / currentScale;
          const vizRect = vizArea.getBoundingClientRect();

          useStore.getState().setTarget(
            vizRect.width / 2 - localCX * currentScale,
            vizRect.height / 2 - localCY * currentScale,
            currentScale,
          );

          highlightCard(srcCard, conv.color);
        });

        svg.appendChild(hitPath);
        svg.appendChild(path);
        lineIndex++;
      });
    });
  }, [convergences, containerRef, itemsDatabase, onTooltipShow, onTooltipMove, onTooltipHide]);

  // Initial draw + redraw on layout changes
  useEffect(() => {
    // Double rAF to ensure layout is settled
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(redraw);
      return () => cancelAnimationFrame(raf2);
    });
    return () => cancelAnimationFrame(raf1);
  }, [redraw]);

  // Expose redraw via ref so parent can trigger it
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      (container as any).__convergenceRedraw = redraw;
    }
    return () => {
      if (container) delete (container as any).__convergenceRedraw;
    };
  }, [redraw, containerRef]);

  return (
    <svg
      ref={svgRef}
      className="convergence-svg"
    />
  );
}
