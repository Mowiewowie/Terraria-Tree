# TerrariTree - Claude Code Project Context

## What Is This
TerrariTree is a browser-based interactive crafting tree visualizer for Terraria. Pure vanilla JS (no build tools), served as static files. Uses Tailwind CSS via CDN + custom `styles.css`.

## Architecture

### File Structure
```
app-js/
  state.js      - Global variables, DOM refs (const dom = {...}), RECIPE_GROUPS, utility functions
  data.js       - JSON loading, schema normalization, buildUsageIndex(), initializeData()
  engine.js     - Canvas physics: renderLoop() with 15% lerp, triggerAnimation(), pan/zoom events
  router.js     - History API, IK FLIP transitions, saveCurrentState(), resetView(), popstate
  ui.js         - showTooltip(), moveTooltip(), attachSearchLogic(), mobile UX
  tree-core.js  - loadTree(), loadCategory(), createItemCardElement(), expand/collapse all, focusSubtree()
  tree-nodes.js - createTreeNode(), createDiscoverRootNode(), createForwardChainNode(), discovery DAG engine, SVG convergence lines
  sw.js         - Service worker for offline caching
index.html      - Single page app, all DOM elements with IDs
styles.css      - CSS variables (--line-hover: #f59e0b), dark mode, .fast-panning GPU mode, tree line pseudo-elements, rarity colors
```

### Key Data Structures
- **`itemsDatabase`** — `{[id]: {ID, DisplayName, Category, Recipes: [{Stations, Ingredients: [{ID, Name, Amount}], IsTransmutation}], Stats, ...}}`
- **`itemIndex`** — Flat searchable array `[{id, name, type, icon_url}]`
- **`usageIndex`** — Reverse lookup: `{[ingredient_name_lower]: [{id, amount, recipe, viaGroup}]}`
- **`RECIPE_GROUPS`** — "Any Wood", "Any Iron Bar", etc. (26 groups) mapping to valid item arrays

### Key Global State Variables
- `currentX/Y/Scale`, `targetX/Y/Scale` — Camera position (lerp-animated)
- `isAnimating` — Whether renderLoop is active
- `treeMode` — `'recipe'` | `'usage'` | `'discover'`
- `expandedNodes` — `Set<string>` of expanded node IDs, persisted to localStorage + appHistory
- `discoverBoxItems` — `Array<string>` of item IDs in discover box
- `collectedItems` — `Set<string>` for checkmark tracking
- `showTransmutations`, `showTotalQuantity` — Filter toggles
- `appHistory[]`, `historyIdx` — Navigation history with viewport state, expanded nodes, item locations

### CSS Tree Line System
Tree connections are pure CSS pseudo-elements (`::after`) on `.tree-line-btn`, `.line-h`, `.line-v` — 2px lines in 24px gaps. The `.lines-hovered` class highlights them amber on hover.

### Canvas System
- `renderLoop()` in engine.js: `current += (target - current) * 0.15` applied to translate3d + scale
- `triggerAnimation()` starts the RAF loop
- `.fast-panning` class strips box-shadows and transitions during drag for GPU performance
- `focusSubtree(nodeEl, containerEl)` zooms/pans to fit a node + its children

## Three Tree Modes

### Recipe Mode (`treeMode === 'recipe'`)
Root item at top, ingredients below. `createTreeNode()` recursively expands. Blue expand buttons.

### Usage Mode (`treeMode === 'usage'`)
Root item at bottom (`column-reverse`), items that USE it above. Purple expand buttons. CSS class `mode-usage` on `#treeContainer`.

### Discover Mode (`treeMode === 'discover'`)
2+ items in discover box → `buildDiscoveryGraph()`:
1. BFS contribution tracking through `usageIndex` — tracks which box items contribute to each craftable
2. Convergence targets = items where ALL box items contribute through different ingredients (no single ingredient covers all)
3. Forward usage trees built per box item, filtered to convergence-contributing paths only
4. Convergence targets claimed by first tree to reach them
5. SVG convergence lines connect source ingredients to targets with colored bezier curves + arrowheads
6. Lines have hover tooltips (300ms delay) showing source item + card glow
7. Clicking a colored line centers camera on source card with double-flash highlight

Green expand buttons. `createForwardChainNode()` renders nodes. `drawConvergenceLines()` draws SVG overlay. Transmutations/Totals buttons hidden in this mode.

### Convergence Line Colors
Generated via golden angle: `hsl(${idx * 137.5 % 360}, 70%, 55%)`. Target cards get `.convergence-target` class (exempt from `.fast-panning` box-shadow strip).

## Navigation & Transitions
- Clicking an item card → `transitionToNewItem()` → hero FLIP animation (card scales up, others fade, camera flies to new tree)
- Back/forward → `popstate` → restores `expandedNodes`, `discoverBoxItems`, camera position, recipe indices
- `saveCurrentState()` persists everything to `appHistory[historyIdx]` + localStorage
- `performIKTransition()` handles DOM swap with ghost overlay fade

## Expand/Collapse System
- Standard `expand-btn` class with `btn.toggle(targetState)` method returning `true`/`false`
- `syncExpandAllButton()` queries `.expand-btn:not(.deep-expand-btn)` to enable/disable toolbar buttons
- `executeExpandAll()` loops up to 20 iterations calling `btn.toggle('open')` on all buttons
- `estimateTreeSize()` warns user if >200 nodes (discover mode uses `buildDiscoveryGraph()` for accurate count)
- `expandedNodes` Set persists which nodes are open across tree rebuilds and navigation

## Tooltip System
- `showTooltip(e, data, extraRecipe)` in ui.js — renders item name, icon, stats, recipes, drops
- `moveTooltip(e)` — repositions to stay in viewport
- Tree line hover: 300ms delay via `lineTooltipTimeout` before showing parent item tooltip
- Convergence line hover: 300ms delay, shows source ingredient, glows source card border

## Item Card Highlight
`highlightCard(cardEl, color)` — waits for `isAnimating` to settle, then double-flashes the card border (200ms on/off × 2). Used on tree line clicks (amber `#f59e0b`) and convergence line clicks (line's color).

## Collected Items
- Checkmark button on each card toggles `collectedItems` set
- `cascadeCollectedDown()` marks all descendants
- `propagateCollectedUp()` marks parents when all ingredients satisfied
- `syncAllCollectedCards()` updates all visible checkmark visuals
- Green border + checkmark icon when collected

## LocalStorage Keys
- `terraria_expandedNodes` — JSON stringified Set
- `terraria_discoverBox` — JSON stringified Array
- `terraria_collectedItems` — JSON stringified Set

## Common Patterns
- DOM elements referenced via `dom.xxx` object (state.js)
- Cards use `data-id` attribute for item identification
- `requestAnimationFrame(() => requestAnimationFrame(fn))` — double rAF for layout-dependent operations
- `no-pan` class on interactive elements prevents canvas drag interference
- Mode-specific button colors: blue (recipe), purple (usage), emerald (discover)

## Testing
No test framework. Test manually by:
1. Open index.html in browser (or local server)
2. Search for items, switch modes, expand/collapse, navigate back/forward
3. Discover mode: add 2+ items (e.g., Copper Ore + Iron Ore), verify convergence lines and expand behavior

## Warning
DO NOT read the entirety of any *.json files. They are millions of tokens long and will immediately break Claude. The only exceptions are terraria_items_test.json and Terraria_All_1.4.4_Export_Test.json, and any other settings based json files.