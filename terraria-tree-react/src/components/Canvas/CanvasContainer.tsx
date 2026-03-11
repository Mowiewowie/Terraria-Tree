import {} from 'react';
import { useCanvas } from '../../hooks/useCanvas';

interface CanvasContainerProps {
  children?: React.ReactNode;
  vizAreaRef: React.RefObject<HTMLDivElement | null>;
  treeContainerRef: React.RefObject<HTMLDivElement | null>;
  treeClassName?: string;
}

/**
 * The infinite canvas: wraps the tree container with pan/zoom/pinch physics.
 * vizAreaRef = the outer viewport (clips overflow).
 * treeContainerRef = the inner transformed container (translate3d + scale).
 */
export default function CanvasContainer({
  children,
  vizAreaRef,
  treeContainerRef,
  treeClassName = '',
}: CanvasContainerProps) {
  // Hook attaches all event listeners imperatively
  useCanvas(vizAreaRef, treeContainerRef);

  return (
    <div
      ref={vizAreaRef}
      id="visualizationArea"
      className="w-full h-full cursor-grab"
      style={{ overflow: 'hidden' }}
    >
      <div
        ref={treeContainerRef}
        id="treeContainer"
        className={treeClassName || undefined}
        style={{ transformOrigin: '0 0' }}
      >
        {children}
      </div>
    </div>
  );
}
