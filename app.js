// --- Mobile iOS/Android PNG Icon Generator ---
(function generateMobileIcon() {
    const canvas = document.createElement('canvas');
    canvas.width = 180; canvas.height = 180;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#1a264a';
    ctx.fillRect(0, 0, 180, 180);
    
    const img = new Image();
    img.onload = () => {
        // Perfect math for a 384x512 image on a 180x180 canvas
        ctx.drawImage(img, 45, 30, 90, 120);
        const link = document.createElement('link');
        link.rel = 'apple-touch-icon';
        link.href = canvas.toDataURL('image/png');
        document.head.appendChild(link);
    };
    // Explicit width and height added to prevent browser canvas parsing distortion
    img.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 384 512' width='384' height='512'%3E%3Cpath fill='%2322c55e' d='M377.6 250.3l-105-131.2H314c9.1 0 17.2-5.4 21-13.8s2.3-18.4-4-24.8L183.1 3.5c-4.4-4.7-10.7-7.5-17.1-7.5s-12.7 2.8-17.1 7.5L.9 80.5C-5.3 87-6.8 96-3 104.4s11.9 13.8 21 13.8h41.4L-1.6 250.3C-8 258.3-8.6 269.4-3.5 278S10 292 20 292h74l-64.8 97.2c-5.8 8.8-5.3 20.3 1.4 28.5S45.6 432 56 432h104v48c0 17.7 14.3 32 32 32h64c17.7 0 32-14.3 32-32v-48h104c10.4 0 20.3-4.8 25.4-13.3s7.2-19.7 1.4-28.5L348 292h74c10 0 18.4-5.6 23.5-14s4.5-19.7-1.9-27.7z'/%3E%3C/svg%3E";
})();

// --- State Variables & Dependencies ---
let itemsDatabase = {}, itemIndex = [];
let usageIndex = {}; 

let currentX = 0, currentY = 0, currentScale = 1;
let targetX = 0, targetY = 0, targetScale = 1;   
let isAnimating = false;

let isPanning = false, startX = 0, startY = 0;
let showTransmutations = false;

let isDraggingThresholdMet = false;
let dragStartX = 0, dragStartY = 0;

let searchActiveIndex = -1;

let currentViewType = 'home';
let currentTreeItemId = null;
let currentCategoryName = null;
let treeMode = 'recipe'; 
let expandedNodes = new Set(); 
let isExpandedAll = false;

let discoverBoxItems = []; 

let lineTooltipTimeout = null;
let lastMouseCoords = { x: 0, y: 0 };

// History Engine
let appHistory = [];
let historyIdx = -1;

let initialPinchDist = null;
let initialScale = 1;
let activeMobileCard = null; 

const FALLBACK_ICON = 'https://terraria.wiki.gg/wiki/Special:FilePath/Angel_Statue.png';
const JSON_FILENAME = 'terraria_items_final.json';

const RECIPE_GROUPS = {
    "Any Wood": ["Wood", "Boreal Wood", "Rich Mahogany", "Ebonwood", "Shadewood", "Pearlwood", "Ash Wood"],
    "Any Iron Bar": ["Iron Bar", "Lead Bar"],
    "Any Copper Bar": ["Copper Bar", "Tin Bar"],
    "Any Silver Bar": ["Silver Bar", "Tungsten Bar"],
    "Any Gold Bar": ["Gold Bar", "Platinum Bar"],
    "Any Cobalt Bar": ["Cobalt Bar", "Palladium Bar"],
    "Any Mythril Bar": ["Mythril Bar", "Orichalcum Bar"],
    "Any Adamantite Bar": ["Adamantite Bar", "Titanium Bar"],
    "Any Demonite Bar": ["Demonite Bar", "Crimtane Bar"],
    "Any Sand": ["Sand Block", "Ebonsand Block", "Crimsand Block", "Pearlsand Block"],
    "Any Bird": ["Bird", "Blue Jay", "Cardinal", "Goldfinch"],
    "Any Pressure Plate": ["Red Pressure Plate", "Green Pressure Plate", "Gray Pressure Plate", "Brown Pressure Plate"]
};

const dom = {
    uploadSection: document.getElementById('uploadSection'),
    manualUpload: document.getElementById('manualUpload'),
    autoLoadStatus: document.getElementById('autoLoadStatus'),
    fileInput: document.getElementById('fileInput'),
    searchInput: document.getElementById('searchInput'),
    searchResults: document.getElementById('searchResults'),
    vizArea: document.getElementById('visualizationArea'),
    treeContainer: document.getElementById('treeContainer'),
    mainToolbar: document.getElementById('mainToolbar'),
    mobileMenuBtn: document.getElementById('mobileMenuBtn'),
    toolbarTools: document.getElementById('toolbarTools'),
    toolMode: document.getElementById('toolMode'),
    toolFilters: document.getElementById('toolFilters'),
    expandAllBtn: document.getElementById('expandAllBtn'),
    resetViewBtn: document.getElementById('resetViewBtn'),
    transmuteCheck: document.getElementById('showTransmutations'),
    dbStatus: document.getElementById('dbStatus'),
    navBack: document.getElementById('navBack'),
    navForward: document.getElementById('navForward'),
    tooltip: {
        el: document.getElementById('globalTooltip'),
        name: document.getElementById('ttName'),
        image: document.getElementById('ttImage'),
        desc: document.getElementById('ttDesc'),
        stats: document.getElementById('ttStats'),
        station: document.getElementById('ttStation'),
        stationText: document.getElementById('ttStationText'),
        wikiDesktop: document.getElementById('ttWikiDesktop'),
        wikiMobile: document.getElementById('ttWikiMobile'),
        btnWiki: document.getElementById('ttBtnWiki'),
        btnCategory: document.getElementById('ttBtnCategory'),
        acq: document.getElementById('ttAcquisition'),
        acqList: document.getElementById('ttAcquisitionList'),
        extraIngContainer: document.getElementById('ttExtraIngredients'),
        extraIngList: document.getElementById('ttExtraIngredientsList')
    }
};

function isMobileUX() {
    return window.matchMedia("(any-pointer: coarse) and (hover: none)").matches;
}

function safeReplaceState(state, url) {
    try { history.replaceState(state, "", url); } catch (e) { console.warn("Local file history blocked."); }
}

function safePushState(state, url) {
    try { history.pushState(state, "", url); } catch (e) { console.warn("Local file history blocked."); }
}

// --- Toolbar Drag-to-Scroll Logic ---
let isToolbarDragging = false;
let toolbarStartX;
let toolbarScrollLeft;

dom.toolbarTools.addEventListener('mousedown', (e) => {
    isToolbarDragging = true;
    toolbarStartX = e.pageX - dom.toolbarTools.offsetLeft;
    toolbarScrollLeft = dom.toolbarTools.scrollLeft;
    dom.toolbarTools.style.cursor = 'grabbing';
});

dom.toolbarTools.addEventListener('mouseleave', () => {
    isToolbarDragging = false;
    dom.toolbarTools.style.cursor = '';
    dom.toolbarTools.style.pointerEvents = '';
});

dom.toolbarTools.addEventListener('mouseup', () => {
    isToolbarDragging = false;
    dom.toolbarTools.style.cursor = '';
    setTimeout(() => { dom.toolbarTools.style.pointerEvents = ''; }, 10);
});

dom.toolbarTools.addEventListener('mousemove', (e) => {
    if (!isToolbarDragging) return;
    e.preventDefault();
    const x = e.pageX - dom.toolbarTools.offsetLeft;
    const walk = (x - toolbarStartX) * 1.5; 
    if (Math.abs(walk) > 5) dom.toolbarTools.style.pointerEvents = 'none';
    dom.toolbarTools.scrollLeft = toolbarScrollLeft - walk;
});


// --- Home Mode FLIP Animation Engine ---
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
        document.getElementById('dbStatus') 
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
            el.style.transform = `translate(${invertX}px, ${invertY}px) scale(${invertScaleX})`;
        } else {
            el.style.transform = `translate(${invertX}px, ${invertY}px)`;
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

function getFriendlyKnockback(value) {
    if (value === 0) return "No knockback";
    if (value <= 1.4) return "Extremely weak knockback";
    if (value <= 2.9) return "Very weak knockback";
    if (value <= 3.9) return "Weak knockback";
    if (value <= 5.9) return "Average knockback";
    if (value <= 6.9) return "Strong knockback";
    if (value <= 7.9) return "Very strong knockback";
    if (value <= 8.9) return "Extremely strong knockback";
    if (value <= 10.9) return "Godly knockback";
    return "Insane knockback";
}

function getFriendlyUseTime(value) {
    if (value <= 8) return "Insanely fast speed";
    if (value <= 15) return "Very fast speed";
    if (value <= 20) return "Fast speed";
    if (value <= 25) return "Average speed";
    if (value <= 30) return "Slow speed";
    if (value <= 35) return "Very slow speed";
    if (value <= 45) return "Extremely slow speed";
    return "Snail speed";
}

function getMinScale() {
    const w = window.innerWidth;
    if (w < 600) return 0.40; 
    if (w < 1024) return 0.25; 
    return 0.15; 
}

function renderLoop() {
    const factor = 0.15;
    currentX += (targetX - currentX) * factor;
    currentY += (targetY - currentY) * factor;
    currentScale += (targetScale - currentScale) * factor;

    dom.treeContainer.style.transform = `translate(${currentX}px, ${currentY}px) scale(${currentScale})`;

    const diff = Math.abs(targetX - currentX) + Math.abs(targetY - currentY) + Math.abs(targetScale - currentScale);
    if (diff < 0.001 && !isPanning && !initialPinchDist) {
        currentX = targetX;
        currentY = targetY;
        currentScale = targetScale;
        dom.treeContainer.style.transform = `translate(${currentX}px, ${currentY}px) scale(${currentScale})`;
        isAnimating = false;
    } else {
        requestAnimationFrame(renderLoop);
    }
}

function triggerAnimation() {
    if (!isAnimating) {
        isAnimating = true;
        requestAnimationFrame(renderLoop);
    }
}

function createDirectImageUrl(name) {
    if (!name) return FALLBACK_ICON;
    const f = name.replace(/ /g, '_') + '.png';
    const h = md5(f);
    return `https://terraria.wiki.gg/images/${h[0]}/${h.substring(0, 2)}/${f}`;
}

dom.fileInput.addEventListener('change', (e) => processFile(e.target.files[0]));
document.body.addEventListener('dragover', e => e.preventDefault());
document.body.addEventListener('drop', e => { e.preventDefault(); if(e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]); });

function processFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => initializeData(JSON.parse(e.target.result));
    reader.readAsText(file);
}

window.addEventListener('load', loadDefaultData);

async function loadDefaultData() {
    dom.uploadSection.classList.remove('hidden');
    
    const fallbackTimer = setTimeout(() => {
        if (Object.keys(itemsDatabase).length === 0) {
            dom.dbStatus.innerHTML = `Loading failed. <button onclick="document.getElementById('fileInput').click()" class="text-blue-500 hover:text-blue-600 underline ml-1 pointer-events-auto">Upload Data</button>`;
        }
    }, 5000);

    try {
        const res = await fetch(JSON_FILENAME);
        if (!res.ok) throw new Error("Fetch failed");
        clearTimeout(fallbackTimer);
        initializeData(await res.json());
    } catch (e) {
        setTimeout(() => {
            dom.autoLoadStatus.classList.add('hidden');
            dom.manualUpload.classList.remove('hidden');
        }, 800);
    }
}

function buildUsageIndex() {
    usageIndex = {};
    Object.values(itemsDatabase).forEach(item => {
        if (item.crafting && item.crafting.recipes) {
            item.crafting.recipes.forEach(recipe => {
                recipe.ingredients.forEach(ing => {
                    const addUsage = (targetName, groupName) => {
                        const key = targetName.toLowerCase();
                        if (!usageIndex[key]) usageIndex[key] = [];
                        usageIndex[key].push({ id: item.id, amount: ing.amount, recipe: recipe, viaGroup: groupName });
                    };
                    addUsage(ing.name, null);
                    if (RECIPE_GROUPS[ing.name]) {
                        RECIPE_GROUPS[ing.name].forEach(groupItem => addUsage(groupItem, ing.name));
                    }
                });
            });
        }
    });
}

function initializeData(data) {
    itemsDatabase = data;
    itemIndex = Object.values(itemsDatabase).map(i => ({ 
        id: i.id, 
        name: i.name, 
        type: (i.specific_type || "").toLowerCase(),
        fallback_image: i.image_url 
    }));
    
    buildUsageIndex(); 

    dom.uploadSection.classList.add('hidden');
    dom.searchInput.disabled = false;
    dom.dbStatus.innerText = `${Object.keys(itemsDatabase).length.toLocaleString()} Items`;
    dom.dbStatus.classList.add('text-green-500');
    dom.dbStatus.classList.remove('text-slate-500');
    dom.searchInput.focus();

    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const cat = params.get('category');
    
    appHistory = [];
    
    if (id && itemsDatabase[id]) {
        historyIdx = 0;
        appHistory[historyIdx] = { viewType: 'tree', id: id, mode: treeMode, expanded: [], discoverItems: [] };
        safeReplaceState({ idx: historyIdx }, window.location.search);
        removeHomeMode();
        viewItem(id, true); 
    } else if (cat) {
        historyIdx = 0;
        appHistory[historyIdx] = { viewType: 'category', category: cat };
        safeReplaceState({ idx: historyIdx }, window.location.search);
        removeHomeMode();
        viewCategory(cat);
    } else {
        historyIdx = 0;
        appHistory[historyIdx] = { isHome: true, viewType: 'home' };
        safeReplaceState({ idx: historyIdx, isHome: true }, window.location.pathname);
    }
}

// --- History API & Two-Phase IK Controllers ---

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
    if (historyIdx >= 0 && appHistory[historyIdx]) {
        appHistory[historyIdx].x = targetX; 
        appHistory[historyIdx].y = targetY;
        appHistory[historyIdx].scale = targetScale;
        
        if (currentViewType === 'tree') {
            appHistory[historyIdx].expanded = Array.from(expandedNodes);
            appHistory[historyIdx].discoverItems = [...discoverBoxItems];
            
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

function performIKTransition(preAnimationSetup, buildDOM, postDOMAlign) {
    if (pendingDOMSwap) {
        clearTimeout(transitionTimeout);
        pendingDOMSwap(); 
    }
    
    const existingGhost = document.getElementById('ghostContainer');
    if (existingGhost) existingGhost.remove();

    const hasMovement = preAnimationSetup(); 
    if (hasMovement) triggerAnimation();

    const waitTime = hasMovement ? 400 : 0;

    pendingDOMSwap = () => {
        pendingDOMSwap = null; 
        const hasContent = dom.treeContainer.innerHTML.trim() !== '';
        let ghost = null;
        
        if (hasMovement) {
            currentX = targetX;
            currentY = targetY;
            currentScale = targetScale;
            dom.treeContainer.style.transform = `translate(${currentX}px, ${currentY}px) scale(${currentScale})`;
        }
        
        if (hasContent) {
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
        dom.treeContainer.style.opacity = '0';
        
        buildDOM();
        postDOMAlign(); 
        
        dom.treeContainer.style.transform = `translate(${currentX}px, ${currentY}px) scale(${currentScale})`;
        void dom.treeContainer.offsetWidth; 

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
            appHistory[historyIdx] = { viewType: id ? 'tree' : 'category', id: id, category: cat, mode: treeMode, expanded: [], discoverItems: [] };
            
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

            if (currentViewType === 'tree' && state.viewType === 'tree') {
                if (isBackward) {
                    const bridgeId = currentTreeItemId;
                    loadTree(state.id, true, true, 'backward', {
                        bridgeId: bridgeId,
                        targetState: state
                    });
                } else {
                    const bridgeId = pastState.bridgeId; 
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
        appHistory.push({ viewType: 'tree', id: currentTreeItemId, mode: treeMode, expanded: [], discoverItems: [...discoverBoxItems] });
        
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
    appHistory.push({ viewType: 'tree', id: targetId, mode: treeMode, expanded: [], discoverItems: [...discoverBoxItems] });
    
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
    appHistory = appHistory.slice(0, historyIdx + 1);
    appHistory.push({ viewType: 'tree', id: id, mode: treeMode, expanded: [], discoverItems: [...discoverBoxItems] });
    
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
    appHistory = appHistory.slice(0, historyIdx + 1);
    appHistory.push({ viewType: 'category', category: typeStr });
    
    historyIdx++;
    safePushState({ idx: historyIdx }, `?category=${encodeURIComponent(typeStr)}`);
    updateNavButtons();
    loadCategory(typeStr, false);
}

// --- Intelligent Search & UI Events ---

dom.mobileMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dom.toolbarTools.classList.toggle('hidden');
});

dom.toolbarTools.addEventListener('click', (e) => {
    if (window.getComputedStyle(dom.mobileMenuBtn.parentElement).display !== 'none') {
        if (e.target === dom.toolbarTools) return;
        if (e.target.closest('#toolFilters') || e.target.id === 'showTransmutations') return;
        setTimeout(() => { dom.toolbarTools.classList.add('hidden'); }, 150);
    }
});

dom.transmuteCheck.addEventListener('change', (e) => {
    showTransmutations = e.target.checked;
    if (currentViewType === 'tree') {
        saveCurrentState();
        loadTree(currentTreeItemId, true); 
    }
});

document.querySelectorAll('input[name="treeMode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        if (treeMode !== e.target.value) {
            switchModeKinematic(e.target.value);
        }
    });
});

document.addEventListener('click', (e) => {
    if (!dom.searchInput.contains(e.target) && !dom.searchResults.contains(e.target)) {
        dom.searchResults.classList.add('hidden');
    }
    if (!dom.mobileMenuBtn.contains(e.target) && !dom.toolbarTools.contains(e.target)) {
        dom.toolbarTools.classList.add('hidden');
    }
    if (isMobileUX() && activeMobileCard && !activeMobileCard.contains(e.target) && !dom.tooltip.el.contains(e.target)) {
        activeMobileCard.classList.remove('mobile-active');
        activeMobileCard = null;
        dom.tooltip.el.classList.add('hidden');
    }
    
    const discoverResults = document.getElementById('discoverSearchResults');
    const discoverInput = document.getElementById('discoverSearchInput');
    if (discoverResults && discoverInput && !discoverResults.contains(e.target) && !discoverInput.contains(e.target)) {
        discoverResults.classList.add('hidden');
    }
});

dom.searchInput.addEventListener('focus', () => {
    if (dom.searchInput.value.length >= 2 && dom.searchResults.innerHTML.trim() !== '') {
        dom.searchResults.classList.remove('hidden');
    }
});

function updateSearchHighlight(resultsArray, index) {
    resultsArray.forEach((el, idx) => {
        if (idx === index) {
            el.classList.add('bg-blue-100', 'dark:bg-slate-600');
            el.classList.remove('hover:bg-slate-100', 'dark:hover:bg-slate-700');
            el.scrollIntoView({ block: 'nearest' });
        } else {
            el.classList.remove('bg-blue-100', 'dark:bg-slate-600');
            el.classList.add('hover:bg-slate-100', 'dark:hover:bg-slate-700');
        }
    });
}

function attachSearchLogic(inputEl, resultsEl, onSelectCallback) {
    let localActiveIndex = -1;
    
    inputEl.addEventListener('keydown', (e) => {
        const results = Array.from(resultsEl.children);
        if (results.length === 0 || resultsEl.classList.contains('hidden')) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            localActiveIndex = Math.min(results.length - 1, localActiveIndex + 1);
            updateSearchHighlight(results, localActiveIndex);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            localActiveIndex = Math.max(0, localActiveIndex - 1);
            updateSearchHighlight(results, localActiveIndex);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const targetIdx = localActiveIndex >= 0 ? localActiveIndex : 0;
            if (results[targetIdx]) results[targetIdx].click();
        }
    });

    inputEl.addEventListener('input', (e) => {
        const val = e.target.value.toLowerCase().trim();
        localActiveIndex = -1;
        
        if (val.length < 2) { 
            resultsEl.classList.add('hidden'); 
            return; 
        }
        
        const tokens = val.split(' ').filter(t => t.length > 0);

        const matches = itemIndex.filter(i => {
            return tokens.every(token => 
                i.name.toLowerCase().includes(token) || 
                i.type.includes(token)
            );
        }).map(i => {
            let score = 0;
            const nameLower = i.name.toLowerCase();
            if (nameLower === val) score += 100;
            else if (nameLower.startsWith(val)) score += 50;
            else if (nameLower.includes(val)) score += 10;
            if (i.type === val) score += 20;
            return { item: i, score: score };
        }).sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.item.name.localeCompare(b.item.name);
        }).slice(0, 15);
        
        resultsEl.innerHTML = ''; 
        
        if (matches.length > 0) {
            resultsEl.classList.remove('hidden');
            matches.forEach(m => {
                const d = document.createElement('div');
                d.className = 'search-result-item flex items-center justify-between p-2 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer border-b border-slate-200 dark:border-slate-700 text-sm transition-colors';
                
                const leftWrap = document.createElement('div');
                leftWrap.className = 'flex items-center gap-3';
                
                const img = document.createElement('img');
                img.src = createDirectImageUrl(m.item.name);
                img.className = 'w-6 h-6 object-contain';
                
                const txt = document.createElement('span');
                txt.className = 'text-slate-800 dark:text-slate-200 font-medium truncate max-w-[150px]';
                txt.textContent = m.item.name;
                
                leftWrap.append(img, txt);
                d.appendChild(leftWrap);
                
                if (m.item.type) {
                    const typeTag = document.createElement('span');
                    typeTag.className = 'text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-bold truncate';
                    typeTag.textContent = m.item.type;
                    d.appendChild(typeTag);
                }

                d.onclick = () => {
                    resultsEl.classList.add('hidden');
                    inputEl.value = '';
                    onSelectCallback(m.item);
                };
                
                resultsEl.appendChild(d);
            });
        } else {
            resultsEl.classList.add('hidden');
        }
    });
}

attachSearchLogic(dom.searchInput, dom.searchResults, (item) => {
    viewItem(item.id, true);
});

dom.resetViewBtn.onclick = () => resetView();

let wheelTimeout;
dom.vizArea.addEventListener('wheel', e => { 
    e.preventDefault(); 
    const rect = dom.vizArea.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const localX = (mouseX - targetX) / targetScale;
    const localY = (mouseY - targetY) / targetScale;
    const zoomDelta = -e.deltaY * 0.0015; 
    
    targetScale = Math.max(getMinScale(), Math.min(targetScale + zoomDelta, 4));
    targetX = mouseX - localX * targetScale;
    targetY = mouseY - localY * targetScale;
    triggerAnimation();

    clearTimeout(wheelTimeout);
    wheelTimeout = setTimeout(saveCurrentState, 300);
});

dom.vizArea.addEventListener('mousedown', e => { 
    if (e.target.closest('.no-pan')) return; 
    isPanning = true; 
    isDraggingThresholdMet = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    startX = e.clientX - targetX; 
    startY = e.clientY - targetY; 
    dom.vizArea.classList.add('grabbing'); 
});

window.addEventListener('mouseup', () => { 
    if (isPanning) {
        isPanning = false; 
        dom.vizArea.classList.remove('grabbing'); 
        saveCurrentState();
    }
});

window.addEventListener('mousemove', e => { 
    if(isPanning) { 
        if (Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY) > 5) {
            isDraggingThresholdMet = true;
        }
        e.preventDefault(); 
        targetX = e.clientX - startX; 
        targetY = e.clientY - startY; 
        triggerAnimation(); 
    }
});

dom.vizArea.addEventListener('touchstart', e => {
    if (e.target.closest('.no-pan')) return;
    if (e.touches.length === 1) {
        isPanning = true;
        isDraggingThresholdMet = false;
        dragStartX = e.touches[0].clientX;
        dragStartY = e.touches[0].clientY;
        startX = e.touches[0].clientX - targetX;
        startY = e.touches[0].clientY - targetY;
        dom.vizArea.classList.add('grabbing');
    } else if (e.touches.length === 2) {
        isPanning = false; 
        initialPinchDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );
        initialScale = targetScale;
    }
}, { passive: false });

dom.vizArea.addEventListener('touchmove', e => {
    if (e.target.closest('.no-pan') && !isPanning && !initialPinchDist) return;
    e.preventDefault(); 
    if (isPanning && e.touches.length === 1) {
        if (Math.hypot(e.touches[0].clientX - dragStartX, e.touches[0].clientY - dragStartY) > 5) {
            isDraggingThresholdMet = true;
        }
        targetX = e.touches[0].clientX - startX;
        targetY = e.touches[0].clientY - startY;
        triggerAnimation();
    } else if (e.touches.length === 2 && initialPinchDist) {
        const currentDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
        );
        const zoomDelta = currentDist / initialPinchDist;
        
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const rect = dom.vizArea.getBoundingClientRect();
        const mouseX = midX - rect.left;
        const mouseY = midY - rect.top;
        const localX = (mouseX - targetX) / targetScale;
        const localY = (mouseY - targetY) / targetScale;

        const newScale = Math.max(getMinScale(), Math.min(initialScale * zoomDelta, 4));
        if (Number.isFinite(newScale)) {
            targetScale = newScale;
            targetX = mouseX - localX * targetScale;
            targetY = mouseY - localY * targetScale;
            triggerAnimation();
        }
    }
}, { passive: false });

dom.vizArea.addEventListener('touchend', e => {
    if (e.touches.length === 0) {
        isPanning = false;
        initialPinchDist = null;
        dom.vizArea.classList.remove('grabbing');
        saveCurrentState();
    } else if (e.touches.length === 1) {
        initialPinchDist = null;
        isPanning = true;
        startX = e.touches[0].clientX - targetX;
        startY = e.touches[0].clientY - targetY;
    }
});


// --- Base Rendering Tools ---
function createItemCardElement(data, sizeClasses, contextRecipe = null, customClickHandler = null) {
    const card = document.createElement('div');
    card.className = `item-card relative flex flex-col items-center justify-center rounded-lg ${sizeClasses}`;
    card.dataset.id = data.id; 
    
    const img = document.createElement('img');
    img.src = createDirectImageUrl(data.name);
    img.draggable = false; 
    img.className = sizeClasses.includes('w-32') ? 'w-14 h-14 object-contain mb-2' : 'w-10 h-10 object-contain mb-1';
    img.onerror = () => { if(img.src !== data.image_url) img.src = data.image_url; else img.src = FALLBACK_ICON; };
    
    const name = document.createElement('span');
    name.textContent = data.name;
    name.className = `text-center font-semibold leading-tight px-1 line-clamp-2 text-slate-800 dark:text-slate-200 ${sizeClasses.includes('w-32') ? 'text-sm' : 'text-[10px]'}`;
    
    if (data.hardmode) {
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
            if(data.url) window.open(data.url, '_blank'); 
            return;
        } 
        if (e.shiftKey && data.specific_type) {
            viewCategory(data.specific_type);
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

// --- Lateral Category Engine ---
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
            const items = Object.values(itemsDatabase).filter(i => i.specific_type === typeStr);
            
            items.sort((a, b) => {
                const dmgA = a.stats?.damage ?? -1;
                const dmgB = b.stats?.damage ?? -1;
                if (dmgA !== dmgB) {
                    return dmgB - dmgA; 
                }
                return a.name.localeCompare(b.name);
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

// --- Tree Engine ---
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

    if (!preSetup()) {
        preSetup = () => false;
        postAlign = () => {
            if (preserveState && bridgeParams && bridgeParams.targetState && bridgeParams.targetState.x !== undefined) {
                currentScale = bridgeParams.targetState.scale;
                currentX = bridgeParams.targetState.x;
                currentY = bridgeParams.targetState.y;
            } else {
                calculateResetView();
                currentX = targetX; currentY = targetY; currentScale = targetScale;
            }
            targetScale = currentScale; targetX = currentX; targetY = currentY;
        };
    }

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
    }, postAlign);
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

function getSmartRecipe(recipes, itemName = "") {
    if (!recipes || recipes.length === 0) return null;

    let valid = recipes;
    if (!showTransmutations) {
        valid = recipes.filter(r => {
            if (r.transmutation) return false;
            if (r.ingredients.length === 1 && itemName) {
                const ingName = r.ingredients[0].name.toLowerCase();
                const outName = itemName.toLowerCase();
                if ((ingName.includes("wall") && !outName.includes("wall")) ||
                    (ingName.includes("platform") && !outName.includes("platform"))) {
                    return false;
                }
            }
            return true;
        });
        if (valid.length === 0) return null;
    }

    const modernRecipes = valid.filter(r => r.version !== "Legacy");
    valid = modernRecipes.length > 0 ? modernRecipes : valid;

    const normalCrafts = valid.filter(r => !r.transmutation);
    const pool = normalCrafts.length > 0 ? normalCrafts : valid;

    return pool.reduce((best, curr) => {
        const bestLen = best.ingredients.length;
        const currLen = curr.ingredients.length;
        if (currLen > bestLen) return curr;
        if (currLen < bestLen) return best;
        const bestCost = best.ingredients.reduce((a, i) => a + i.amount, 0);
        const currCost = curr.ingredients.reduce((a, i) => a + i.amount, 0);
        return currCost < bestCost ? curr : best;
    });
}

function getDiscoverableItems() {
    if (discoverBoxItems.length === 0) return [];
    
    const boxItemNames = discoverBoxItems.map(id => itemsDatabase[id].name.toLowerCase());
    const uniqueUsagesMap = new Map();

    for (const itemId in itemsDatabase) {
        const item = itemsDatabase[itemId];
        if (!item.crafting || !item.crafting.is_craftable) continue;
        
        for (const recipe of item.crafting.recipes) {
            if (!showTransmutations && recipe.transmutation) continue;
            
            let recipeMatchesAll = true;
            for (const boxName of boxItemNames) {
                let hasBoxItem = false;
                for (const ing of recipe.ingredients) {
                    const ingLower = ing.name.toLowerCase();
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
    uniqueUsages.sort((a,b) => itemsDatabase[a.id]?.name.localeCompare(itemsDatabase[b.id]?.name));
    return uniqueUsages;
}

function createDiscoverRootNode() {
    const node = document.createElement('div');
    node.className = 'tree-node is-root';

    const boxContainer = document.createElement('div');
    boxContainer.className = 'discover-box-container bg-white dark:bg-slate-800 border-4 border-emerald-500 ring-4 ring-emerald-500/20 rounded-xl p-4 flex flex-col items-center shadow-2xl relative z-10 w-96';
    boxContainer.dataset.id = 'discover_root';

    const header = document.createElement('div');
    header.className = 'w-full flex justify-between items-center mb-4 border-b border-slate-200 dark:border-slate-700 pb-2';
    
    const title = document.createElement('h3');
    title.className = 'text-emerald-600 dark:text-emerald-400 font-bold text-lg flex items-center gap-2';
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
            loadTree(currentTreeItemId, true);
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
            loadTree(currentTreeItemId, true);
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
    if (!data) return document.createElement('div');

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

    if (treeMode === 'recipe') {
        if (data.crafting && data.crafting.is_craftable && !visited.has(id)) {
            const recipe = getSmartRecipe(data.crafting.recipes, data.name);
            if (recipe && recipe.ingredients.length > 0) {
                hasValidChildren = true;
                childrenData = recipe.ingredients;
            }
        }
    } else if (treeMode === 'usage' || treeMode === 'discover') {
        const allUsages = usageIndex[data.name.toLowerCase()] || [];
        const validUsages = allUsages.filter(u => showTransmutations || !u.recipe.transmutation);
        
        const uniqueUsagesMap = new Map();
        validUsages.forEach(u => {
            if (!uniqueUsagesMap.has(u.id)) uniqueUsagesMap.set(u.id, u);
        });
        
        const uniqueUsages = Array.from(uniqueUsagesMap.values());
        uniqueUsages.sort((a,b) => itemsDatabase[a.id]?.name.localeCompare(itemsDatabase[b.id]?.name));

        if (uniqueUsages.length > 0 && !visited.has(id)) {
            hasValidChildren = true;
            childrenData = uniqueUsages;
        }
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
                        const isGroup = ing.name.toLowerCase().startsWith("any ");
                        let childNode;
                        if (isGroup) {
                            childNode = createGroupNode(ing.name, ing.amount, attachLineEvents);
                        } else {
                            const cid = itemIndex.find(i => i.name === ing.name)?.id;
                            childNode = cid ? createTreeNode(cid, false, newVis) : createGenericNode(ing.name, ing.amount);
                            if(cid) {
                                const b = document.createElement('span');
                                b.className = 'absolute -top-2 -right-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-500 text-slate-700 dark:text-slate-300 text-[10px] px-1.5 py-0.5 rounded-full z-20 font-mono shadow';
                                b.textContent = `x${ing.amount}`;
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
                        b.textContent = usage.viaGroup ? `via ${usage.viaGroup}` : `Req: ${usage.amount}`;
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
            
            if (wasClosed || isDeepExpandMode) {
                setTimeout(() => {
                    if (isDeepExpandMode) {
                        focusSubtree(node, container);
                    } else if (!isExpandedAll) {
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
            } else {
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

function createGroupNode(ingName, amount, lineEventsFn) {
    const container = document.createElement('div');
    container.className = 'tree-node';

    const box = document.createElement('div');
    box.className = 'relative flex flex-col items-center justify-center p-3 rounded-xl bg-slate-100 dark:bg-slate-800/40 border border-dashed border-slate-300 dark:border-slate-500 shadow-inner z-10';

    const label = document.createElement('div');
    label.className = 'text-xs text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider mb-2';
    label.textContent = `${ingName} (x${amount})`;
    box.appendChild(label);

    const itemsRow = document.createElement('div');
    itemsRow.className = 'flex gap-2';

    const groupKeys = Object.keys(RECIPE_GROUPS);
    const matchedKey = groupKeys.find(k => ingName.toLowerCase() === k.toLowerCase());
    let altNames = matchedKey ? RECIPE_GROUPS[matchedKey] : [ingName.replace("Any ", "")];

    const displayNames = altNames.slice(0, 3);
    const remaining = altNames.length - 3;

    displayNames.forEach(altName => {
        const altId = itemIndex.find(i => i.name === altName)?.id;
        
        if (altId) {
            const data = itemsDatabase[altId];
            const miniCard = createItemCardElement(data, 'w-16 h-16');
            itemsRow.appendChild(miniCard);
        } else {
            const miniCard = document.createElement('div');
            miniCard.className = 'item-card flex flex-col items-center justify-center w-16 h-16 rounded bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600';
            const img = document.createElement('img');
            img.src = createDirectImageUrl(altName);
            img.draggable = false;
            img.className = 'w-6 h-6 object-contain mb-1';
            const nameSpan = document.createElement('span');
            nameSpan.textContent = altName;
            nameSpan.className = 'text-[10px] text-center leading-tight px-1 line-clamp-2 text-slate-800 dark:text-slate-200';
            miniCard.append(img, nameSpan);
            itemsRow.appendChild(miniCard);
        }
    });

    if (remaining > 0) {
        const moreNode = document.createElement('div');
        moreNode.className = 'flex items-center justify-center w-16 h-16 rounded bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 text-xs font-bold';
        moreNode.textContent = `+${remaining}`;
        itemsRow.appendChild(moreNode);
    }

    box.appendChild(itemsRow);
    container.appendChild(box);
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

function showTooltip(e, data, extraRecipe = null) {
    const rarityVal = data.stats?.rarity !== undefined ? data.stats.rarity : 0;
    dom.tooltip.name.className = `terraria-text font-bold text-lg leading-tight rarity-${rarityVal}`;
    dom.tooltip.name.textContent = data.name;
    
    if (!data.description || data.description.trim() === "N/A" || data.description.trim() === "") {
        dom.tooltip.desc.classList.add('hidden');
    } else {
        dom.tooltip.desc.textContent = data.description;
        dom.tooltip.desc.classList.remove('hidden');
    }
    
    dom.tooltip.image.src = createDirectImageUrl(data.name);
    dom.tooltip.image.onerror = () => { if(dom.tooltip.image.src !== data.image_url) dom.tooltip.image.src = data.image_url; else dom.tooltip.image.src = FALLBACK_ICON; };
    
    const usingMobileUX = isMobileUX();

    if (data.url || data.specific_type) {
        if (usingMobileUX) {
            dom.tooltip.wikiDesktop.classList.add('hidden');
            dom.tooltip.wikiMobile.classList.remove('hidden');
            
            dom.tooltip.btnWiki.classList.toggle('hidden', !data.url);
            dom.tooltip.btnCategory.classList.toggle('hidden', !data.specific_type);
            
            dom.tooltip.btnWiki.onclick = (ev) => { 
                ev.stopPropagation(); 
                if (activeMobileCard) activeMobileCard.classList.remove('mobile-active');
                activeMobileCard = null; dom.tooltip.el.classList.add('hidden'); 
                window.open(data.url, '_blank'); 
            };
            dom.tooltip.btnCategory.onclick = (ev) => { 
                ev.stopPropagation(); 
                if (activeMobileCard) activeMobileCard.classList.remove('mobile-active');
                activeMobileCard = null; dom.tooltip.el.classList.add('hidden'); 
                viewCategory(data.specific_type); 
            };
        } else {
            dom.tooltip.wikiMobile.classList.add('hidden');
            dom.tooltip.wikiDesktop.classList.remove('hidden');
            dom.tooltip.wikiDesktop.children[0].classList.toggle('hidden', !data.url);
            dom.tooltip.wikiDesktop.children[1].classList.toggle('hidden', !data.specific_type);
        }
    } else {
        dom.tooltip.wikiDesktop.classList.add('hidden');
        dom.tooltip.wikiMobile.classList.add('hidden');
    }
    
    dom.tooltip.stats.innerHTML = '';
    if (data.stats) {
        Object.entries(data.stats).forEach(([k, v]) => {
            if (k === 'rarity') return; 
            
            const statDiv = document.createElement('div');
            const keySpan = document.createElement('span');
            keySpan.className = 'text-slate-500 capitalize';
            
            let label = k.replace('_', ' ');
            if (k === 'usetime') label = 'Use Time';
            keySpan.textContent = label + ': ';
            
            const valSpan = document.createElement('span');
            valSpan.className = 'text-slate-900 dark:text-white font-medium';
            
            let displayValue = v;
            if (k === 'knockback') {
                displayValue = `${v} (${getFriendlyKnockback(v)})`;
            } else if (k === 'usetime') {
                displayValue = `${v} (${getFriendlyUseTime(v)})`;
            }
            
            valSpan.textContent = displayValue;
            statDiv.append(keySpan, valSpan);
            dom.tooltip.stats.appendChild(statDiv);
        });
    }
    
    const r = getSmartRecipe(data.crafting?.recipes, data.name);
    if (r) {
        dom.tooltip.stationText.textContent = `Crafted at: ${r.station}`;
        dom.tooltip.station.classList.remove('hidden');
    } else {
        dom.tooltip.station.classList.add('hidden');
    }

    if (data.acquisition && data.acquisition.length > 0) {
        dom.tooltip.acqList.innerHTML = '';
        const sources = data.acquisition.slice(0, 3);
        sources.forEach(src => {
            const li = document.createElement('li');
            const srcSpan = document.createElement('span');
            srcSpan.className = 'text-slate-700 dark:text-slate-300';
            srcSpan.textContent = src.source + ' ';
            const rateSpan = document.createElement('span');
            rateSpan.className = 'text-emerald-600 dark:text-emerald-500 text-xs';
            rateSpan.textContent = `(${src.rate})`;
            li.append(srcSpan, rateSpan);
            dom.tooltip.acqList.appendChild(li);
        });
        if (data.acquisition.length > 3) {
            const li = document.createElement('li');
            li.className = "text-xs text-slate-500 italic mt-1";
            li.textContent = `+${data.acquisition.length - 3} more...`;
            dom.tooltip.acqList.appendChild(li);
        }
        dom.tooltip.acq.classList.remove('hidden');
    } else {
        dom.tooltip.acq.classList.add('hidden');
    }

    if ((treeMode === 'usage' || treeMode === 'discover') && extraRecipe && (currentTreeItemId || discoverBoxItems.length > 0)) {
        
        const contextualRootNames = treeMode === 'discover' 
            ? discoverBoxItems.map(id => itemsDatabase[id].name.toLowerCase()) 
            : [itemsDatabase[currentTreeItemId].name.toLowerCase()];
        
        const extraIngs = extraRecipe.ingredients.filter(ing => {
            const ingLower = ing.name.toLowerCase();
            if (contextualRootNames.includes(ingLower)) return false;
            
            if (ingLower.startsWith('any ')) {
                const groupKey = Object.keys(RECIPE_GROUPS).find(k => k.toLowerCase() === ingLower);
                if (groupKey && RECIPE_GROUPS[groupKey].some(groupItem => contextualRootNames.includes(groupItem.toLowerCase()))) {
                    return false;
                }
            }
            return true;
        });

        if (extraIngs.length > 0) {
            dom.tooltip.extraIngContainer.classList.remove('hidden');
            dom.tooltip.extraIngList.innerHTML = '';
            
            extraIngs.forEach(ing => {
                const img = document.createElement('img');
                img.src = createDirectImageUrl(ing.name);
                img.className = 'w-6 h-6 object-contain rounded bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-300 dark:border-slate-600 shadow-sm';
                img.title = `${ing.name} (x${ing.amount})`;
                dom.tooltip.extraIngList.appendChild(img);
            });
        } else {
            dom.tooltip.extraIngContainer.classList.add('hidden');
        }
    } else {
        dom.tooltip.extraIngContainer.classList.add('hidden');
    }
    
    dom.tooltip.el.classList.remove('hidden');
    
    if (usingMobileUX) {
        const touchEvent = e.touches ? e.touches[0] : e;
        moveTooltip({ clientX: touchEvent.clientX, clientY: touchEvent.clientY });
    } else if (e.clientX !== undefined) {
        moveTooltip(e);
    } else {
        moveTooltip({ clientX: e.x, clientY: e.y });
    }
}

function moveTooltip(e) {
    const tooltipEl = dom.tooltip.el;
    const w = tooltipEl.offsetWidth;
    const h = tooltipEl.offsetHeight;
    const offset = 15;
    let l = e.clientX + offset;
    let t = e.clientY + offset;

    if (l + w > window.innerWidth) l = e.clientX - w - offset;
    if (t + h > window.innerHeight) t = e.clientY - h - offset;
    l = Math.max(10, l); t = Math.max(10, t);

    tooltipEl.style.left = `${l}px`; 
    tooltipEl.style.top = `${t}px`;
}