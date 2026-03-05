import { memo } from 'react';

interface GenericCardProps {
  name: string;
  amount: number;
}

/**
 * Fallback card for items not found in the database.
 * Dashed border, layer-group icon, name text.
 */
const GenericCard = memo(function GenericCard({ name, amount }: GenericCardProps) {
  return (
    <div className="tree-node">
      <div className="item-card relative flex flex-col items-center justify-center w-24 h-24 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-300 dark:border-slate-600">
        <i className="fa-solid fa-layer-group text-slate-400 dark:text-slate-500 text-2xl mb-1" />
        <span className="text-xs text-center text-slate-600 dark:text-slate-400 font-medium px-2">
          {name}
        </span>
        <span className="absolute -top-2 -right-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 text-[10px] px-1.5 py-0.5 rounded-full shadow">
          x{amount}
        </span>
      </div>
    </div>
  );
});

export default GenericCard;
