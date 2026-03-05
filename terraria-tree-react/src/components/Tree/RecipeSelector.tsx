import { memo } from 'react';

interface RecipeSelectorProps {
  currentIndex: number;
  totalRecipes: number;
  onPrev: () => void;
  onNext: () => void;
}

const RecipeSelector = memo(function RecipeSelector({
  currentIndex,
  totalRecipes,
  onPrev,
  onNext,
}: RecipeSelectorProps) {
  if (totalRecipes <= 1) return null;

  return (
    <div className="flex items-center justify-center bg-slate-800 dark:bg-slate-900 text-white rounded-full px-2 py-0.5 shadow-lg border border-slate-600 dark:border-slate-500 z-30 text-[10px] font-bold whitespace-nowrap cursor-default no-pan mt-1">
      <button
        className="hover:text-emerald-400 px-1.5 py-0.5 cursor-pointer no-pan transition-colors"
        onClick={(e) => { e.stopPropagation(); onPrev(); }}
      >
        <i className="fa-solid fa-chevron-left" />
      </button>
      <span className="mx-1 w-8 text-center select-none text-slate-200">
        {currentIndex + 1}/{totalRecipes}
      </span>
      <button
        className="hover:text-emerald-400 px-1.5 py-0.5 cursor-pointer no-pan transition-colors"
        onClick={(e) => { e.stopPropagation(); onNext(); }}
      >
        <i className="fa-solid fa-chevron-right" />
      </button>
    </div>
  );
});

export default RecipeSelector;
