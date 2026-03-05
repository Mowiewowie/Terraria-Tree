import { useState, useCallback, useRef } from 'react';
import type { ItemRecord, Recipe } from '../types/items';

export interface TooltipData {
  itemData: ItemRecord | GroupTooltipData | null;
  extraRecipe: Recipe | null;
  position: { x: number; y: number };
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
 * Hook for managing tooltip visibility and positioning.
 * Mirrors the original showTooltip/moveTooltip behavior.
 */
export function useTooltip() {
  const [tooltip, setTooltip] = useState<TooltipData>({
    itemData: null,
    extraRecipe: null,
    position: { x: 0, y: 0 },
    visible: false,
  });

  const lineTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const show = useCallback(
    (e: React.MouseEvent | MouseEvent | { clientX: number; clientY: number }, data: ItemRecord | GroupTooltipData, extraRecipe?: Recipe | null) => {
      const clientX = 'clientX' in e ? e.clientX : 0;
      const clientY = 'clientY' in e ? e.clientY : 0;
      setTooltip({
        itemData: data,
        extraRecipe: extraRecipe || null,
        position: { x: clientX, y: clientY },
        visible: true,
      });
    },
    [],
  );

  const move = useCallback((e: React.MouseEvent | MouseEvent) => {
    setTooltip((prev) => ({
      ...prev,
      position: { x: e.clientX, y: e.clientY },
    }));
  }, []);

  const hide = useCallback(() => {
    setTooltip((prev) => ({ ...prev, visible: false }));
    clearTimeout(lineTimeoutRef.current);
  }, []);

  const showDelayed = useCallback(
    (e: React.MouseEvent | MouseEvent, data: ItemRecord | GroupTooltipData, delay = 300, extraRecipe?: Recipe | null) => {
      clearTimeout(lineTimeoutRef.current);
      lineTimeoutRef.current = setTimeout(() => {
        show(e, data, extraRecipe);
      }, delay);
    },
    [show],
  );

  const cancelDelayed = useCallback(() => {
    clearTimeout(lineTimeoutRef.current);
  }, []);

  return { tooltip, show, move, hide, showDelayed, cancelDelayed };
}
