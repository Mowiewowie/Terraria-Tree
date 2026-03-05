import { memo } from 'react';
import type { TreeMode } from '../../types/items';

interface ExpandButtonProps {
  isOpen: boolean;
  mode: TreeMode;
  onClick: (e: React.MouseEvent) => void;
}

const MODE_COLORS: Record<TreeMode, { active: string; hover: string }> = {
  recipe: { active: 'bg-blue-600', hover: 'hover:bg-blue-700' },
  usage: { active: 'bg-purple-600', hover: 'hover:bg-purple-700' },
  discover: { active: 'bg-emerald-600', hover: 'hover:bg-emerald-700' },
};

const ExpandButton = memo(function ExpandButton({ isOpen, mode, onClick }: ExpandButtonProps) {
  const colors = MODE_COLORS[mode];
  return (
    <button
      className={`expand-btn mt-2 mb-2 w-6 h-6 rounded-full ${isOpen ? colors.active : 'bg-slate-400 dark:bg-slate-700'} ${colors.hover} text-white text-xs flex items-center justify-center transition-colors shadow-md z-20 cursor-pointer no-pan`}
      onClick={onClick}
    >
      <i className={`fa-solid ${isOpen ? 'fa-minus' : 'fa-plus'}`} />
    </button>
  );
});

export default ExpandButton;
