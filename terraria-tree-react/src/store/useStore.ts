import { create } from 'zustand';
import type {
  ItemsDatabase,
  ItemIndexEntry,
  UsageIndex,
  ViewType,
  TreeMode,
  HistoryEntry,
} from '../types/items';

// --- Store State Shape ---

interface AppState {
  // Data layer
  itemsDatabase: ItemsDatabase;
  itemIndex: ItemIndexEntry[];
  usageIndex: UsageIndex;
  isDataLoaded: boolean;

  // Data loading status
  engineVersion: string;
  statusText: string;
  isLoading: boolean;
  loadError: string | null;

  // Camera state (targets only — current values live in refs for 60fps lerp)
  targetX: number;
  targetY: number;
  targetScale: number;

  // View state
  currentViewType: ViewType;
  currentTreeItemId: string | null;
  currentCategoryName: string | null;
  treeMode: TreeMode;

  // Tree state
  expandedNodes: Set<string>;
  isExpandedAll: boolean;
  selectedRecipeIndices: Record<string, number>;

  // Discover mode
  discoverBoxItems: string[];

  // Collected items
  collectedItems: Set<string>;

  // Filters
  showTransmutations: boolean;
  showTotalQuantity: boolean;

  // Navigation animation — which item to flash after transition
  highlightItemId: string | null;

  // History engine
  appHistory: HistoryEntry[];
  historyIdx: number;

  // --- Actions ---

  // Data
  setItemsDatabase: (db: ItemsDatabase) => void;
  setItemIndex: (index: ItemIndexEntry[]) => void;
  setUsageIndex: (index: UsageIndex) => void;
  setDataLoaded: (loaded: boolean) => void;
  setEngineVersion: (version: string) => void;
  setLoadingStatus: (status: { isLoading?: boolean; statusText?: string; loadError?: string | null }) => void;

  // Camera
  setTarget: (x: number, y: number, scale: number) => void;
  snapNextCamera: boolean;
  setSnapNextCamera: (snap: boolean) => void;

  // View
  setViewType: (viewType: ViewType) => void;
  setCurrentTreeItemId: (id: string | null) => void;
  setCurrentCategoryName: (name: string | null) => void;
  setTreeMode: (mode: TreeMode) => void;

  // Tree
  addExpandedNode: (nodeId: string) => void;
  removeExpandedNode: (nodeId: string) => void;
  clearExpandedNodes: () => void;
  setExpandedNodes: (nodes: Set<string>) => void;
  setSelectedRecipeIndex: (itemId: string, index: number) => void;
  setSelectedRecipeIndices: (indices: Record<string, number>) => void;

  // Discover
  setDiscoverBoxItems: (items: string[]) => void;
  addDiscoverBoxItem: (id: string) => void;
  removeDiscoverBoxItem: (id: string) => void;

  // Collected
  toggleCollected: (id: string) => boolean; // returns new state
  addCollected: (id: string) => void;
  removeCollected: (id: string) => void;
  setCollectedItems: (items: Set<string>) => void;

  // Filters
  setShowTransmutations: (show: boolean) => void;
  setShowTotalQuantity: (show: boolean) => void;

  // Navigation animation
  setHighlightItemId: (id: string | null) => void;

  // History
  pushHistory: (entry: HistoryEntry) => void;
  setHistoryIdx: (idx: number) => void;
  updateCurrentHistory: (partial: Partial<HistoryEntry>) => void;
  setAppHistory: (history: HistoryEntry[]) => void;

  // Persistence
  saveToLocalStorage: () => void;
  loadFromLocalStorage: () => void;
}

// --- Load persisted state ---

function loadPersistedSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return new Set(JSON.parse(raw));
  } catch { /* ignore */ }
  return new Set();
}

function loadPersistedArray(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

// --- Store ---

export const useStore = create<AppState>((set, get) => ({
  // Data layer
  itemsDatabase: {},
  itemIndex: [],
  usageIndex: {},
  isDataLoaded: false,

  // Data loading
  engineVersion: '1.4.5',
  statusText: '',
  isLoading: false,
  loadError: null,

  // Camera targets
  targetX: 0,
  targetY: 0,
  targetScale: 1,

  // View
  currentViewType: 'home',
  currentTreeItemId: null,
  currentCategoryName: null,
  treeMode: 'recipe',

  // Tree
  expandedNodes: loadPersistedSet('terraria_expandedNodes'),
  isExpandedAll: false,
  selectedRecipeIndices: {},

  // Discover
  discoverBoxItems: loadPersistedArray('terraria_discoverBox'),

  // Collected
  collectedItems: loadPersistedSet('terraria_collectedItems'),

  // Filters
  showTransmutations: false,
  showTotalQuantity: false,

  // Navigation animation
  highlightItemId: null,

  // History
  appHistory: [],
  historyIdx: -1,

  // --- Actions ---

  setItemsDatabase: (db) => set({ itemsDatabase: db }),
  setItemIndex: (index) => set({ itemIndex: index }),
  setUsageIndex: (index) => set({ usageIndex: index }),
  setDataLoaded: (loaded) => set({ isDataLoaded: loaded }),
  setEngineVersion: (version) => set({ engineVersion: version }),
  setLoadingStatus: (status) =>
    set((state) => ({
      isLoading: status.isLoading ?? state.isLoading,
      statusText: status.statusText ?? state.statusText,
      loadError: status.loadError !== undefined ? status.loadError : state.loadError,
    })),

  snapNextCamera: false,
  setSnapNextCamera: (snap) => set({ snapNextCamera: snap }),

  setTarget: (x, y, scale) => set({ targetX: x, targetY: y, targetScale: scale }),

  setViewType: (viewType) => set({ currentViewType: viewType }),
  setCurrentTreeItemId: (id) => set({ currentTreeItemId: id }),
  setCurrentCategoryName: (name) => set({ currentCategoryName: name }),
  setTreeMode: (mode) => set({ treeMode: mode }),

  addExpandedNode: (nodeId) =>
    set((state) => {
      const next = new Set(state.expandedNodes);
      next.add(nodeId);
      return { expandedNodes: next };
    }),
  removeExpandedNode: (nodeId) =>
    set((state) => {
      const next = new Set(state.expandedNodes);
      next.delete(nodeId);
      return { expandedNodes: next };
    }),
  clearExpandedNodes: () => set({ expandedNodes: new Set() }),
  setExpandedNodes: (nodes) => set({ expandedNodes: nodes }),
  setSelectedRecipeIndex: (itemId, index) =>
    set((state) => ({
      selectedRecipeIndices: { ...state.selectedRecipeIndices, [itemId]: index },
    })),
  setSelectedRecipeIndices: (indices) => set({ selectedRecipeIndices: indices }),

  setDiscoverBoxItems: (items) => set({ discoverBoxItems: items }),
  addDiscoverBoxItem: (id) =>
    set((state) => {
      if (state.discoverBoxItems.includes(id)) return state;
      return { discoverBoxItems: [...state.discoverBoxItems, id] };
    }),
  removeDiscoverBoxItem: (id) =>
    set((state) => ({
      discoverBoxItems: state.discoverBoxItems.filter((item) => item !== id),
    })),

  toggleCollected: (id) => {
    const state = get();
    const next = new Set(state.collectedItems);
    const isNowCollected = !next.has(id);
    if (isNowCollected) {
      next.add(id);
    } else {
      next.delete(id);
    }
    set({ collectedItems: next });
    return isNowCollected;
  },
  addCollected: (id) =>
    set((state) => {
      const next = new Set(state.collectedItems);
      next.add(id);
      return { collectedItems: next };
    }),
  removeCollected: (id) =>
    set((state) => {
      const next = new Set(state.collectedItems);
      next.delete(id);
      return { collectedItems: next };
    }),
  setCollectedItems: (items) => set({ collectedItems: items }),

  setShowTransmutations: (show) => set({ showTransmutations: show }),
  setShowTotalQuantity: (show) => set({ showTotalQuantity: show }),

  setHighlightItemId: (id) => set({ highlightItemId: id }),

  pushHistory: (entry) =>
    set((state) => {
      // Truncate forward history when pushing new entry
      const newHistory = state.appHistory.slice(0, state.historyIdx + 1);
      newHistory.push(entry);
      return { appHistory: newHistory, historyIdx: newHistory.length - 1 };
    }),
  setHistoryIdx: (idx) => set({ historyIdx: idx }),
  updateCurrentHistory: (partial) =>
    set((state) => {
      if (state.historyIdx < 0 || state.historyIdx >= state.appHistory.length) return state;
      const newHistory = [...state.appHistory];
      newHistory[state.historyIdx] = { ...newHistory[state.historyIdx], ...partial };
      return { appHistory: newHistory };
    }),
  setAppHistory: (history) => set({ appHistory: history }),

  saveToLocalStorage: () => {
    const state = get();
    try {
      localStorage.setItem('terraria_expandedNodes', JSON.stringify([...state.expandedNodes]));
      localStorage.setItem('terraria_discoverBox', JSON.stringify(state.discoverBoxItems));
      localStorage.setItem('terraria_collectedItems', JSON.stringify([...state.collectedItems]));
    } catch { /* localStorage might be full or unavailable */ }
  },
  loadFromLocalStorage: () => {
    set({
      expandedNodes: loadPersistedSet('terraria_expandedNodes'),
      discoverBoxItems: loadPersistedArray('terraria_discoverBox'),
      collectedItems: loadPersistedSet('terraria_collectedItems'),
    });
  },
}));
