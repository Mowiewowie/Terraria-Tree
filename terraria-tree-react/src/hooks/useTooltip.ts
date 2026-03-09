import { useState, useCallback, useRef } from 'react';
import type { ItemRecord, Recipe } from '../types/items';

export interface TooltipData {
  itemData: ItemRecord | GroupTooltipData | null;
  extraRecipe: Recipe | null;
  visible: boolean;
}

export interface GroupTooltipData {
  isGroupData: true;
  name: string;
  groupItems: string[];
  url: string;
}

export function isGroupTooltip(data: any): data is GroupTooltipData {
  return data?.isGroupData === true;
}

/**
 * Positions the tooltip element relative to the mouse cursor.
 * Direct DOM manipulation for smooth, lag-free tracking.
 */
function positionTooltipEl(el: HTMLElement, clientX: number, clientY: number) {
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const offset = 15;
  let l = clientX + offset;
  let t = clientY + offset;

  if (l + w > window.innerWidth) l = clientX - w - offset;
  if (t + h > window.innerHeight) t = clientY - h - offset;
  l = Math.max(10, l);
  t = Math.max(10, t);

  el.style.left = `${l}px`;
  el.style.top = `${t}px`;
}

/**
 * Hook for managing tooltip visibility and positioning.
 * Uses React state for content/visibility, direct DOM for position.
 */
export function useTooltip() {
  const [tooltip, setTooltip] = useState<TooltipData>({
    itemData: null,
    extraRecipe: null,
    visible: false,
  });

  const tooltipElRef = useRef<HTMLDivElement | null>(null);
  const lineTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback(
    (e: React.MouseEvent | MouseEvent | { clientX: number; clientY: number }, data: ItemRecord | GroupTooltipData, extraRecipe?: Recipe | null) => {
      const clientX = 'clientX' in e ? e.clientX : 0;
      const clientY = 'clientY' in e ? e.clientY : 0;
      setTooltip({
        itemData: data,
        extraRecipe: extraRecipe || null,
        visible: true,
      });
      // Position after next paint when element is rendered
      requestAnimationFrame(() => {
        if (tooltipElRef.current) {
          positionTooltipEl(tooltipElRef.current, clientX, clientY);
          tooltipElRef.current.style.visibility = 'visible';
        }
      });
    },
    [],
  );

  const move = useCallback((e: React.MouseEvent | MouseEvent) => {
    // Direct DOM manipulation — no React re-render
    if (tooltipElRef.current) {
      positionTooltipEl(tooltipElRef.current, e.clientX, e.clientY);
    }
  }, []);

  const hide = useCallback(() => {
    setTooltip((prev) => ({ ...prev, visible: false }));
    clearTimeout(lineTimeoutRef.current);
  }, []);

  const showDelayed = useCallback(
    (e: React.MouseEvent | MouseEvent, data: ItemRecord | GroupTooltipData, delay = 300, extraRecipe?: Recipe | null) => {
      clearTimeout(lineTimeoutRef.current);
      // Capture coords at call time since the event object may be recycled
      const clientX = e.clientX;
      const clientY = e.clientY;
      lineTimeoutRef.current = setTimeout(() => {
        show({ clientX, clientY }, data, extraRecipe);
      }, delay);
    },
    [show],
  );

  const cancelDelayed = useCallback(() => {
    clearTimeout(lineTimeoutRef.current);
  }, []);

  return { tooltip, tooltipElRef, show, move, hide, showDelayed, cancelDelayed };
}
