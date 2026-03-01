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

    const childrenData = getDiscoverableItems();
    if (childrenData.length > 0) {
        const btn = document.createElement('button');
        btn.className = `expand-btn mt-2 mb-2 w-6 h-6 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs flex items-center justify-center transition-colors shadow-md z-20`;
        btn.innerHTML = '<i class="fa-solid fa-minus"></i>';
        
        const container = document.createElement('div');
        container.className = 'tree-children';
        
        const attachLineEvents = (el) => {
            el.onmousemove = (e) => { 
                lastMouseCoords = { x: e.clientX, y: e.clientY };
                if (!dom.tooltip.el.classList.contains('hidden')) moveTooltip(e);
            };
            el.onmouseenter = (e) => {
                container.classList.add('lines-hovered');
                lastMouseCoords = { x: e.clientX, y: e.clientY };
            };
            el.onmouseleave = () => { container.classList.remove('lines-hovered'); };
            el.onclick = (e) => { e.stopPropagation(); focusSubtree(node, container); };
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

            if (!isClosed) {
                container.classList.add('hidden');
                btn.innerHTML = '<i class="fa-solid fa-plus"></i>';
                btn.classList.remove('bg-emerald-600');
            } else {
                container.classList.remove('hidden');
                btn.innerHTML = '<i class="fa-solid fa-minus"></i>';
                btn.classList.add('bg-emerald-600');
            }
            return true;
        };
        
        btn.onclick = e => { 
            e.stopPropagation(); 
            btn.toggle(); 
            setTimeout(() => syncExpandAllButton(), 10);
            saveCurrentState();
        };

        node.append(btn, container);
    } else {
        const noDataMsg = document.createElement('div');
        noDataMsg.className = 'px-4 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg shadow-lg text-slate-500 dark:text-slate-400 text-sm flex items-center gap-2 z-10 mb-5';
        noDataMsg.innerHTML = discoverBoxItems.length === 0 
            ? '<i class="fa-solid fa-info-circle text-slate-400"></i> Add items to the box to discover recipes.'
            : '<i class="fa-solid fa-leaf text-slate-400"></i> No items can be crafted using ALL of these ingredients.';
        node.appendChild(noDataMsg);
    }

    return node;
}


function createTreeNode(id, isRoot = false, visited = new Set(), parentContextRecipe = null, forceDeepExpand = false) {
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
            validRecipes = data.Recipes;
            if (validRecipes.length > 0) {
                hasValidChildren = true;
                if (selectedRecipeIndices[id] === undefined) selectedRecipeIndices[id] = 0;
                if (selectedRecipeIndices[id] >= validRecipes.length) selectedRecipeIndices[id] = 0;
                childrenData = validRecipes[selectedRecipeIndices[id]].Ingredients || [];
            }
        }
    } else if (treeMode === 'usage' || treeMode === 'discover') {
        const allUsages = usageIndex[(data.DisplayName || "").toLowerCase()] || [];
        const validUsages = allUsages;
        
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

    // Inject the Multiple-Recipe UI Toggle Pill
    if (treeMode === 'recipe' && validRecipes.length > 1) {
        const selector = document.createElement('div');
        selector.className = 'absolute -bottom-2.5 left-1/2 -translate-x-1/2 flex items-center bg-slate-800 dark:bg-slate-900 text-white rounded-full px-2 py-0.5 shadow-lg border border-slate-600 dark:border-slate-500 z-30 text-[10px] font-bold whitespace-nowrap cursor-default no-pan';
        
        const btnPrev = document.createElement('button');
        btnPrev.className = 'hover:text-emerald-400 px-1.5 py-0.5 cursor-pointer no-pan transition-colors';
        btnPrev.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
        btnPrev.onclick = (e) => {
            e.stopPropagation();
            selectedRecipeIndices[id] = (selectedRecipeIndices[id] - 1 + validRecipes.length) % validRecipes.length;
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
            saveCurrentState();
            loadTree(currentTreeItemId, true);
        };

        selector.append(btnPrev, label, btnNext);
        card.appendChild(selector);
    }

    if (hasValidChildren) {
        const btn = document.createElement('button');
        const isDeepExpandMode = treeMode === 'discover' && !isRoot;
        
        const btnColor = treeMode === 'recipe' ? 'bg-blue-600' : 'bg-purple-600';
        const btnHover = treeMode === 'recipe' ? 'hover:bg-blue-700' : 'hover:bg-purple-700';
        
        if (isDeepExpandMode) {
            btn.className = `expand-btn deep-expand-btn mt-2 mb-2 px-3 py-1 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold tracking-wide flex items-center justify-center transition-colors shadow-md z-20 whitespace-nowrap`;
            btn.innerHTML = '<i class="fa-solid fa-code-branch mr-1"></i> Expand Path';
        } else {
            btn.className = `expand-btn mt-2 mb-2 w-6 h-6 rounded-full bg-slate-400 dark:bg-slate-700 ${btnHover} text-white text-xs flex items-center justify-center transition-colors shadow-md z-20`;
            btn.innerHTML = '<i class="fa-solid fa-plus"></i>';
        }
        
        const container = document.createElement('div');
        container.className = 'tree-children hidden';
        
        btn.toggle = (targetState, isDeep = forceDeepExpand) => {
            const isClosed = container.classList.contains('hidden');
            if (targetState === 'open' && !isClosed) return false;
            if (targetState === 'close' && isClosed) return false;

            if (!isClosed) {
                container.classList.add('hidden');
                if (isDeepExpandMode) {
                    btn.innerHTML = '<i class="fa-solid fa-code-branch mr-1"></i> Expand Path';
                    btn.classList.replace('bg-indigo-700', 'bg-indigo-600');
                } else {
                    btn.innerHTML = '<i class="fa-solid fa-plus"></i>';
                    btn.classList.remove(btnColor);
                }
                expandedNodes.delete(id); 
            } else {
                container.innerHTML = '';
                container.classList.remove('hidden');
                
                if (isDeepExpandMode) {
                    btn.innerHTML = '<i class="fa-solid fa-compress-alt mr-1"></i> Collapse Path';
                    btn.classList.replace('bg-indigo-600', 'bg-indigo-700');
                } else {
                    btn.innerHTML = '<i class="fa-solid fa-minus"></i>';
                    btn.classList.add(btnColor);
                }
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
                        const ingLower = ingName.toLowerCase();
                        const isGroup = Object.keys(RECIPE_GROUPS).some(k => k.toLowerCase() === ingLower) || ingLower.startsWith("any ");
                        
                        let childNode;
                        if (isGroup) {
                            childNode = createFlashingGroupNode(ingName, ingAmount);
                        } else {
                            let cid = ing.ID;
                            if (!cid || !itemsDatabase[cid]) {
                                const found = itemIndex.find(i => i.name.toLowerCase() === ingName.toLowerCase());
                                if (found) cid = found.id.toString();
                            }
                            childNode = cid ? createTreeNode(cid, false, newVis) : createGenericNode(ingName, ingAmount);
                            if(cid) {
                                const b = document.createElement('span');
                                b.className = 'absolute -top-2 -right-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-500 text-slate-700 dark:text-slate-300 text-[10px] px-1.5 py-0.5 rounded-full z-20 font-mono shadow';
                                b.textContent = `x${ingAmount}`;
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
            
            if (isDeepExpandMode && wasClosed) {
                btn.toggle('open', true);
            } else {
                btn.toggle();
            }
            setTimeout(() => syncExpandAllButton(), 10);
            
            if (wasClosed) { // Item was just EXPANDED
                setTimeout(() => {
                    if (isDeepExpandMode) {
                        focusSubtree(node, container);
                    } else {
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
                    }
                    saveCurrentState();
                }, 100);
            } else { // Item was just COLLAPSED
                if (isDeepExpandMode) {
                    resetView(); // Matches user expectation: pulls the camera out to view the entire remaining tree
                }
                saveCurrentState();
            }
        };
        
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
