import { useEffect, useRef } from 'react';
import { useStore } from './store/useStore';
import { loadVersionData } from './data/loader';
import { updateSEOState } from './router/seo';
import AppShell from './components/Layout/AppShell';

export default function App() {
  const isDataLoaded = useStore((s) => s.isDataLoaded);
  const isLoading = useStore((s) => s.isLoading);
  const loadError = useStore((s) => s.loadError);
  const hasRouted = useRef(false);

  useEffect(() => {
    loadVersionData('1.4.5').catch(() => {});
  }, []);

  // URL-based initial routing: parse ?id= or ?category= on first data load
  useEffect(() => {
    if (!isDataLoaded || hasRouted.current) return;
    hasRouted.current = true;

    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const category = params.get('category');
    const s = useStore.getState();

    if (id && s.itemsDatabase[id]) {
      s.setCurrentTreeItemId(id);
      s.setViewType('tree');
      updateSEOState('tree', id, s.itemsDatabase);

      // Seed initial history entry
      s.pushHistory({
        viewType: 'tree',
        id,
        mode: s.treeMode,
        expanded: [],
        discoverItems: [...s.discoverBoxItems],
        selectedRecipeIndices: { ...s.selectedRecipeIndices },
      });
    } else if (category) {
      s.setCurrentCategoryName(category);
      s.setViewType('category');
      updateSEOState('category', category, s.itemsDatabase);

      s.pushHistory({
        viewType: 'category',
        category,
      });
    } else {
      // Home mode — push initial history entry
      s.pushHistory({
        viewType: 'home',
        isHome: true,
      });
    }
  }, [isDataLoaded]);

  if (loadError && !isDataLoaded) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center">
        <p className="text-red-400">Failed to load data: {loadError}</p>
      </div>
    );
  }

  if (isLoading && !isDataLoaded) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center">
        <p className="text-slate-400 animate-pulse">Loading...</p>
      </div>
    );
  }

  return <AppShell />;
}
