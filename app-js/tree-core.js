// --- Function: Item Card UI construction, Category grids, and the top-level recursive loadTree boundaries ---

// --- Core Tree & Category View Generation ---

function createItemCardElement(data, sizeClasses, contextRecipe = null, customClickHandler = null) {
    const card = document.createElement('div');
    card.className = `item-card relative flex flex-col items-center justify-center rounded-lg ${sizeClasses}`;
    card.dataset.id = data.id; 
    
    const img = document.createElement('img');
    img.src = createDirectImageUrl(data.DisplayName || data.name);
    img.draggable = false; 
    img.ondragstart = (e) => e.preventDefault(); // Strict JS block
    img.className = sizeClasses.includes('w-32') ? 'w-14 h-14 object-contain mb-2' : 'w-10 h-10 object-contain mb-1';
    img.onerror = () => { img.src = FALLBACK_ICON; };
    
    const name = document.createElement('span');
    name.textContent = data.DisplayName || data.name;
    name.className = `text-center font-semibold leading-tight px-1 line-clamp-2 text-slate-800 dark:text-slate-200 ${sizeClasses.includes('w-32') ? 'text-sm' : 'text-[10px]'}`;
    
    if (data.Stats && data.Stats.IsHardmode) {
        const hmBadge = document.createElement('div');
        hmBadge.className = 'absolute top-1 left-1 flex items-center justify-center w-4 h-4 bg-gradient-to-br from-pink-500 to-purple-600 rounded-sm shadow-md border border-purple-800/50 text-[9px] font-bold text-white z-20 cursor-help';
        hmBadge.title = "Hardmode Item";
        hmBadge.textContent = "H";
        card.appendChild(hmBadge);
    }

    card.append(img, name);
    
    card.onclick = (e) => { 
        e.stopPropagation(); 
        
        if (isDraggingThresholdMet) {
            isDraggingThresholdMet = false;
            return;
        }

        if (isMobileUX()) {
            if (activeMobileCard !== card) {
                if (activeMobileCard) activeMobileCard.classList.remove('mobile-active');
                activeMobileCard = card;
                card.classList.add('mobile-active');
                showTooltip(e, data, contextRecipe);
                return; 
            }
        }
        
        if (activeMobileCard) activeMobileCard.classList.remove('mobile-active');
        activeMobileCard = null;
        dom.tooltip.el.classList.add('hidden');
        
        if (customClickHandler) {
            customClickHandler(e);
            return;
        }

        if (e.ctrlKey || e.metaKey) {
            if(data.WikiUrl) window.open(data.WikiUrl, '_blank'); 
            return;
        } 
        if (e.shiftKey && data.Category) {
            viewCategory(data.Category);
            return;
        } 
        
        if (currentViewType === 'tree') {
            if (treeMode === 'discover') {
                treeMode = 'recipe';
                const radio = document.querySelector(`input[name="treeMode"][value="recipe"]`);
                if (radio) radio.checked = true;
            }
            transitionToNewItem(card, data.id);
        } else {
            viewItem(data.id, true);
        }
    };
    
    card.onmouseenter = e => {
        if(!isMobileUX()) {
            clearTimeout(lineTooltipTimeout);
            showTooltip(e, data, contextRecipe);
        }
    };
    card.onmouseleave = () => {
        if(!isMobileUX()) dom.tooltip.el.classList.add('hidden');
    };
    card.onmousemove = e => {
        if(!isMobileUX()) moveTooltip(e);
    };
    
    return card;
}

function loadCategory(typeStr, preserveState = false, isHistoryPop = false) {
    currentViewType = 'category';
    currentCategoryName = typeStr;
    
    dom.searchInput.value = '';
    dom.searchResults.classList.add('hidden');
    dom.tooltip.el.classList.add('hidden'); 
    
    dom.toolMode.classList.add('hidden');
    dom.toolFilters.classList.add('hidden');
    dom.expandAllBtn.classList.add('hidden');

    performIKTransition(
        () => false, 
        () => {
            dom.treeContainer.classList.remove('mode-usage');
            const items = Object.values(itemsDatabase).filter(i => i.Category === typeStr);
            
            items.sort((a, b) => {
                const dmgA = a.Stats?.Damage ?? -1;
                const dmgB = b.Stats?.Damage ?? -1;
                if (dmgA !== dmgB) {
                    return dmgB - dmgA; 
                }
                return (a.DisplayName || "").localeCompare(b.DisplayName || "");
            });

            const box = document.createElement('div');
            box.className = 'category-box';
            
            const header = document.createElement('h2');
            header.className = 'category-header';
            header.textContent = `${typeStr} (${items.length})`;
            box.appendChild(header);
            
            const grid = document.createElement('div');
            grid.className = 'category-grid';
            
            items.forEach(data => {
                const card = createItemCardElement(data, 'w-24 h-24');
                grid.appendChild(card);
            });
            
            box.appendChild(grid);
            dom.treeContainer.appendChild(box);
        },
        () => {
            calculateResetView();
            currentX = targetX; currentY = targetY; currentScale = targetScale;
        }
    );
}

function loadTree(id, preserveState = false, isHistoryPop = false, transitionType = null, bridgeParams = null) {
    currentViewType = 'tree';
    currentTreeItemId = id;
    
    dom.searchInput.value = '';
    dom.searchResults.classList.add('hidden');
    dom.tooltip.el.classList.add('hidden'); 
    
    dom.toolMode.classList.remove('hidden');
    dom.toolFilters.classList.remove('hidden');
    
    if (treeMode === 'discover') {
        dom.expandAllBtn.classList.add('hidden');
    } else {
        dom.expandAllBtn.classList.remove('hidden');
    }

    let isFirstLoad = !preserveState;
    if (isFirstLoad) {
        expandedNodes.clear();
        isExpandedAll = false;
    }

    let preSetup = () => false;
    let postAlign = () => {};

    const vizRect = dom.vizArea.getBoundingClientRect();

    if (transitionType === 'forward' && bridgeParams && bridgeParams.startLocal) {
        preSetup = () => {
            let futureScale = 1.1;
            let futureBaseWidth = treeMode === 'discover' ? 80 : 128; 
            let futureScreenX = vizRect.width / 2;
            let futureScreenY = vizRect.height / 2;

            if (bridgeParams.targetState && bridgeParams.targetState.itemLocations && bridgeParams.targetState.itemLocations[bridgeParams.targetState.id]) {
                const futureRootLocal = bridgeParams.targetState.itemLocations[bridgeParams.targetState.id];
                futureScale = bridgeParams.targetState.scale;
                futureBaseWidth = futureRootLocal.w || futureBaseWidth;
                futureScreenX = bridgeParams.targetState.x + futureRootLocal.x * futureScale;
                futureScreenY = bridgeParams.targetState.y + futureRootLocal.y * futureScale;
            }
            
            const startBaseWidth = bridgeParams.startLocal.w || 96;
            targetScale = futureScale * (futureBaseWidth / startBaseWidth);
            targetX = futureScreenX - bridgeParams.startLocal.x * targetScale;
            targetY = futureScreenY - bridgeParams.startLocal.y * targetScale;

            return true;
        };
        postAlign = () => {
            let newAnchor = dom.treeContainer.querySelector(`.is-root .item-card[data-id="${id}"]`);
            if (!newAnchor) newAnchor = dom.treeContainer.querySelector('.is-root > .item-card, .is-root > .discover-box-container');
            
            if (newAnchor) {
                const newLocal = getLocalCenter(newAnchor);
                
                if (bridgeParams.targetState && bridgeParams.targetState.x !== undefined) {
                    currentScale = bridgeParams.targetState.scale;
                    currentX = bridgeParams.targetState.x;
                    currentY = bridgeParams.targetState.y;
                } else {
                    currentScale = 1.1; 
                    currentX = (vizRect.width / 2) - newLocal.x * currentScale;
                    currentY = (vizRect.height / 2) - newLocal.y * currentScale;
                }
                targetScale = currentScale; targetX = currentX; targetY = currentY;
            }
        };
    } 
    else if (transitionType === 'backward' && bridgeParams) {
        const currentRootCard = dom.treeContainer.querySelector(`.is-root .item-card[data-id="${bridgeParams.bridgeId}"]`) || dom.treeContainer.querySelector('.is-root > .item-card, .is-root > .discover-box-container');
        
        if (currentRootCard && bridgeParams.targetState && bridgeParams.targetState.itemLocations) {
            const pastLoc = bridgeParams.targetState.itemLocations[bridgeParams.bridgeId];
            if (pastLoc) {
                preSetup = () => {
                    currentRootCard.classList.add('hero-active');
                    dom.treeContainer.classList.add('fade-unfocused');

                    const pastScale = bridgeParams.targetState.scale || 1;
                    const pastBaseWidth = pastLoc.w || 96;
                    
                    const startLocal = getLocalCenter(currentRootCard);
                    const startBaseWidth = startLocal.w || 128;
                    
                    targetScale = pastScale * (pastBaseWidth / startBaseWidth);
                    
                    const pastScreenX = bridgeParams.targetState.x + pastLoc.x * pastScale;
                    const pastScreenY = bridgeParams.targetState.y + pastLoc.y * pastScale;
                    
                    targetX = pastScreenX - startLocal.x * targetScale;
                    targetY = pastScreenY - startLocal.y * targetScale;
                    return true;
                };
                postAlign = () => {
                    currentScale = bridgeParams.targetState.scale;
                    currentX = bridgeParams.targetState.x;
                    currentY = bridgeParams.targetState.y;
                    targetScale = currentScale; targetX = currentX; targetY = currentY;
                };
            }
        }
    }

    let instantAnchorX = null;
    let instantAnchorY = null;

    if (!preSetup()) {
        preSetup = () => {
            // Before drawing: Find exactly where the Discover Box is on the physical monitor
            if (transitionType === 'instant') {
                const anchorNode = dom.treeContainer.querySelector('.is-root > .item-card, .is-root > .discover-box-container');
                if (anchorNode) {
                    const vizRect = dom.vizArea.getBoundingClientRect();
                    const rect = anchorNode.getBoundingClientRect();
                    instantAnchorX = (rect.left - vizRect.left) + rect.width / 2;
                    instantAnchorY = (rect.top - vizRect.top) + rect.height / 2;
                }
            }
            return false;
        };
        postAlign = () => {
            // After drawing: Force the camera to offset whatever structural flexbox changes occurred
            if (transitionType === 'instant' && instantAnchorX !== null) {
                const newAnchor = dom.treeContainer.querySelector('.is-root > .item-card, .is-root > .discover-box-container');
                if (newAnchor) {
                    const newLocal = getLocalCenter(newAnchor);
                    currentX = instantAnchorX - (newLocal.x * currentScale);
                    currentY = instantAnchorY - (newLocal.y * currentScale);
                }
            } else if (preserveState) {
                if (bridgeParams && bridgeParams.targetState && bridgeParams.targetState.x !== undefined) {
                    currentScale = bridgeParams.targetState.scale;
                    currentX = bridgeParams.targetState.x;
                    currentY = bridgeParams.targetState.y;
                }
            } else {
                calculateResetView();
                currentX = targetX; currentY = targetY; currentScale = targetScale;
                
                if (isFirstLoad) {
                    setTimeout(() => {
                        if (!isPanning && currentViewType === 'tree') {
                            calculateResetView();
                            triggerAnimation();
                            saveCurrentState();
                        }
                    }, 400); 
                }
            }
            targetScale = currentScale; targetX = currentX; targetY = currentY;
        };
    }

    const isInstant = transitionType === 'instant';
    performIKTransition(preSetup, () => {
        if (treeMode === 'usage') {
            dom.treeContainer.classList.add('mode-usage');
            dom.treeContainer.classList.remove('mode-discover');
            dom.treeContainer.appendChild(createTreeNode(id, true));
        } else if (treeMode === 'discover') {
            dom.treeContainer.classList.add('mode-usage', 'mode-discover'); 
            dom.treeContainer.appendChild(createDiscoverRootNode());
        } else {
            dom.treeContainer.classList.remove('mode-usage', 'mode-discover');
            dom.treeContainer.appendChild(createTreeNode(id, true));
        }
        syncExpandAllButton();
    }, postAlign, isInstant);
}

function syncExpandAllButton() {
    const expandBtns = Array.from(dom.treeContainer.querySelectorAll('.expand-btn:not(.deep-expand-btn)'));
    if (expandBtns.length === 0) {
        isExpandedAll = false;
        dom.expandAllBtn.innerHTML = '<i class="fa-solid fa-layer-group"></i> Expand';
        return;
    }
    const allExpanded = expandBtns.every(btn => btn.innerHTML.includes('fa-minus'));
    isExpandedAll = allExpanded;
    
    if (allExpanded) {
        dom.expandAllBtn.innerHTML = '<i class="fa-solid fa-compress"></i> Collapse';
    } else {
        dom.expandAllBtn.innerHTML = '<i class="fa-solid fa-layer-group"></i> Expand';
    }
}

dom.expandAllBtn.onclick = async () => {
    isExpandedAll = !isExpandedAll;
    const targetState = isExpandedAll ? 'open' : 'close';
    dom.expandAllBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';
    
    await new Promise(r => requestAnimationFrame(r));
    
    let unstable = true, d = 0;
    while (unstable && d < 20) {
        unstable = false;
        for (const btn of dom.treeContainer.querySelectorAll('.expand-btn:not(.deep-expand-btn)')) {
            const changedState = btn.toggle(targetState);
            if (changedState) unstable = true;
        }
        if (unstable) await new Promise(r => setTimeout(r, 10));
        d++;
    }
    
    syncExpandAllButton();
    setTimeout(() => resetView(), 100);
};

function focusSubtree(nodeEl, containerEl) {
    const tr = dom.treeContainer.getBoundingClientRect();
    const nr = nodeEl.children[0].getBoundingClientRect(); 
    const cr = containerEl.getBoundingClientRect();

    const localNodeLeft = (nr.left - tr.left) / currentScale;
    const localNodeRight = (nr.right - tr.left) / currentScale;
    const localNodeTop = (nr.top - tr.top) / currentScale;
    const localNodeBottom = (nr.bottom - tr.top) / currentScale;

    const localContLeft = (cr.left - tr.left) / currentScale;
    const localContRight = (cr.right - tr.left) / currentScale;
    const localContTop = (cr.top - tr.top) / currentScale;
    const localContBottom = (cr.bottom - tr.top) / currentScale;

    const minX = Math.min(localNodeLeft, localContLeft);
    const maxX = Math.max(localNodeRight, localContRight);
    const minY = Math.min(localNodeTop, localContTop);
    const maxY = Math.max(localNodeBottom, localContBottom);

    const totalHeight = maxY - minY;
    const pLocalCenterX = (localNodeLeft + localNodeRight) / 2;
    
    const distLeft = pLocalCenterX - minX;
    const distRight = maxX - pLocalCenterX;
    const maxDistX = Math.max(distLeft, distRight);

    const viz = dom.vizArea.getBoundingClientRect();
    const padX = 120;
    const padY = 120;

    const sX = (viz.width - padX) / (maxDistX * 2 || 1);
    const sY = (viz.height - padY) / (totalHeight || 1);
    let newS = Math.max(getMinScale(), Math.min(sX, sY, 1.5)); 

    const newX = (viz.width / 2) - (pLocalCenterX * newS);

    let newY;
    if (treeMode === 'recipe') {
        newY = (padY / 2) - (minY * newS);
    } else {
        newY = viz.height - (padY / 2) - (maxY * newS);
    }

    targetScale = newS;
    targetX = newX;
    targetY = newY;
    triggerAnimation();
    saveCurrentState();
}