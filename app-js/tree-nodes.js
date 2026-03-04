// --- Function: Specific logic algorithms for Discover, Recipe logic, and generating individual tree nodes ---

// --- Sub-Tree & Specific Node Generation Logic ---

function getDiscoverableItems() {
    if (discoverBoxItems.length === 0) return [];
    
    const boxItemNames = discoverBoxItems.map(id => (itemsDatabase[id].DisplayName || "").toLowerCase());
    const uniqueUsagesMap = new Map();

    for (const itemId in itemsDatabase) {
        const item = itemsDatabase[itemId];
        if (!item.Recipes || item.Recipes.length === 0) continue;
        
        for (const recipe of item.Recipes) {
            if (!showTransmutations && recipe.IsTransmutation) continue;
            let recipeMatchesAll = true;
            for (const boxName of boxItemNames) {
                let hasBoxItem = false;
                if (!recipe.Ingredients) continue;
                for (const ing of recipe.Ingredients) {
                    const ingLower = (ing.Name || "").toLowerCase();
                    if (ingLower === boxName) {
                        hasBoxItem = true; break;
                    }
                    if (ingLower.startsWith("any ")) {
                        const groupKey = Object.keys(RECIPE_GROUPS).find(k => k.toLowerCase() === ingLower);
                        if (groupKey && RECIPE_GROUPS[groupKey].map(x=>x.toLowerCase()).includes(boxName)) {
                            hasBoxItem = true; break;
                        }
                    }
                }
                if (!hasBoxItem) {
                    recipeMatchesAll = false; break;
                }
            }
            
            if (recipeMatchesAll) {
                if (!uniqueUsagesMap.has(itemId)) {
                    uniqueUsagesMap.set(itemId, { id: itemId, amount: 1, recipe: recipe });
                }
                break; 
            }
        }
    }
    
    const uniqueUsages = Array.from(uniqueUsagesMap.values());
    uniqueUsages.sort((a,b) => {
        const nameA = itemsDatabase[a.id]?.DisplayName || itemsDatabase[a.id]?.name || "";
        const nameB = itemsDatabase[b.id]?.DisplayName || itemsDatabase[b.id]?.name || "";
        return nameA.localeCompare(nameB);
    });
    return uniqueUsages;
}

function getRecursiveDiscoverableItems() {
    if (discoverBoxItems.length < 2) return getDiscoverableItems();

    const boxItemNames = new Set(
        discoverBoxItems.map(id => (itemsDatabase[id]?.DisplayName || "").toLowerCase())
    );
    const boxItemIds = new Set(discoverBoxItems.map(String));

    // contributions[itemName] = Set of box item names in its crafting ancestry
    const contributions = new Map();
    for (const name of boxItemNames) {
        contributions.set(name, new Set([name]));
    }

    const queue = [...boxItemNames];
    let iterations = 0;

    while (queue.length > 0 && iterations < 50000) {
        iterations++;
        const itemName = queue.shift();
        const usages = usageIndex[itemName] || [];

        for (const usage of usages) {
            if (!showTransmutations && usage.recipe.IsTransmutation) continue;

            const parentId = String(usage.id);
            const parentData = itemsDatabase[parentId];
            if (!parentData) continue;
            const parentName = (parentData.DisplayName || "").toLowerCase();

            // Compute contributions from ALL ingredients of this recipe
            let parentContribs = contributions.get(parentName) || new Set();
            const oldSize = parentContribs.size;

            for (const ing of usage.recipe.Ingredients || []) {
                const ingName = (ing.Name || "").toLowerCase();

                // Direct ingredient contributions
                const ingContribs = contributions.get(ingName);
                if (ingContribs) {
                    for (const c of ingContribs) parentContribs.add(c);
                }

                // "Any X" group: check contributions from all group members
                if (RECIPE_GROUPS[ing.Name]) {
                    for (const member of RECIPE_GROUPS[ing.Name]) {
                        const memberContribs = contributions.get(member.toLowerCase());
                        if (memberContribs) {
                            for (const c of memberContribs) parentContribs.add(c);
                        }
                    }
                }
            }

            if (parentContribs.size > oldSize || !contributions.has(parentName)) {
                contributions.set(parentName, parentContribs);
                queue.push(parentName);
            }
        }
    }

    // Collect items where ALL box items contribute and item is not in the box
    const results = new Map();
    for (const [name, contribs] of contributions) {
        if (contribs.size === boxItemNames.size && !boxItemNames.has(name)) {
            const found = itemIndex.find(i => (i.name || "").toLowerCase() === name);
            if (found && !boxItemIds.has(String(found.id)) && !results.has(String(found.id))) {
                results.set(String(found.id), { id: String(found.id), amount: 1 });
            }
        }
    }

    const uniqueUsages = Array.from(results.values());
    uniqueUsages.sort((a, b) => {
        const nameA = itemsDatabase[a.id]?.DisplayName || "";
        const nameB = itemsDatabase[b.id]?.DisplayName || "";
        return nameA.localeCompare(nameB);
    });
    return uniqueUsages;
}

// --- Discovery DAG: Forward usage trees with convergence detection ---

function buildDiscoveryGraph() {
    if (discoverBoxItems.length < 2) return null;

    const boxItemNames = new Set(
        discoverBoxItems.map(id => (itemsDatabase[id]?.DisplayName || "").toLowerCase())
    );
    const boxItemIds = new Set(discoverBoxItems.map(String));

    const nameToId = new Map();
    for (const id of Object.keys(itemsDatabase)) {
        const name = (itemsDatabase[id]?.DisplayName || "").toLowerCase();
        if (name) nameToId.set(name, String(id));
    }

    // Step 1: BFS contribution tracking (forward propagation through usageIndex)
    const contributions = new Map();
    for (const name of boxItemNames) contributions.set(name, new Set([name]));

    const queue = [...boxItemNames];
    let iterations = 0;
    while (queue.length > 0 && iterations < 50000) {
        iterations++;
        const itemName = queue.shift();
        const usages = usageIndex[itemName] || [];
        for (const usage of usages) {
            if (!showTransmutations && usage.recipe.IsTransmutation) continue;
            const parentId = String(usage.id);
            const parentData = itemsDatabase[parentId];
            if (!parentData) continue;
            const parentName = (parentData.DisplayName || "").toLowerCase();

            let parentContribs = contributions.get(parentName) || new Set();
            const oldSize = parentContribs.size;
            for (const ing of usage.recipe.Ingredients || []) {
                const ingName = (ing.Name || "").toLowerCase();
                const ic = contributions.get(ingName);
                if (ic) for (const c of ic) parentContribs.add(c);
                if (RECIPE_GROUPS[ing.Name]) {
                    for (const member of RECIPE_GROUPS[ing.Name]) {
                        const mc = contributions.get(member.toLowerCase());
                        if (mc) for (const c of mc) parentContribs.add(c);
                    }
                }
            }
            if (parentContribs.size > oldSize || !contributions.has(parentName)) {
                contributions.set(parentName, parentContribs);
                queue.push(parentName);
            }
        }
    }

    // Step 2: Find first-level convergence targets
    const convergenceTargetNames = new Set();
    const convergences = [];
    for (const [name, contribs] of contributions) {
        if (contribs.size !== boxItemNames.size || boxItemNames.has(name)) continue;
        const itemId = nameToId.get(name);
        if (!itemId || boxItemIds.has(itemId)) continue;
        const itemData = itemsDatabase[itemId];
        if (!itemData?.Recipes) continue;

        for (const recipe of itemData.Recipes) {
            if (!showTransmutations && recipe.IsTransmutation) continue;
            if (!recipe.Ingredients) continue;

            const coveredByAll = new Set();
            let anyIngCoversAll = false;
            for (const ing of recipe.Ingredients) {
                let ingC = contributions.get((ing.Name || "").toLowerCase()) || new Set();
                if (RECIPE_GROUPS[ing.Name]) {
                    const merged = new Set(ingC);
                    for (const m of RECIPE_GROUPS[ing.Name]) {
                        const mc = contributions.get(m.toLowerCase());
                        if (mc) for (const c of mc) merged.add(c);
                    }
                    ingC = merged;
                }
                for (const c of ingC) coveredByAll.add(c);
                if (ingC.size >= boxItemNames.size) anyIngCoversAll = true;
            }

            if (coveredByAll.size === boxItemNames.size && !anyIngCoversAll) {
                // Collect ingredient IDs that carry box item contributions
                const ingredientIds = [];
                for (const ing of recipe.Ingredients) {
                    const ingName = (ing.Name || "").toLowerCase();
                    let ingContribs = contributions.get(ingName) || new Set();
                    if (RECIPE_GROUPS[ing.Name]) {
                        const merged = new Set(ingContribs);
                        for (const m of RECIPE_GROUPS[ing.Name]) {
                            const mc = contributions.get(m.toLowerCase());
                            if (mc) for (const c of mc) merged.add(c);
                        }
                        ingContribs = merged;
                    }
                    if (ingContribs.size > 0) {
                        let ingId = nameToId.get(ingName);
                        if (!ingId && RECIPE_GROUPS[ing.Name]) {
                            for (const member of RECIPE_GROUPS[ing.Name]) {
                                const mid = nameToId.get(member.toLowerCase());
                                if (mid && contributions.has(member.toLowerCase())) { ingId = mid; break; }
                            }
                        }
                        if (ingId) ingredientIds.push(ingId);
                    }
                }

                convergenceTargetNames.add(name);
                convergences.push({
                    targetId: itemId,
                    targetName: name,
                    ingredientIds,
                    color: `hsl(${(convergences.length * 137.5) % 360}, 70%, 55%)`
                });
                break;
            }
        }
    }

    if (convergences.length === 0) return null;

    // Build set of convergence ingredient IDs for keep-alive during tree pruning
    const convIngredientIds = new Set();
    for (const conv of convergences) {
        for (const iid of conv.ingredientIds) convIngredientIds.add(iid);
    }

    // Step 3: Build forward usage trees from each box item
    // Convergence targets are claimed by the first tree that reaches them (order = discoverBoxItems order)
    const claimed = new Set();
    const trees = [];

    for (const boxId of discoverBoxItems) {
        const boxName = (itemsDatabase[boxId]?.DisplayName || "").toLowerCase();

        function buildSubTree(itemName, visited, depth) {
            if (depth > 15 || visited.has(itemName)) return null;
            visited.add(itemName);

            const id = nameToId.get(itemName);
            if (!id) return null;

            // Convergence target → leaf node (claimed by first tree to reach it)
            if (convergenceTargetNames.has(itemName)) {
                if (claimed.has(id)) return null;
                claimed.add(id);
                const convIdx = convergences.findIndex(c => c.targetId === id);
                return { id, children: [], convergenceIdx: convIdx };
            }

            // Recurse into items that USE this item (forward through usageIndex)
            const usages = usageIndex[itemName] || [];
            const children = [];
            const seenIds = new Set();

            for (const usage of usages) {
                if (!showTransmutations && usage.recipe.IsTransmutation) continue;
                const childId = String(usage.id);
                if (seenIds.has(childId)) continue;
                const childData = itemsDatabase[childId];
                if (!childData) continue;
                const childName = (childData.DisplayName || "").toLowerCase();

                // Only follow items where this box item contributes
                const childContribs = contributions.get(childName);
                if (!childContribs || !childContribs.has(boxName)) continue;

                const childTree = buildSubTree(childName, new Set(visited), depth + 1);
                if (childTree) { seenIds.add(childId); children.push(childTree); }
            }

            // Keep node if it has children OR is a convergence ingredient (SVG lines need it)
            if (children.length === 0 && !convIngredientIds.has(id)) return null;
            return { id, children, convergenceIdx: null };
        }

        // First layer = direct usages of this box item on convergence paths
        const usages = usageIndex[boxName] || [];
        const firstLayerChildren = [];
        const seenIds = new Set();

        for (const usage of usages) {
            if (!showTransmutations && usage.recipe.IsTransmutation) continue;
            const childId = String(usage.id);
            if (seenIds.has(childId)) continue;
            const childData = itemsDatabase[childId];
            if (!childData) continue;
            const childName = (childData.DisplayName || "").toLowerCase();

            const childContribs = contributions.get(childName);
            if (!childContribs || !childContribs.has(boxName)) continue;

            const childTree = buildSubTree(childName, new Set([boxName]), 1);
            if (childTree) { seenIds.add(childId); firstLayerChildren.push(childTree); }
        }

        if (firstLayerChildren.length > 0) {
            trees.push({ boxItemId: String(boxId), children: firstLayerChildren });
        }
    }

    return { trees, convergences };
}

// --- Forward chain node renderer (for discovery DAG) ---

function createForwardChainNode(pathNode, convergences, redrawFn) {
    const data = itemsDatabase[pathNode.id];
    if (!data) return createGenericNode("Unknown Item", 0);

    const node = document.createElement('div');
    node.className = 'tree-node';

    const card = createItemCardElement(data, 'w-24 h-24');

    // Apply convergence color to target nodes
    if (pathNode.convergenceIdx !== null && convergences[pathNode.convergenceIdx]) {
        const color = convergences[pathNode.convergenceIdx].color;
        card.style.boxShadow = `0 0 0 3px ${color}, 0 0 12px ${color}`;
        card.classList.add('convergence-target');
    }

    node.appendChild(card);

    if (pathNode.children.length > 0) {
        const btn = document.createElement('button');
        btn.className = 'expand-btn mt-2 mb-2 w-6 h-6 rounded-full bg-slate-400 dark:bg-slate-700 hover:bg-emerald-700 text-white text-xs flex items-center justify-center transition-colors shadow-md z-20 cursor-pointer no-pan';
        btn.innerHTML = '<i class="fa-solid fa-plus"></i>';

        const container = document.createElement('div');
        container.className = 'tree-children hidden';

        let lineTooltipTimeout;
        const attachLineEvents = (el) => {
            el.onmousemove = (e) => { lastMouseCoords = { x: e.clientX, y: e.clientY }; if (!dom.tooltip.el.classList.contains('hidden')) moveTooltip(e); };
            el.onmouseenter = (e) => {
                container.classList.add('lines-hovered');
                lastMouseCoords = { x: e.clientX, y: e.clientY };
                lineTooltipTimeout = setTimeout(() => { showTooltip(lastMouseCoords, data); }, 300);
            };
            el.onmouseleave = () => { container.classList.remove('lines-hovered'); clearTimeout(lineTooltipTimeout); dom.tooltip.el.classList.add('hidden'); };
            el.onclick = (e) => { e.stopPropagation(); focusSubtree(node, container); highlightCard(node.querySelector('.item-card')); };
        };

        btn.toggle = (targetState) => {
            const isClosed = container.classList.contains('hidden');
            if (targetState === 'open' && !isClosed) return false;
            if (targetState === 'close' && isClosed) return false;

            if (!isClosed) {
                container.classList.add('hidden');
                btn.innerHTML = '<i class="fa-solid fa-plus"></i>';
                btn.classList.remove('bg-emerald-600');
                // Remove this node and all loaded children from expanded set
                const childCards = container.querySelectorAll('.item-card');
                childCards.forEach(c => { if (c.dataset.id) expandedNodes.delete(c.dataset.id); });
                expandedNodes.delete(pathNode.id);
                if (redrawFn) requestAnimationFrame(redrawFn);
            } else {
                container.innerHTML = '';
                container.classList.remove('hidden');
                btn.innerHTML = '<i class="fa-solid fa-minus"></i>';
                btn.classList.add('bg-emerald-600');
                expandedNodes.add(pathNode.id);

                const lineBtn = document.createElement('button');
                lineBtn.className = 'tree-line-btn';
                attachLineEvents(lineBtn);
                container.appendChild(lineBtn);

                pathNode.children.forEach(child => {
                    const childNode = createForwardChainNode(child, convergences, redrawFn);
                    const hLine = document.createElement('div'); hLine.className = 'line-h'; attachLineEvents(hLine);
                    const vLine = document.createElement('div'); vLine.className = 'line-v'; attachLineEvents(vLine);
                    childNode.appendChild(hLine); childNode.appendChild(vLine);
                    container.appendChild(childNode);
                });

                const cNodes = Array.from(container.children).filter(c => c.classList.contains('tree-node'));
                if (cNodes.length > 0) {
                    cNodes[0].classList.add('is-first');
                    cNodes[cNodes.length - 1].classList.add('is-last');
                    if (cNodes.length === 1) cNodes[0].classList.add('is-only');
                }

                if (redrawFn) requestAnimationFrame(() => requestAnimationFrame(redrawFn));
                setTimeout(() => {
                    const vizRect = dom.vizArea.getBoundingClientRect();
                    const nRect = node.getBoundingClientRect();
                    const cRect = container.getBoundingClientRect();

                    const top = Math.min(nRect.top, cRect.top);
                    const bottom = Math.max(nRect.bottom, cRect.bottom);
                    const left = Math.min(nRect.left, cRect.left);
                    const right = Math.max(nRect.right, cRect.right);

                    let dx = 0, dy = 0;
                    const padding = 60;

                    if (left < vizRect.left + padding) dx = (vizRect.left + padding) - left;
                    else if (right > vizRect.right - padding) dx = (vizRect.right - padding) - right;

                    if (top < vizRect.top + padding) dy = (vizRect.top + padding) - top;
                    else if (bottom > vizRect.bottom - padding) dy = (vizRect.bottom - padding) - bottom;

                    if (dx !== 0 || dy !== 0) {
                        targetX += dx;
                        targetY += dy;
                        triggerAnimation();
                    }
                }, 100);
            }
            return true;
        };

        btn.onclick = (e) => {
            e.stopPropagation();
            btn.toggle();
            setTimeout(() => syncExpandAllButton(), 10);
            saveCurrentState();
        };

        node.append(btn, container);

        // Auto-restore expanded state from history
        if (expandedNodes.has(pathNode.id)) btn.toggle('open');
    }

    return node;
}

// --- Post-navigation card highlight effect ---

function highlightCard(cardEl, color) {
    if (!cardEl) return;
    const c = color || '#f59e0b';
    const glow = `0 0 0 3px ${c}, 0 0 20px 4px ${c}`;
    // Wait for camera animation to settle before flashing
    let checks = 0;
    const waitForSettle = () => {
        if (isAnimating && checks < 60) {
            checks++;
            requestAnimationFrame(waitForSettle);
            return;
        }
        const saved = cardEl.style.boxShadow;
        cardEl.style.boxShadow = glow;
        setTimeout(() => { cardEl.style.boxShadow = saved; }, 200);
        setTimeout(() => { cardEl.style.boxShadow = glow; }, 400);
        setTimeout(() => { cardEl.style.boxShadow = saved; }, 600);
    };
    requestAnimationFrame(waitForSettle);
}

// --- SVG convergence line helpers ---

function screenToLocal(rect, refRect, scale) {
    return {
        x: (rect.left - refRect.left) / scale,
        y: (rect.top - refRect.top) / scale,
        w: rect.width / scale,
        h: rect.height / scale
    };
}

function bezierControlPoints(s, e) {
    const dx = e.x - s.x, dy = e.y - s.y;
    const mx = (s.x + e.x) / 2, my = (s.y + e.y) / 2;
    if (Math.abs(dx) >= Math.abs(dy)) {
        return [{ x: mx, y: s.y }, { x: mx, y: e.y }];
    }
    return [{ x: s.x, y: my }, { x: e.x, y: my }];
}

// --- SVG convergence line drawing with hover tooltips ---

function drawConvergenceLines(rootNode, convergences) {
    const svg = rootNode.querySelector('.convergence-svg');
    if (!svg) return;
    svg.innerHTML = '';

    const svgParent = svg.parentElement;
    const refRect = svgParent.getBoundingClientRect();
    const scale = currentScale || 1;

    // Arrowhead markers
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

    let lineIndex = 0;
    const totalLines = convergences.reduce((sum, conv) => sum + conv.ingredientIds.filter(id => id !== conv.targetId).length, 0);

    convergences.forEach((conv, convIdx) => {
        const targetEl = rootNode.querySelector(`.item-card[data-id="${conv.targetId}"]`);
        if (!targetEl || targetEl.offsetParent === null) return;
        const tr = targetEl.getBoundingClientRect();
        if (tr.width === 0 && tr.height === 0) return;
        const tRect = screenToLocal(tr, refRect, scale);

        conv.ingredientIds.forEach(ingId => {
            if (ingId === conv.targetId) return;
            const sourceEl = rootNode.querySelector(`.item-card[data-id="${ingId}"]`);
            if (!sourceEl || sourceEl.offsetParent === null) return;
            const sr = sourceEl.getBoundingClientRect();
            if (sr.width === 0 && sr.height === 0) return;
            const sRect = screenToLocal(sr, refRect, scale);

            // Edge attachment points with per-line offset to avoid overlap
            const scx = sRect.x + sRect.w / 2, scy = sRect.y + sRect.h / 2;
            const tcx = tRect.x + tRect.w / 2, tcy = tRect.y + tRect.h / 2;
            const dx = tcx - scx, dy = tcy - scy;
            const perpOffset = (lineIndex - (totalLines - 1) / 2) * 5;
            let sx, sy, ex, ey;

            if (Math.abs(dx) >= Math.abs(dy)) {
                sx = dx > 0 ? sRect.x + sRect.w : sRect.x;
                ex = dx > 0 ? tRect.x : tRect.x + tRect.w;
                sy = scy + perpOffset; ey = tcy + perpOffset;
            } else {
                sy = dy > 0 ? sRect.y + sRect.h : sRect.y;
                ey = dy > 0 ? tRect.y : tRect.y + tRect.h;
                sx = scx + perpOffset; ex = tcx + perpOffset;
            }

            const [cp1, cp2] = bezierControlPoints({ x: sx, y: sy }, { x: ex, y: ey });
            const d = `M${sx},${sy} C${cp1.x},${cp1.y} ${cp2.x},${cp2.y} ${ex},${ey}`;

            // Invisible wider hit-area path for easier hover
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

            // Hover: show tooltip for source ingredient (with delay) + glow source card
            const srcData = itemsDatabase[ingId];
            let savedBoxShadow = '';
            let convTooltipTimeout;
            hitPath.addEventListener('mouseenter', (e) => {
                lastMouseCoords = { x: e.clientX, y: e.clientY };
                convTooltipTimeout = setTimeout(() => { if (srcData) showTooltip(lastMouseCoords, srcData); }, 300);
                path.setAttribute('stroke-width', '4');
                path.setAttribute('opacity', '1');
                const srcCard = rootNode.querySelector(`.item-card[data-id="${ingId}"]`);
                if (srcCard) {
                    savedBoxShadow = srcCard.style.boxShadow;
                    srcCard.style.boxShadow = `0 0 0 3px ${conv.color}, 0 0 12px ${conv.color}`;
                }
            });
            hitPath.addEventListener('mousemove', (e) => {
                lastMouseCoords = { x: e.clientX, y: e.clientY };
                if (!dom.tooltip.el.classList.contains('hidden')) moveTooltip(e);
            });
            hitPath.addEventListener('mouseleave', () => {
                clearTimeout(convTooltipTimeout);
                dom.tooltip.el.classList.add('hidden');
                path.setAttribute('stroke-width', '2.5');
                path.setAttribute('opacity', '0.8');
                const srcCard = rootNode.querySelector(`.item-card[data-id="${ingId}"]`);
                if (srcCard) srcCard.style.boxShadow = savedBoxShadow;
            });
            hitPath.addEventListener('click', (e) => {
                e.stopPropagation();
                const srcCard = rootNode.querySelector(`.item-card[data-id="${ingId}"]`);
                if (!srcCard) return;
                const tr = dom.treeContainer.getBoundingClientRect();
                const cr = srcCard.getBoundingClientRect();
                const localCX = (cr.left + cr.width / 2 - tr.left) / currentScale;
                const localCY = (cr.top + cr.height / 2 - tr.top) / currentScale;
                const viz = dom.vizArea.getBoundingClientRect();
                targetX = viz.width / 2 - localCX * currentScale;
                targetY = viz.height / 2 - localCY * currentScale;
                triggerAnimation();
                highlightCard(srcCard, conv.color);
            });

            svg.appendChild(hitPath);
            svg.appendChild(path);
            lineIndex++;
        });
    });
}

function createDiscoverRootNode() {
    const node = document.createElement('div');
    node.className = 'tree-node is-root';

    const boxContainer = document.createElement('div');
    boxContainer.className = 'discover-box-container bg-white dark:bg-slate-800 border-4 border-emerald-500 ring-4 ring-emerald-500/20 rounded-xl p-4 flex flex-col items-center shadow-2xl relative z-10 w-96';
    boxContainer.dataset.id = 'discover_root';

    const header = document.createElement('div');
    // Added 'select-none' to prevent text highlighting while dragging the canvas
    header.className = 'w-full flex justify-between items-center mb-4 border-b border-slate-200 dark:border-slate-700 pb-2 select-none';
    
    const title = document.createElement('h3');
    title.className = 'text-emerald-600 dark:text-emerald-400 font-bold text-lg flex items-center gap-2 select-none';
    title.innerHTML = '<i class="fa-solid fa-compass"></i> Discover Box';
    
    header.appendChild(title);
    boxContainer.appendChild(header);

    const itemsGrid = document.createElement('div');
    itemsGrid.className = 'flex flex-wrap justify-center gap-3 w-full mb-4';

    discoverBoxItems.forEach(itemId => {
        const itemData = itemsDatabase[itemId];
        if (!itemData) return;
        
        const miniCardWrapper = document.createElement('div');
        miniCardWrapper.className = 'relative group';
        
        const card = createItemCardElement(itemData, 'w-20 h-20 bg-slate-50 dark:bg-slate-800/50', null, (e) => { 
            treeMode = 'recipe';
            const radio = document.querySelector(`input[name="treeMode"][value="recipe"]`);
            if (radio) radio.checked = true;
            transitionToNewItem(e.currentTarget, itemId); 
        });
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] shadow-md hover:bg-red-600 transition-colors z-20 opacity-0 group-hover:opacity-100 no-pan cursor-pointer';
        removeBtn.innerHTML = '<i class="fa-solid fa-times"></i>';
        removeBtn.onclick = (e) => {
            e.stopPropagation();
            discoverBoxItems = discoverBoxItems.filter(id => id !== itemId);
            saveCurrentState();
            loadTree(currentTreeItemId, true, false, 'instant');
        };
        
        miniCardWrapper.append(card, removeBtn);
        itemsGrid.appendChild(miniCardWrapper);
    });
    boxContainer.appendChild(itemsGrid);

    const searchWrapper = document.createElement('div');
    searchWrapper.className = 'relative w-full';
    
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.id = 'discoverSearchInput';
    searchInput.className = 'no-pan block w-full pl-8 pr-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-emerald-500 text-sm shadow-inner';
    searchInput.placeholder = 'Search to add items...';
    
    const searchIcon = document.createElement('i');
    searchIcon.className = 'fa-solid fa-plus absolute left-3 top-1/2 -translate-y-1/2 text-slate-400';
    
    const searchResults = document.createElement('div');
    searchResults.id = 'discoverSearchResults';
    searchResults.className = 'hidden absolute mt-1 w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-md shadow-2xl max-h-48 overflow-y-auto z-50';
    
    attachSearchLogic(searchInput, searchResults, (item) => {
        if (!discoverBoxItems.includes(item.id)) {
            discoverBoxItems.push(item.id);
            saveCurrentState();
            loadTree(currentTreeItemId, true, false, 'instant');
        }
    });

    searchInput.addEventListener('focus', () => {
        if (searchInput.value.length >= 2 && searchResults.innerHTML.trim() !== '') {
            searchResults.classList.remove('hidden');
        }
    });

    searchWrapper.append(searchIcon, searchInput, searchResults);
    boxContainer.appendChild(searchWrapper);
    node.appendChild(boxContainer);

    // --- 2+ items: DAG visualization with convergence lines ---
    if (discoverBoxItems.length >= 2) {
        const graph = buildDiscoveryGraph();

        if (graph && graph.convergences.length > 0) {
            const btn = document.createElement('button');
            btn.className = 'expand-btn mt-2 mb-2 w-6 h-6 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs flex items-center justify-center transition-colors shadow-md z-20';
            btn.innerHTML = '<i class="fa-solid fa-minus"></i>';

            const mainContainer = document.createElement('div');
            mainContainer.className = 'relative flex flex-col items-center';

            // Paths container (first-layer items from all box-item trees)
            const pathsContainer = document.createElement('div');
            pathsContainer.className = 'tree-children';

            const redrawFn = () => drawConvergenceLines(node, graph.convergences);

            const attachLineEvents = (el) => {
                el.onmousemove = (e) => { lastMouseCoords = { x: e.clientX, y: e.clientY }; if (!dom.tooltip.el.classList.contains('hidden')) moveTooltip(e); };
                el.onmouseenter = (e) => { pathsContainer.classList.add('lines-hovered'); lastMouseCoords = { x: e.clientX, y: e.clientY }; };
                el.onmouseleave = () => { pathsContainer.classList.remove('lines-hovered'); };
                el.onclick = (e) => { e.stopPropagation(); focusSubtree(node, pathsContainer); highlightCard(node.querySelector('.discover-box-container') || node.querySelector('.item-card')); };
            };

            const lineBtn = document.createElement('button');
            lineBtn.className = 'tree-line-btn';
            attachLineEvents(lineBtn);
            pathsContainer.appendChild(lineBtn);

            // Flatten first-layer items from all box-item forward trees
            const firstLayerItems = [];
            for (const tree of graph.trees) {
                for (const child of tree.children) firstLayerItems.push(child);
            }

            firstLayerItems.forEach(pathNode => {
                const childNode = createForwardChainNode(pathNode, graph.convergences, redrawFn);
                const hLine = document.createElement('div'); hLine.className = 'line-h'; attachLineEvents(hLine);
                const vLine = document.createElement('div'); vLine.className = 'line-v'; attachLineEvents(vLine);
                childNode.appendChild(hLine); childNode.appendChild(vLine);
                pathsContainer.appendChild(childNode);
            });

            const cNodes = Array.from(pathsContainer.children).filter(c => c.classList.contains('tree-node'));
            if (cNodes.length > 0) {
                cNodes[0].classList.add('is-first');
                cNodes[cNodes.length - 1].classList.add('is-last');
                if (cNodes.length === 1) cNodes[0].classList.add('is-only');
            }

            mainContainer.appendChild(pathsContainer);

            // SVG overlay for convergence lines (no separate convergence zone — targets appear in forward trees)
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.classList.add('convergence-svg');
            mainContainer.appendChild(svg);

            // Toggle
            btn.toggle = (targetState) => {
                const isClosed = mainContainer.classList.contains('hidden');
                if (targetState === 'open' && !isClosed) return false;
                if (targetState === 'close' && isClosed) return false;
                if (!isClosed) {
                    mainContainer.classList.add('hidden');
                    btn.innerHTML = '<i class="fa-solid fa-plus"></i>';
                    btn.classList.remove('bg-emerald-600');
                } else {
                    mainContainer.classList.remove('hidden');
                    btn.innerHTML = '<i class="fa-solid fa-minus"></i>';
                    btn.classList.add('bg-emerald-600');
                    requestAnimationFrame(() => requestAnimationFrame(redrawFn));
                }
                return true;
            };
            btn.onclick = e => {
                e.stopPropagation();
                btn.toggle();
                setTimeout(() => syncExpandAllButton(), 10);
                saveCurrentState();
            };

            node.append(btn, mainContainer);

            // Initial SVG draw (double rAF to ensure layout is settled)
            requestAnimationFrame(() => requestAnimationFrame(redrawFn));
        } else {
            // 2+ items but no convergences found
            const noDataMsg = document.createElement('div');
            noDataMsg.className = 'px-4 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg shadow-lg text-slate-500 dark:text-slate-400 text-sm flex items-center gap-2 z-10 mb-5';
            noDataMsg.innerHTML = '<i class="fa-solid fa-leaf text-slate-400"></i> No craftable items found from these ingredients.';
            node.appendChild(noDataMsg);
        }
    } else {
        // 0-1 items: existing direct-match behavior
        const childrenData = getDiscoverableItems();
        if (childrenData.length > 0) {
            const btn = document.createElement('button');
            btn.className = 'expand-btn mt-2 mb-2 w-6 h-6 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs flex items-center justify-center transition-colors shadow-md z-20';
            btn.innerHTML = '<i class="fa-solid fa-minus"></i>';

            const container = document.createElement('div');
            container.className = 'tree-children';

            const attachLineEvents = (el) => {
                el.onmousemove = (e) => { lastMouseCoords = { x: e.clientX, y: e.clientY }; if (!dom.tooltip.el.classList.contains('hidden')) moveTooltip(e); };
                el.onmouseenter = (e) => { container.classList.add('lines-hovered'); lastMouseCoords = { x: e.clientX, y: e.clientY }; };
                el.onmouseleave = () => { container.classList.remove('lines-hovered'); };
                el.onclick = (e) => { e.stopPropagation(); focusSubtree(node, container); highlightCard(node.querySelector('.discover-box-container') || node.querySelector('.item-card')); };
            };

            const lineBtn = document.createElement('button');
            lineBtn.className = 'tree-line-btn';
            attachLineEvents(lineBtn);
            container.appendChild(lineBtn);

            childrenData.forEach(usage => {
                const childNode = createTreeNode(usage.id, false, new Set(), usage.recipe);
                const hLine = document.createElement('div'); hLine.className = 'line-h'; attachLineEvents(hLine);
                const vLine = document.createElement('div'); vLine.className = 'line-v'; attachLineEvents(vLine);
                childNode.appendChild(hLine); childNode.appendChild(vLine);
                container.appendChild(childNode);
            });

            const cNodes = Array.from(container.children).filter(c => c.classList.contains('tree-node'));
            if (cNodes.length > 0) {
                cNodes[0].classList.add('is-first');
                cNodes[cNodes.length - 1].classList.add('is-last');
                if (cNodes.length === 1) cNodes[0].classList.add('is-only');
            }

            btn.toggle = (targetState) => {
                const isClosed = container.classList.contains('hidden');
                if (targetState === 'open' && !isClosed) return false;
                if (targetState === 'close' && isClosed) return false;
                if (!isClosed) { container.classList.add('hidden'); btn.innerHTML = '<i class="fa-solid fa-plus"></i>'; btn.classList.remove('bg-emerald-600'); }
                else { container.classList.remove('hidden'); btn.innerHTML = '<i class="fa-solid fa-minus"></i>'; btn.classList.add('bg-emerald-600'); }
                return true;
            };
            btn.onclick = e => { e.stopPropagation(); btn.toggle(); setTimeout(() => syncExpandAllButton(), 10); saveCurrentState(); };
            node.append(btn, container);
        } else {
            const noDataMsg = document.createElement('div');
            noDataMsg.className = 'px-4 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg shadow-lg text-slate-500 dark:text-slate-400 text-sm flex items-center gap-2 z-10 mb-5';
            noDataMsg.innerHTML = discoverBoxItems.length === 0
                ? '<i class="fa-solid fa-info-circle text-slate-400"></i> Add items to the box to discover recipes.'
                : '<i class="fa-solid fa-leaf text-slate-400"></i> No craftable items found from these ingredients.';
            node.appendChild(noDataMsg);
        }
    }

    return node;
}


function createTreeNode(id, isRoot = false, visited = new Set(), parentContextRecipe = null, forceDeepExpand = false, parentQuantity = 1) {
    const data = itemsDatabase[id];
    if (!data) return createGenericNode("Unknown Item", 0);

    const node = document.createElement('div');
    node.className = 'tree-node';
    if (isRoot) node.classList.add('is-root');
    
    const rootBorder = treeMode === 'recipe' ? 'border-blue-500 ring-blue-500/20' : 'border-purple-500 ring-purple-500/20';
    const card = createItemCardElement(data, isRoot ? `w-32 h-32 ring-4 ${rootBorder}` : 'w-24 h-24', parentContextRecipe);
    
    if (isRoot) {
        const toggleModeBtn = document.createElement('button');
        toggleModeBtn.className = 'absolute left-1/2 -translate-x-1/2 px-5 py-2 rounded-full bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-xl border border-slate-300 dark:border-slate-600 text-sm font-bold z-50 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors whitespace-nowrap cursor-pointer';
        
        if (treeMode === 'recipe') {
            toggleModeBtn.style.top = '-54px'; 
            toggleModeBtn.innerHTML = '<i class="fa-solid fa-code-branch text-purple-500"></i> Used In';
            toggleModeBtn.onclick = (e) => {
                e.stopPropagation();
                switchModeKinematic('usage');
            };
        } else {
            toggleModeBtn.style.bottom = '-54px'; 
            toggleModeBtn.innerHTML = '<i class="fa-solid fa-hammer text-blue-500"></i> Recipe';
            toggleModeBtn.onclick = (e) => {
                e.stopPropagation();
                switchModeKinematic('recipe');
            };
        }
        card.appendChild(toggleModeBtn);
    }
    
    node.appendChild(card);

    let hasValidChildren = false;
    let childrenData = []; 
    let validRecipes = [];

    if (treeMode === 'recipe') {
        if (data.Recipes && data.Recipes.length > 0 && !visited.has(id)) {
            validRecipes = data.Recipes.filter(r => showTransmutations || !r.IsTransmutation);
            if (validRecipes.length > 0) {
                hasValidChildren = true;
                if (selectedRecipeIndices[id] === undefined) selectedRecipeIndices[id] = 0;
                if (selectedRecipeIndices[id] >= validRecipes.length) selectedRecipeIndices[id] = 0;
                childrenData = validRecipes[selectedRecipeIndices[id]].Ingredients || [];
            }
        }
    } else if (treeMode === 'usage' || treeMode === 'discover') {
        const allUsages = usageIndex[(data.DisplayName || "").toLowerCase()] || [];
        const validUsages = allUsages.filter(u => showTransmutations || !u.recipe?.IsTransmutation);
        
        const uniqueUsagesMap = new Map();
        validUsages.forEach(u => {
            if (!uniqueUsagesMap.has(u.id)) uniqueUsagesMap.set(u.id, u);
        });
        
        const uniqueUsages = Array.from(uniqueUsagesMap.values());
        uniqueUsages.sort((a,b) => {
            const nameA = itemsDatabase[a.id]?.DisplayName || itemsDatabase[a.id]?.name || "";
            const nameB = itemsDatabase[b.id]?.DisplayName || itemsDatabase[b.id]?.name || "";
            return nameA.localeCompare(nameB);
        });

        if (uniqueUsages.length > 0 && !visited.has(id)) {
            hasValidChildren = true;
            childrenData = uniqueUsages;
        }
    }

    // Inject the Multiple-Recipe UI Toggle Pill (built here, appended to node later so it sits between card and expand btn)
    let recipeSelector = null;
    if (treeMode === 'recipe' && validRecipes.length > 1) {
        recipeSelector = document.createElement('div');
        recipeSelector.className = 'flex items-center justify-center bg-slate-800 dark:bg-slate-900 text-white rounded-full px-2 py-0.5 shadow-lg border border-slate-600 dark:border-slate-500 z-30 text-[10px] font-bold whitespace-nowrap cursor-default no-pan mt-1';

        const btnPrev = document.createElement('button');
        btnPrev.className = 'hover:text-emerald-400 px-1.5 py-0.5 cursor-pointer no-pan transition-colors';
        btnPrev.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
        btnPrev.onclick = (e) => {
            e.stopPropagation();
            selectedRecipeIndices[id] = (selectedRecipeIndices[id] - 1 + validRecipes.length) % validRecipes.length;
            recheckCollectedForRecipeSwitch(id);
            saveCurrentState();
            loadTree(currentTreeItemId, true); // Instantly rebuilds the tree below this item
        };

        const label = document.createElement('span');
        label.className = 'mx-1 w-8 text-center select-none text-slate-200';
        label.textContent = `${selectedRecipeIndices[id] + 1}/${validRecipes.length}`;

        const btnNext = document.createElement('button');
        btnNext.className = 'hover:text-emerald-400 px-1.5 py-0.5 cursor-pointer no-pan transition-colors';
        btnNext.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
        btnNext.onclick = (e) => {
            e.stopPropagation();
            selectedRecipeIndices[id] = (selectedRecipeIndices[id] + 1) % validRecipes.length;
            recheckCollectedForRecipeSwitch(id);
            saveCurrentState();
            loadTree(currentTreeItemId, true);
        };

        recipeSelector.append(btnPrev, label, btnNext);
    }

    if (hasValidChildren) {
        const btn = document.createElement('button');
        const btnColor = treeMode === 'recipe' ? 'bg-blue-600' : treeMode === 'discover' ? 'bg-emerald-600' : 'bg-purple-600';
        const btnHover = treeMode === 'recipe' ? 'hover:bg-blue-700' : treeMode === 'discover' ? 'hover:bg-emerald-700' : 'hover:bg-purple-700';

        btn.className = `expand-btn mt-2 mb-2 w-6 h-6 rounded-full bg-slate-400 dark:bg-slate-700 ${btnHover} text-white text-xs flex items-center justify-center transition-colors shadow-md z-20`;
        btn.innerHTML = '<i class="fa-solid fa-plus"></i>';
        
        const container = document.createElement('div');
        container.className = 'tree-children hidden';
        
        btn.toggle = (targetState, isDeep = forceDeepExpand) => {
            const isClosed = container.classList.contains('hidden');
            if (targetState === 'open' && !isClosed) return false;
            if (targetState === 'close' && isClosed) return false;

            if (!isClosed) {
                container.classList.add('hidden');
                
                // Recursive Memory Wipe: Remove this node AND all its currently loaded children from the expanded set!
                const childCards = container.querySelectorAll('.item-card, .discover-box-container');
                childCards.forEach(c => {
                    if (c.dataset.id) expandedNodes.delete(c.dataset.id);
                });
                expandedNodes.delete(id); 
                
                btn.innerHTML = '<i class="fa-solid fa-plus"></i>';
                btn.classList.remove(btnColor);
            } else {
                container.innerHTML = '';
                container.classList.remove('hidden');
                
                btn.innerHTML = '<i class="fa-solid fa-minus"></i>';
                btn.classList.add(btnColor);
                expandedNodes.add(id); 
                
                const attachLineEvents = (el) => {
                    el.onmousemove = (e) => { 
                        lastMouseCoords = { x: e.clientX, y: e.clientY };
                        if (!dom.tooltip.el.classList.contains('hidden')) moveTooltip(e);
                    };
                    el.onmouseenter = (e) => {
                        container.classList.add('lines-hovered');
                        lastMouseCoords = { x: e.clientX, y: e.clientY };
                        lineTooltipTimeout = setTimeout(() => {
                            showTooltip(lastMouseCoords, data, parentContextRecipe); 
                        }, 300);
                    };
                    el.onmouseleave = () => {
                        container.classList.remove('lines-hovered');
                        clearTimeout(lineTooltipTimeout);
                        dom.tooltip.el.classList.add('hidden');
                    };
                    el.onclick = (e) => {
                        e.stopPropagation();
                        focusSubtree(node, container);
                        highlightCard(node.querySelector('.item-card'));
                    };
                };

                const lineBtn = document.createElement('button');
                lineBtn.className = 'tree-line-btn';
                attachLineEvents(lineBtn);
                container.appendChild(lineBtn);

                const newVis = new Set(visited).add(id);
                if (treeMode === 'recipe') {
                    childrenData.forEach(ing => {
                        const ingName = ing.Name || ing.name;
                        const ingAmount = ing.Amount || ing.amount;
                        const displayAmount = showTotalQuantity ? ingAmount * parentQuantity : ingAmount;
                        const ingLower = ingName.toLowerCase();
                        const isGroup = Object.keys(RECIPE_GROUPS).some(k => k.toLowerCase() === ingLower) || ingLower.startsWith("any ");

                        let childNode;
                        if (isGroup) {
                            childNode = createFlashingGroupNode(ingName, displayAmount);
                        } else {
                            let cid = ing.ID;
                            if (!cid || !itemsDatabase[cid]) {
                                const found = itemIndex.find(i => i.name.toLowerCase() === ingName.toLowerCase());
                                if (found) cid = found.id.toString();
                            }
                            childNode = cid ? createTreeNode(cid, false, newVis, null, false, displayAmount) : createGenericNode(ingName, displayAmount);
                            if(cid) {
                                const b = document.createElement('span');
                                b.className = 'absolute -top-2 -right-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-500 text-slate-700 dark:text-slate-300 text-[10px] px-1.5 py-0.5 rounded-full z-20 font-mono shadow';
                                b.textContent = `x${displayAmount}`;
                                childNode.querySelector('.item-card').appendChild(b);
                            }
                        }
                        
                        const hLine = document.createElement('div'); hLine.className = 'line-h'; attachLineEvents(hLine);
                        const vLine = document.createElement('div'); vLine.className = 'line-v'; attachLineEvents(vLine);
                        childNode.appendChild(hLine); childNode.appendChild(vLine);
                        
                        container.appendChild(childNode);
                    });
                } else {
                    childrenData.forEach(usage => {
                        const childNode = createTreeNode(usage.id, false, newVis, usage.recipe, isDeep);
                        const b = document.createElement('span');
                        b.className = 'absolute -top-2 -right-2 bg-purple-100 dark:bg-purple-900 border border-purple-300 dark:border-purple-500 text-purple-800 dark:text-purple-200 text-[10px] px-1.5 py-0.5 rounded-full z-20 font-mono shadow';
                        b.textContent = usage.viaGroup ? `via ${usage.viaGroup}` : `Req: ${usage.amount || usage.Amount}`;
                        childNode.querySelector('.item-card').appendChild(b);
                        
                        const hLine = document.createElement('div'); hLine.className = 'line-h'; attachLineEvents(hLine);
                        const vLine = document.createElement('div'); vLine.className = 'line-v'; attachLineEvents(vLine);
                        childNode.appendChild(hLine); childNode.appendChild(vLine);

                        container.appendChild(childNode);
                    });
                }

                const cNodes = Array.from(container.children).filter(c => c.classList.contains('tree-node'));
                if (cNodes.length > 0) {
                    cNodes[0].classList.add('is-first');
                    cNodes[cNodes.length - 1].classList.add('is-last');
                    if (cNodes.length === 1) cNodes[0].classList.add('is-only');
                }
            }
            return true; 
        };
        
        btn.onclick = e => { 
            e.stopPropagation(); 
            const wasClosed = container.classList.contains('hidden');
            
            btn.toggle();
            setTimeout(() => syncExpandAllButton(), 10);
            
            if (wasClosed) { // Item was just EXPANDED
                setTimeout(() => {
                    const vizRect = dom.vizArea.getBoundingClientRect();
                    const nRect = node.getBoundingClientRect();
                    const cRect = container.getBoundingClientRect();

                    const top = Math.min(nRect.top, cRect.top);
                    const bottom = Math.max(nRect.bottom, cRect.bottom);
                    const left = Math.min(nRect.left, cRect.left);
                    const right = Math.max(nRect.right, cRect.right);

                    let dx = 0; let dy = 0;
                    const padding = 60;

                    if (left < vizRect.left + padding) dx = (vizRect.left + padding) - left;
                    else if (right > vizRect.right - padding) dx = (vizRect.right - padding) - right;

                    if (top < vizRect.top + padding) dy = (vizRect.top + padding) - top;
                    else if (bottom > vizRect.bottom - padding) dy = (vizRect.bottom - padding) - bottom;

                    if (dx !== 0 || dy !== 0) {
                        targetX += dx;
                        targetY += dy;
                        triggerAnimation();
                    }
                    saveCurrentState();
                }, 100);
            } else { // Item was just COLLAPSED
                if (treeMode === 'discover') resetView();
                saveCurrentState();
            }
        };
        
        if (recipeSelector) node.appendChild(recipeSelector);
        node.append(btn, container);
        if(isRoot || expandedNodes.has(id) || forceDeepExpand) btn.toggle('open', forceDeepExpand);
    }

    if (isRoot && !hasValidChildren) {
        const noDataMsg = document.createElement('div');
        noDataMsg.className = 'px-4 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg shadow-lg text-slate-500 dark:text-slate-400 text-sm flex items-center gap-2 z-10';
        
        if (treeMode === 'recipe') {
            noDataMsg.innerHTML = '<i class="fa-solid fa-hammer text-slate-400 dark:text-slate-500"></i> Not craftable (Base Item)';
            noDataMsg.classList.add('mt-5');
        } else {
            noDataMsg.innerHTML = '<i class="fa-solid fa-leaf text-slate-400 dark:text-slate-500"></i> Not used in any recipes (End Item)';
            noDataMsg.classList.add('mb-5');
        }
        node.appendChild(noDataMsg); 
    }

    return node;
}

function createFlashingGroupNode(groupName, amount) {
    const container = document.createElement('div');
    container.className = 'tree-node';

    const groupKey = Object.keys(RECIPE_GROUPS).find(k => k.toLowerCase() === groupName.toLowerCase());
    const groupItems = groupKey ? RECIPE_GROUPS[groupKey] : [groupName.replace("Any ", "")];

    const mockData = {
        id: 'group_' + groupName,
        name: groupName,
        isGroupData: true,
        groupItems: groupItems,
        url: `https://terraria.wiki.gg/wiki/Alternative_crafting_ingredients#${groupName.replace(/ /g, '_')}`
    };

    const card = document.createElement('div');
    // Mimics the exact CSS of a standard item card, no dashed lines!
    card.className = 'item-card relative flex flex-col items-center justify-center rounded-lg w-24 h-24 bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 shadow-sm transition-transform hover:scale-105';
    
    const img = document.createElement('img');
    img.src = FALLBACK_ICON; 
    img.alt = `Any ${groupItems[0]} Terraria Crafting Alternative`; // SEO Addition
    img.draggable = false;
    img.ondragstart = (e) => e.preventDefault();
    img.className = 'w-10 h-10 object-contain mb-1 transition-opacity duration-300';
    
    const nameSpan = document.createElement('span');
    nameSpan.textContent = groupItems[0];
    nameSpan.className = 'text-center font-semibold text-[10px] leading-tight px-1 line-clamp-2 text-slate-800 dark:text-slate-200 transition-opacity duration-300';

    const badge = document.createElement('span');
    badge.className = 'absolute -top-2 -right-2 bg-blue-100 dark:bg-blue-900 border border-blue-300 dark:border-blue-500 text-blue-800 dark:text-blue-200 text-[10px] px-1.5 py-0.5 rounded-full z-20 font-mono shadow';
    badge.textContent = `x${amount}`;
    
    const groupLabel = document.createElement('div');
    groupLabel.className = 'absolute -bottom-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[9px] px-2 py-0.5 rounded shadow-md uppercase tracking-wider font-bold whitespace-nowrap z-30 border border-orange-700/50';
    groupLabel.innerHTML = `<i class="fa-solid fa-layer-group mr-1"></i>${groupName}`;

    card.append(img, nameSpan, badge, groupLabel);

    let intervalId = null;
    
    // We use a custom observer for flashing nodes to start the interval only when visible
    const flashingObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Load initial image
                const initialPreloader = new Image();
                initialPreloader.onload = () => { img.src = initialPreloader.src; };
                initialPreloader.src = createDirectImageUrl(groupItems[0]);
                
                // Start interval if multiple items
                if (groupItems.length > 1 && !intervalId) {
                    let idx = 0;
                    intervalId = setInterval(() => {
                        idx = (idx + 1) % groupItems.length;
                        const nextItem = groupItems[idx];
                        const nextUrl = createDirectImageUrl(nextItem);
                        
                        const preloader = new Image();
                        const swapContent = (safeUrl) => {
                            img.style.opacity = '0';
                            nameSpan.style.opacity = '0';
                            setTimeout(() => {
                                img.src = safeUrl;
                                nameSpan.textContent = nextItem;
                                img.style.opacity = '1';
                                nameSpan.style.opacity = '1';
                            }, 150);
                        };

                        preloader.onload = () => swapContent(nextUrl);
                        preloader.onerror = () => swapContent(FALLBACK_ICON);
                        preloader.src = nextUrl;
                    }, 1500);
                }
                observer.unobserve(card);
            }
        });
    }, { rootMargin: '200px' });
    
    flashingObserver.observe(card);

    card.onclick = (e) => {
        e.stopPropagation();
        if (isDraggingThresholdMet) { isDraggingThresholdMet = false; return; }

        // Secure the primary fallback item
        const primaryItemId = Object.keys(itemsDatabase).find(id => itemsDatabase[id].name === groupItems[0]);
        const primaryItemData = primaryItemId ? itemsDatabase[primaryItemId] : null;

        if (isMobileUX()) {
            if (activeMobileCard !== card) {
                if (activeMobileCard) activeMobileCard.classList.remove('mobile-active');
                activeMobileCard = card;
                card.classList.add('mobile-active');
                showTooltip(e, mockData, null);
            } 
            // Second tap is intentionally disabled. User must use the tooltip buttons to navigate.
            return;
        }

        // Desktop Behaviors
        if (e.ctrlKey || e.metaKey) {
            dom.tooltip.el.classList.add('hidden');
            window.open(mockData.url, '_blank');
        } else if (e.shiftKey) {
            dom.tooltip.el.classList.add('hidden');
            // Route specifically to the Category page, exactly like standard items!
            if (primaryItemData && primaryItemData.specific_type) {
                viewCategory(primaryItemData.specific_type);
            }
        }
        // Standard Left Click intentionally does nothing to prevent accidental navigation
    };

    card.onmouseenter = e => {
        if(!isMobileUX()) { clearTimeout(lineTooltipTimeout); showTooltip(e, mockData, null); }
    };
    card.onmouseleave = () => { if(!isMobileUX()) dom.tooltip.el.classList.add('hidden'); };
    card.onmousemove = e => { if(!isMobileUX()) moveTooltip(e); };

    container.appendChild(card);
    return container;
}

function createGenericNode(name, amount) {
    const d = document.createElement('div');
    d.className = 'tree-node';
    const amountText = document.createTextNode(name);
    d.innerHTML = `<div class="item-card relative flex flex-col items-center justify-center w-24 h-24 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-300 dark:border-slate-600"><i class="fa-solid fa-layer-group text-slate-400 dark:text-slate-500 text-2xl mb-1"></i><span class="text-xs text-center text-slate-600 dark:text-slate-400 font-medium px-2 sanitize-target"></span><span class="absolute -top-2 -right-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 text-[10px] px-1.5 py-0.5 rounded-full shadow">x${amount}</span></div>`;
    d.querySelector('.sanitize-target').appendChild(amountText);
    return d;
}
