// --- Function: Custom popstate interceptor, URL manipulation, and Inverse Kinematics view-switching animations ---

// --- History API & Two-Phase IK Controllers ---

function safeReplaceState(state, url) {
    try { history.replaceState(state, "", url); } catch (e) { console.warn("Local file history blocked."); }
}

function safePushState(state, url) {
    try { history.pushState(state, "", url); } catch (e) { console.warn("Local file history blocked."); }
}

let hideVizTimeout = null;

function toggleHomeMode(isGoingHome, isHistoryPop = false) {
    if (isGoingHome === document.body.classList.contains('home-mode')) return;

    if (pendingDOMSwap) {
        clearTimeout(transitionTimeout);
        pendingDOMSwap = null;
    }
    const existingGhost = document.getElementById('ghostContainer');
    if (existingGhost) existingGhost.remove();

    const els = [
        document.getElementById('logoContainer'),
        document.getElementById('searchWrapper'),
        document.getElementById('statusWrapper') 
    ];

    const firstRects = els.map(el => el.getBoundingClientRect());

    if (isGoingHome) {
        document.body.classList.add('home-mode');
        dom.vizArea.style.opacity = '0';
        dom.mainToolbar.style.opacity = '0';
        
        hideVizTimeout = setTimeout(() => {
            dom.vizArea.classList.add('hidden');
            dom.mainToolbar.classList.add('hidden');
        }, 500);

        dom.treeContainer.innerHTML = '';
        dom.searchInput.value = '';
        dom.searchResults.classList.add('hidden');
        currentViewType = 'home';
        currentTreeItemId = null;
        
        if (!isHistoryPop) {
            saveCurrentState();
            appHistory = appHistory.slice(0, historyIdx + 1);
            historyIdx++;
            appHistory.push({ isHome: true, viewType: 'home' });
            safePushState({ idx: historyIdx, isHome: true }, window.location.pathname);
        }
        updateNavButtons();
    } else {
        document.body.classList.remove('home-mode');
        clearTimeout(hideVizTimeout);
        dom.vizArea.classList.remove('hidden');
        dom.mainToolbar.classList.remove('hidden');
    }

    const lastRects = els.map(el => el.getBoundingClientRect());

    els.forEach((el, i) => {
        const invertX = firstRects[i].left - lastRects[i].left;
        const invertY = firstRects[i].top - lastRects[i].top;
        const invertScaleX = firstRects[i].width / (lastRects[i].width || 1);
        
        el.style.transformOrigin = 'top left';
        el.style.transition = 'none';
        
        if (el.id === 'logoContainer') {
            el.style.transform = `translate3d(${invertX}px, ${invertY}px, 0) scale(${invertScaleX})`;
        } else {
            el.style.transform = `translate3d(${invertX}px, ${invertY}px, 0)`;
        }
    });

    void document.body.offsetWidth; 

    els.forEach(el => {
        el.style.transition = 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
        el.style.transform = '';
    });

    if (!isGoingHome) {
        requestAnimationFrame(() => {
            dom.vizArea.style.opacity = '1';
            dom.mainToolbar.style.opacity = '1';
        });
    }

    setTimeout(() => {
        els.forEach(el => {
            el.style.transition = '';
            el.style.transformOrigin = '';
        });
    }, 600);
}

window.restoreHomeMode = () => toggleHomeMode(true, false);
function removeHomeMode() { toggleHomeMode(false); }

function getLocalCenter(element) {
    const tr = dom.treeContainer.getBoundingClientRect();
    const er = element.getBoundingClientRect();
    return {
        x: (er.left - tr.left) / currentScale + (er.width / currentScale) / 2,
        y: (er.top - tr.top) / currentScale + (er.height / currentScale) / 2,
        w: er.width / currentScale 
    };
}

function saveCurrentState(skipBrowserState = false) {
    // --- LocalStorage Persistence ---
    localStorage.setItem('terraria_discoverBox', JSON.stringify(discoverBoxItems));
    localStorage.setItem('terraria_expandedNodes', JSON.stringify(Array.from(expandedNodes)));
    localStorage.setItem('terraria_collectedItems', JSON.stringify(Array.from(collectedItems)));

    if (historyIdx >= 0 && appHistory[historyIdx]) {
        appHistory[historyIdx].x = targetX; 
        appHistory[historyIdx].y = targetY;
        appHistory[historyIdx].scale = targetScale;
        
        if (currentViewType === 'tree') {
            appHistory[historyIdx].expanded = Array.from(expandedNodes);
            appHistory[historyIdx].discoverItems = [...discoverBoxItems];
            appHistory[historyIdx].recipeIndices = { ...selectedRecipeIndices };
            
            const locations = {};
            dom.treeContainer.querySelectorAll('.item-card').forEach(card => {
                if(card.dataset.id) {
                    locations[card.dataset.id] = getLocalCenter(card);
                }
            });
            appHistory[historyIdx].itemLocations = locations;
        }
        
        if (!skipBrowserState) {
            safeReplaceState({ idx: historyIdx, isHome: appHistory[historyIdx].isHome }, window.location.search);
        }
    }
}

function updateNavButtons() {
    dom.navBack.disabled = historyIdx <= 0;
    dom.navForward.disabled = historyIdx >= appHistory.length - 1;
}

dom.navBack.onclick = () => { history.back(); };
dom.navForward.onclick = () => { history.forward(); };

let transitionTimeout = null;
let pendingDOMSwap = null; 

function performIKTransition(preAnimationSetup, buildDOM, postDOMAlign, skipFade = false) {
    if (pendingDOMSwap) {
        clearTimeout(transitionTimeout);
        pendingDOMSwap(); 
    }
    
    const existingGhost = document.getElementById('ghostContainer');
    if (existingGhost) existingGhost.remove();

    const hasMovement = preAnimationSetup(); 
    if (hasMovement && !skipFade) triggerAnimation();

    const waitTime = hasMovement && !skipFade ? 400 : 0;

    pendingDOMSwap = () => {
        pendingDOMSwap = null; 
        const hasContent = dom.treeContainer.innerHTML.trim() !== '';
        let ghost = null;
        
        if (hasMovement) {
            currentX = targetX;
            currentY = targetY;
            currentScale = targetScale;
            dom.treeContainer.style.transform = `translate3d(${currentX}px, ${currentY}px, 0) scale(${currentScale})`;
        }
        
        if (hasContent && !skipFade) {
            ghost = dom.treeContainer.cloneNode(true);
            ghost.id = 'ghostContainer'; 
            ghost.style.pointerEvents = 'none';
            ghost.style.zIndex = '5';
            dom.treeContainer.parentNode.insertBefore(ghost, dom.treeContainer);
        }

        dom.treeContainer.style.transition = 'none';
        if (ghost) {
            ghost.style.transition = 'none';
            ghost.style.opacity = '1';
        }
        dom.treeContainer.innerHTML = '';
        dom.treeContainer.classList.remove('fade-unfocused');
        if (!skipFade) dom.treeContainer.style.opacity = '0';
        
        buildDOM();
        postDOMAlign(); 
        
        dom.treeContainer.style.transform = `translate3d(${currentX}px, ${currentY}px, 0) scale(${currentScale})`;
        void dom.treeContainer.offsetWidth; 

        if (skipFade) {
            dom.treeContainer.style.opacity = '1';
            return;
        }

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                dom.treeContainer.style.transition = 'opacity 0.4s ease';
                if (ghost) {
                    ghost.style.transition = 'opacity 0.4s ease';
                    ghost.style.opacity = '0';
                }
                dom.treeContainer.style.opacity = '1';

                setTimeout(() => {
                    if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
                    dom.treeContainer.style.transition = '';
                }, 450);
            });
        });
    };

    transitionTimeout = setTimeout(() => {
        if (pendingDOMSwap) pendingDOMSwap();
    }, waitTime);
}

function calculateResetView() {
    void dom.vizArea.offsetWidth; 
    const vizRect = dom.vizArea.getBoundingClientRect();
    
    let vWidth = vizRect.width || window.innerWidth;
    let vHeight = vizRect.height || window.innerHeight;

    const treeWidth = dom.treeContainer.scrollWidth;
    const treeHeight = dom.treeContainer.scrollHeight;
    
    const paddingX = 80; const paddingY = 80;
    const scaleX = (vWidth - paddingX) / (treeWidth || 1);
    const scaleY = (vHeight - paddingY) / (treeHeight || 1);
    
    targetScale = Math.max(getMinScale(), Math.min(scaleX, scaleY, 1.1));
    targetX = (vWidth - ((treeWidth || 0) * targetScale)) / 2;
    targetY = Math.max(40, (vHeight - ((treeHeight || 0) * targetScale)) / 2);
}

function resetView() { 
    calculateResetView();
    triggerAnimation();
    saveCurrentState();
}

window.addEventListener('popstate', (e) => {
    if (e.state && e.state.idx !== undefined) {
        
        if (historyIdx >= 0 && appHistory[historyIdx]) {
            saveCurrentState(true); 
        }
        
        const isBackward = e.state.idx < historyIdx;
        const pastState = appHistory[historyIdx]; 
        historyIdx = e.state.idx;
        const state = appHistory[historyIdx]; 

        if (e.state.isHome || (state && state.isHome)) {
            toggleHomeMode(true, true);
            return;
        }

        if (!state) {
            const params = new URLSearchParams(window.location.search);
            const id = params.get('id');
            const cat = params.get('category');
            
            appHistory = [];
            appHistory[historyIdx] = { viewType: id ? 'tree' : 'category', id: id, category: cat, mode: treeMode, expanded: [], discoverItems: [], recipeIndices: {...selectedRecipeIndices} };
            
            removeHomeMode();
            if (id) loadTree(id, false, false, 'search');
            else if (cat) loadCategory(cat, false, true);
            updateNavButtons();
            return;
        }

        removeHomeMode();

        if (state.viewType === 'category') {
            loadCategory(state.category, true, true);
        } else {
            treeMode = state.mode;
            document.querySelector(`input[name="treeMode"][value="${state.mode}"]`).checked = true;
            expandedNodes = new Set(state.expanded || []);
            discoverBoxItems = state.discoverItems ? [...state.discoverItems] : [];
            selectedRecipeIndices = state.recipeIndices ? { ...state.recipeIndices } : {};

            if (currentViewType === 'tree' && state.viewType === 'tree') {
                
                // --- Smart Intersection Check (Fly vs Fade) ---
                let isValidBridge = true;
                const leavingMode = pastState.mode;
                const enteringMode = state.mode;
                
                if (leavingMode === 'discover' || enteringMode === 'discover') {
                    // If LEAVING Discover Mode (Forward navigation)
                    if (leavingMode === 'discover') {
                        // The item we are navigating TO must have existed in the physical coordinate snapshot we are LEAVING
                        if (!pastState.itemLocations || !pastState.itemLocations[String(state.id)]) {
                            isValidBridge = false;
                        }
                    }
                    // If ENTERING Discover Mode (Backward navigation)
                    if (enteringMode === 'discover') {
                        // The item we are LEAVING must exist in the coordinate snapshot of the screen we are navigating TO
                        if (!state.itemLocations || !state.itemLocations[String(pastState.id)]) {
                            isValidBridge = false;
                        }
                    }
                }

                if (isValidBridge) {
                    if (isBackward) {
                        const bridgeId = currentTreeItemId;
                        loadTree(state.id, true, true, 'backward', {
                            bridgeId: bridgeId,
                            targetState: state
                        });
                    } else {
                        const childCard = Array.from(dom.treeContainer.querySelectorAll('.item-card')).find(c => c.dataset.id === String(state.id)); 

                        if (childCard) {
                            childCard.classList.add('hero-active');
                            dom.treeContainer.classList.add('fade-unfocused');

                            const startLocal = getLocalCenter(childCard);
                            loadTree(state.id, true, true, 'forward', {
                                startLocal: startLocal,
                                targetState: state
                            });
                        } else {
                            loadTree(state.id, true, true, 'search', { targetState: state });
                        }
                    }
                } else {
                    // Force a standard fade transition instead of flying
                    loadTree(state.id, true, true, 'search', { targetState: state });
                }
            } else {
                loadTree(state.id, true, true, 'search', { targetState: state });
            }
        }
        updateNavButtons();
    }
});

// Mode Switching Integration with Kinematic History Engine
function switchModeKinematic(newMode) {
    if (treeMode === newMode) return;
    
    const radio = document.querySelector(`input[name="treeMode"][value="${newMode}"]`);
    if (radio) radio.checked = true;

    if (currentViewType !== 'tree') {
        treeMode = newMode;
        return;
    }

    if (newMode === 'discover') {
        if (currentTreeItemId && !discoverBoxItems.includes(currentTreeItemId)) {
            discoverBoxItems = [currentTreeItemId];
        }
    } else if (treeMode === 'discover') {
        if (discoverBoxItems.length > 0) {
            currentTreeItemId = discoverBoxItems[discoverBoxItems.length - 1];
        } else {
            toggleHomeMode(true);
            return;
        }
    }

    let anchorCard = dom.treeContainer.querySelector(`.is-root .item-card[data-id="${currentTreeItemId}"]`);
    if (!anchorCard) anchorCard = dom.treeContainer.querySelector('.is-root > .item-card, .is-root > .discover-box-container');
    
    if (anchorCard) {
        removeHomeMode();
        const startLocal = getLocalCenter(anchorCard);
        
        anchorCard.classList.add('hero-active');
        dom.treeContainer.classList.add('fade-unfocused');
        
        if (historyIdx >= 0 && appHistory[historyIdx]) {
            appHistory[historyIdx].bridgeId = currentTreeItemId; 
        }
        saveCurrentState();
        
        treeMode = newMode; 
        
        appHistory = appHistory.slice(0, historyIdx + 1);
        appHistory.push({ viewType: 'tree', id: currentTreeItemId, mode: treeMode, expanded: [], discoverItems: [...discoverBoxItems], recipeIndices: {...selectedRecipeIndices} });
        
        historyIdx++;
        safePushState({ idx: historyIdx }, `?id=${currentTreeItemId}`);
        updateNavButtons();
        
        loadTree(currentTreeItemId, false, false, 'forward', {
            startLocal: startLocal,
            targetState: null 
        });
    } else {
        treeMode = newMode;
        viewItem(currentTreeItemId);
    }
}

function transitionToNewItem(cardEl, targetId) {
    removeHomeMode();
    const startLocal = getLocalCenter(cardEl);
    
    cardEl.classList.add('hero-active');
    dom.treeContainer.classList.add('fade-unfocused');
    
    if (historyIdx >= 0 && appHistory[historyIdx]) {
        appHistory[historyIdx].bridgeId = targetId; 
    }
    saveCurrentState();
    
    appHistory = appHistory.slice(0, historyIdx + 1);
    appHistory.push({ viewType: 'tree', id: targetId, mode: treeMode, expanded: [], discoverItems: [...discoverBoxItems], recipeIndices: {...selectedRecipeIndices} });
    
    historyIdx++;
    safePushState({ idx: historyIdx }, `?id=${targetId}`);
    updateNavButtons();
    
    loadTree(targetId, false, false, 'forward', {
        startLocal: startLocal,
        targetState: null 
    });
}

function viewItem(id, isFromSearch = false, isTransitioning = false) {
    removeHomeMode();
    saveCurrentState(); 
    updateSEOState('tree', id); // Fire SEO Engine 
    appHistory = appHistory.slice(0, historyIdx + 1);
    appHistory.push({ viewType: 'tree', id: id, mode: treeMode, expanded: [], discoverItems: [...discoverBoxItems], recipeIndices: {...selectedRecipeIndices} });
    
    historyIdx++;
    safePushState({ idx: historyIdx }, `?id=${id}`);
    updateNavButtons();
    
    if (isFromSearch) {
        loadTree(id, false, false, 'search');
    } else {
        loadTree(id, false, false, isTransitioning ? 'forward' : null);
    }
}

function viewCategory(typeStr) {
    removeHomeMode();
    if (!typeStr) return;
    saveCurrentState();
    updateSEOState('category', typeStr); // Fire SEO Engine
    appHistory = appHistory.slice(0, historyIdx + 1);
    appHistory.push({ viewType: 'category', category: typeStr });
    
    historyIdx++;
    safePushState({ idx: historyIdx }, `?category=${encodeURIComponent(typeStr)}`);
    updateNavButtons();
    loadCategory(typeStr, false);
}

// --- Dynamic SEO & Structured Data Engine ---
function updateSEOState(viewType, idOrCategory) {
    let title = 'Terraria Crafting Tree & Tool';
    let desc = 'A modern and interactive crafting tree, recipe explorer, and discover tool for Terraria. Find base ingredients, workstations, and total resources required.';
    let schema = null;

    if (viewType === 'tree' && itemsDatabase[idOrCategory]) {
        const item = itemsDatabase[idOrCategory];
        const itemName = item.DisplayName || item.name;
        title = `How to Craft ${itemName} | Terraria Crafting Tree`;
        desc = item.Tooltip || item.description || `Interactive crafting tree and recipe guide for the ${itemName} in Terraria. View base ingredients, workstations, and total resources required.`;
        
        // Generate JSON-LD Structured Data
        if (item.Recipes && item.Recipes.length > 0) {
            schema = {
                "@context": "https://schema.org/",
                "@type": "HowTo",
                "name": `How to craft ${itemName} in Terraria`,
                "image": item.IconUrl || createDirectImageUrl(itemName),
                "step": item.Recipes[0].Ingredients.map(ing => ({
                    "@type": "HowToStep",
                    "text": `Obtain ${ing.Amount || ing.amount}x ${ing.Name || ing.name}`
                }))
            };
        }
    } else if (viewType === 'category') {
        title = `${idOrCategory} Items | Terraria Crafting Tree`;
        desc = `Explore all ${idOrCategory} items in Terraria. View interactive crafting trees and recipe paths.`;
    }

    // 1. Update Title
    document.title = title;

    // 2. Update Meta Description
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
        metaDesc = document.createElement('meta');
        metaDesc.name = "description";
        document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute("content", desc);

    // 3. Update or Inject JSON-LD
    let scriptTag = document.getElementById('seo-structured-data');
    if (scriptTag) scriptTag.remove();
    
    if (schema) {
        const script = document.createElement('script');
        script.id = 'seo-structured-data';
        script.type = 'application/ld+json';
        script.text = JSON.stringify(schema);
        document.head.appendChild(script);
    }
}
