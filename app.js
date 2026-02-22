// --- State Variables & Dependencies ---
let itemsDatabase = {}, itemIndex = [];
let usageIndex = {}; 

let currentX = 0, currentY = 0, currentScale = 1;
let targetX = 0, targetY = 0, targetScale = 1;   
let isAnimating = false;

let isPanning = false, startX = 0, startY = 0;
let showTransmutations = false;

// Drag vs Click Safety Threshold
let isDraggingThresholdMet = false;
let dragStartX = 0, dragStartY = 0;

// Unified View State
let currentViewType = 'tree'; 
let currentTreeItemId = null;
let currentCategoryName = null;
let treeMode = 'recipe'; 
let expandedNodes = new Set(); 
let isExpandedAll = false;

let lineTooltipTimeout = null;
let lastMouseCoords = { x: 0, y: 0 };

let appHistory = [];
let historyIdx = -1;
const MAX_HISTORY = 50;

// Mobile Touch Tracking
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
        acqList: document.getElementById('ttAcquisitionList')
    }
};

// --- Formatters (Terraria Standard Logic) ---
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

// --- Physics Engine ---
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

// --- Data Fetching & Initialization ---
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
    try {
        const res = await fetch(JSON_FILENAME);
        if (!res.ok) throw new Error("Fetch failed");
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
    itemIndex = Object.values(itemsDatabase).map(i => ({ id: i.id, name: i.name, fallback_image: i.image_url }));
    buildUsageIndex(); 

    dom.uploadSection.classList.add('hidden');
    dom.searchInput.disabled = false;
    dom.searchInput.placeholder = "Search item...";
    dom.dbStatus.innerText = `${Object.keys(itemsDatabase).length.toLocaleString()} Items`;
    dom.dbStatus.classList.add('text-green-500');
    dom.dbStatus.classList.remove('text-slate-500');
    dom.searchInput.focus();

    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const cat = params.get('category');
    
    if (id && itemsDatabase[id]) {
        viewItem(id);
    } else if (cat) {
        viewCategory(cat);
    }
}

// --- History API & Navigation Controllers ---
function saveCurrentState() {
    if (historyIdx >= 0 && appHistory[historyIdx]) {
        appHistory[historyIdx].x = targetX;
        appHistory[historyIdx].y = targetY;
        appHistory[historyIdx].scale = targetScale;
        if (currentViewType === 'tree') {
            appHistory[historyIdx].expanded = Array.from(expandedNodes);
        }
        history.replaceState({ idx: historyIdx }, "", window.location.search);
    }
}

function updateNavButtons() {
    dom.navBack.disabled = historyIdx <= 0;
    dom.navForward.disabled = historyIdx >= appHistory.length - 1;
}

dom.navBack.onclick = () => { saveCurrentState(); history.back(); };
dom.navForward.onclick = () => { saveCurrentState(); history.forward(); };

window.addEventListener('popstate', (e) => {
    if (e.state && e.state.idx !== undefined) {
        historyIdx = e.state.idx;
        const state = appHistory[historyIdx];
        if (state) {
            if (state.viewType === 'category') {
                loadCategory(state.category, true, true);
            } else {
                treeMode = state.mode;
                document.querySelector(`input[name="treeMode"][value="${state.mode}"]`).checked = true;
                if (treeMode === 'usage') dom.treeContainer.classList.add('mode-usage');
                else dom.treeContainer.classList.remove('mode-usage');
                
                expandedNodes = new Set(state.expanded || []);
                loadTree(state.id, true, true); 
            }
            
            updateNavButtons();
            
            currentX = state.x; targetX = state.x;
            currentY = state.y; targetY = state.y;
            currentScale = state.scale; targetScale = state.scale;
            dom.treeContainer.style.transform = `translate(${currentX}px, ${currentY}px) scale(${currentScale})`;
        }
    }
});

function viewItem(id) {
    saveCurrentState(); 
    appHistory = appHistory.slice(0, historyIdx + 1);
    appHistory.push({ viewType: 'tree', id: id, mode: treeMode, expanded: [] });
    
    if (appHistory.length > MAX_HISTORY) appHistory.shift();
    else historyIdx++;
    
    history.pushState({ idx: historyIdx }, "", `?id=${id}`);
    updateNavButtons();
    loadTree(id, false);
}

function viewCategory(typeStr) {
    if (!typeStr) return;
    saveCurrentState();
    appHistory = appHistory.slice(0, historyIdx + 1);
    appHistory.push({ viewType: 'category', category: typeStr });
    
    if (appHistory.length > MAX_HISTORY) appHistory.shift();
    else historyIdx++;
    
    history.pushState({ idx: historyIdx }, "", `?category=${encodeURIComponent(typeStr)}`);
    updateNavButtons();
    loadCategory(typeStr, false);
}

// --- User Interface Events ---

dom.mobileMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dom.toolbarTools.classList.toggle('hidden');
});

dom.transmuteCheck.addEventListener('change', (e) => {
    showTransmutations = e.target.checked;
    if (currentViewType === 'tree' && currentTreeItemId) {
        saveCurrentState();
        loadTree(currentTreeItemId, true); 
    }
});

document.querySelectorAll('input[name="treeMode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        treeMode = e.target.value;
        if (treeMode === 'usage') {
            dom.treeContainer.classList.add('mode-usage');
        } else {
            dom.treeContainer.classList.remove('mode-usage');
        }
        if (currentViewType === 'tree' && currentTreeItemId) {
            viewItem(currentTreeItemId);
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
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (isTouch && activeMobileCard && !activeMobileCard.contains(e.target) && !dom.tooltip.el.contains(e.target)) {
        activeMobileCard = null;
        dom.tooltip.el.classList.add('hidden');
    }
});

dom.searchInput.addEventListener('focus', () => {
    if (dom.searchInput.value.length >= 2 && dom.searchResults.innerHTML.trim() !== '') {
        dom.searchResults.classList.remove('hidden');
    }
});

dom.searchInput.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase();
    if (val.length < 2) { dom.searchResults.classList.add('hidden'); return; }
    const matches = itemIndex.filter(i => i.name.toLowerCase().includes(val))
        .sort((a, b) => {
            const as = a.name.toLowerCase().startsWith(val);
            const bs = b.name.toLowerCase().startsWith(val);
            return as === bs ? 0 : as ? -1 : 1;
        }).slice(0, 10);
    
    dom.searchResults.innerHTML = '';
    if (matches.length > 0) {
        dom.searchResults.classList.remove('hidden');
        matches.forEach(i => {
            const d = document.createElement('div');
            d.className = 'flex items-center gap-3 p-2 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer border-b border-slate-200 dark:border-slate-700 text-sm';
            d.innerHTML = `<img src="${createDirectImageUrl(i.name)}" class="w-6 h-6 object-contain"><span class="text-slate-800 dark:text-slate-200 font-medium">${i.name}</span>`;
            d.onclick = () => viewItem(i.id); 
            dom.searchResults.appendChild(d);
        });
    } else dom.searchResults.classList.add('hidden');
});

dom.resetViewBtn.onclick = () => resetView(false);

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

// Panning & Touch Tracking (Includes Distance Threshold for anti-click logic)
dom.vizArea.addEventListener('mousedown', e => { 
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
function resetView(isInitialLoad = false) { 
    const vizRect = dom.vizArea.getBoundingClientRect();
    const treeWidth = dom.treeContainer.scrollWidth;
    const treeHeight = dom.treeContainer.scrollHeight;
    const paddingX = 80; const paddingY = 80;
    const scaleX = (vizRect.width - paddingX) / treeWidth;
    const scaleY = (vizRect.height - paddingY) / treeHeight;
    
    targetScale = Math.max(getMinScale(), Math.min(scaleX, scaleY, 1.1));
    targetX = (vizRect.width - (treeWidth * targetScale)) / 2;
    targetY = Math.max(40, (vizRect.height - (treeHeight * targetScale)) / 2);
    
    if (isInitialLoad) {
        currentX = targetX; currentY = targetY; currentScale = targetScale;
        dom.treeContainer.style.transform = `translate(${currentX}px, ${currentY}px) scale(${currentScale})`;
    } else {
        triggerAnimation();
    }
    saveCurrentState();
}

// A reusable item card generator
function createItemCardElement(data, sizeClasses) {
    const card = document.createElement('div');
    card.className = `item-card relative flex flex-col items-center justify-center rounded-lg ${sizeClasses}`;
    
    const img = document.createElement('img');
    img.src = createDirectImageUrl(data.name);
    // FIX: Prevents the browser from natively dragging the image element
    img.draggable = false; 
    img.className = sizeClasses.includes('w-32') ? 'w-14 h-14 object-contain mb-2' : 'w-10 h-10 object-contain mb-1';
    img.onerror = () => { if(img.src !== data.image_url) img.src = data.image_url; else img.src = FALLBACK_ICON; };
    
    const name = document.createElement('span');
    name.textContent = data.name;
    name.className = `text-center font-semibold leading-tight px-2 line-clamp-2 text-slate-800 dark:text-slate-200 ${sizeClasses.includes('w-32') ? 'text-sm' : 'text-[10px]'}`;
    
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
        
        // Anti-click guard if the user was just dragging the canvas
        if (isDraggingThresholdMet) {
            isDraggingThresholdMet = false;
            return;
        }

        const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        
        if (isTouch) {
            if (activeMobileCard !== card) {
                activeMobileCard = card;
                showTooltip(e, data);
                return; // Tap 1: Show Tooltip
            }
        }
        
        // Tap 2 (Mobile) or Click (Desktop)
        activeMobileCard = null;
        dom.tooltip.el.classList.add('hidden');
        
        if (e.ctrlKey || e.metaKey) {
            if(data.url) window.open(data.url, '_blank'); 
        } else if (e.shiftKey && data.specific_type) {
            viewCategory(data.specific_type);
        } else {
            viewItem(data.id);
        }
    };
    
    card.onmouseenter = e => {
        const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        if(!isTouch) {
            clearTimeout(lineTooltipTimeout);
            showTooltip(e, data);
        }
    };
    card.onmouseleave = () => {
        const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        if(!isTouch) dom.tooltip.el.classList.add('hidden');
    };
    card.onmousemove = e => {
        const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        if(!isTouch) moveTooltip(e);
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
    dom.vizArea.classList.remove('hidden');
    dom.mainToolbar.classList.remove('hidden'); 
    
    dom.toolMode.classList.add('hidden');
    dom.toolFilters.classList.add('hidden');
    dom.expandAllBtn.classList.add('hidden');
    
    dom.treeContainer.innerHTML = '';
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
    
    if (!preserveState && !isHistoryPop) {
        setTimeout(() => resetView(true), 50);
    } else if (!isHistoryPop) {
        triggerAnimation();
    }
}

// --- Tree Engine ---
function loadTree(id, preserveState = false, isHistoryPop = false) {
    currentViewType = 'tree';
    currentTreeItemId = id;
    
    dom.searchInput.value = '';
    dom.searchResults.classList.add('hidden');
    dom.tooltip.el.classList.add('hidden'); 
    dom.vizArea.classList.remove('hidden');
    dom.mainToolbar.classList.remove('hidden'); 
    
    dom.toolMode.classList.remove('hidden');
    dom.toolFilters.classList.remove('hidden');
    dom.expandAllBtn.classList.remove('hidden');
    
    dom.treeContainer.innerHTML = '';
    if (treeMode === 'usage') dom.treeContainer.classList.add('mode-usage');
    
    let isFirstLoad = false;
    if (!preserveState) {
        expandedNodes.clear();
        isExpandedAll = false;
        isFirstLoad = true;
    }
    
    dom.treeContainer.appendChild(createTreeNode(id, true));
    syncExpandAllButton();
    
    if (!preserveState && !isHistoryPop) {
        setTimeout(() => resetView(isFirstLoad), 50);
    } else if (!isHistoryPop) {
        triggerAnimation();
    }
}

function syncExpandAllButton() {
    const expandBtns = Array.from(dom.treeContainer.querySelectorAll('.expand-btn'));
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
    const nr = nodeEl.querySelector('.item-card').getBoundingClientRect();
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

function createTreeNode(id, isRoot = false, visited = new Set()) {
    const data = itemsDatabase[id];
    if (!data) return document.createElement('div');

    const node = document.createElement('div');
    node.className = 'tree-node';
    
    const rootBorder = treeMode === 'recipe' ? 'border-blue-500 ring-blue-500/20' : 'border-purple-500 ring-purple-500/20';
    const card = createItemCardElement(data, isRoot ? `w-32 h-32 ring-4 ${rootBorder}` : 'w-24 h-24');
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
    } else if (treeMode === 'usage') {
        const allUsages = usageIndex[data.name.toLowerCase()] || [];
        const validUsages = allUsages.filter(u => showTransmutations || !u.recipe.transmutation);
        
        const uniqueUsagesMap = new Map();
        validUsages.forEach(u => {
            if (!uniqueUsagesMap.has(u.id)) {
                uniqueUsagesMap.set(u.id, u);
            }
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
        const btnColor = treeMode === 'recipe' ? 'bg-blue-600' : 'bg-purple-600';
        const btnHover = treeMode === 'recipe' ? 'hover:bg-blue-700' : 'hover:bg-purple-700';
        
        btn.className = `expand-btn mt-2 mb-2 w-6 h-6 rounded-full bg-slate-400 dark:bg-slate-700 ${btnHover} text-white text-xs flex items-center justify-center transition-colors shadow-md z-20`;
        btn.innerHTML = '<i class="fa-solid fa-plus"></i>';
        
        const container = document.createElement('div');
        container.className = 'tree-children hidden';
        
        btn.toggle = (targetState) => {
            const isClosed = container.classList.contains('hidden');
            
            if (targetState === 'open' && !isClosed) return false;
            if (targetState === 'close' && isClosed) return false;

            if (!isClosed) {
                container.classList.add('hidden');
                btn.innerHTML = '<i class="fa-solid fa-plus"></i>';
                btn.classList.remove(btnColor);
                expandedNodes.delete(id); 
            } else {
                container.innerHTML = '';
                container.classList.remove('hidden');
                btn.innerHTML = '<i class="fa-solid fa-minus"></i>';
                btn.classList.add(btnColor);
                expandedNodes.add(id); 
                
                const attachLineEvents = (el) => {
                    el.onmousemove = (e) => { 
                        lastMouseCoords = { x: e.clientX, y: e.clientY };
                        if (!dom.tooltip.el.classList.contains('hidden')) {
                            moveTooltip(e);
                        }
                    };
                    el.onmouseenter = (e) => {
                        container.classList.add('lines-hovered');
                        lastMouseCoords = { x: e.clientX, y: e.clientY };
                        lineTooltipTimeout = setTimeout(() => {
                            showTooltip(lastMouseCoords, data); 
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
                        const childNode = createTreeNode(usage.id, false, newVis);
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
            btn.toggle(); 
            setTimeout(() => syncExpandAllButton(), 10);
            
            if (wasClosed && !isExpandedAll) {
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
                }, 50);
            } else {
                saveCurrentState();
            }
        };
        
        node.append(btn, container);
        if(isRoot || expandedNodes.has(id)) btn.toggle('open');
    }

    if (isRoot && !hasValidChildren) {
        const noDataMsg = document.createElement('div');
        noDataMsg.className = 'px-4 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg shadow-lg text-slate-500 dark:text-slate-400 text-sm flex items-center gap-2 z-10';
        
        if (treeMode === 'recipe') {
            noDataMsg.innerHTML = '<i class="fa-solid fa-hammer text-slate-400 dark:text-slate-500"></i> Not craftable (Base Item)';
            noDataMsg.classList.add('mt-5');
            node.appendChild(noDataMsg); 
        } else {
            noDataMsg.innerHTML = '<i class="fa-solid fa-leaf text-slate-400 dark:text-slate-500"></i> Not used in any recipes (End Item)';
            noDataMsg.classList.add('mb-5');
            node.appendChild(noDataMsg); 
        }
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
        for (const btn of dom.treeContainer.querySelectorAll('.expand-btn')) {
            const changedState = btn.toggle(targetState);
            if (changedState) unstable = true;
        }
        if (unstable) await new Promise(r => setTimeout(r, 10));
        d++;
    }
    
    syncExpandAllButton();
    setTimeout(() => resetView(false), 100);
};

function showTooltip(e, data) {
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
    
    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    if (data.url || data.specific_type) {
        if (isTouch) {
            dom.tooltip.wikiDesktop.classList.add('hidden');
            dom.tooltip.wikiMobile.classList.remove('hidden');
            
            dom.tooltip.btnWiki.classList.toggle('hidden', !data.url);
            dom.tooltip.btnCategory.classList.toggle('hidden', !data.specific_type);
            
            dom.tooltip.btnWiki.onclick = (ev) => { 
                ev.stopPropagation(); 
                activeMobileCard = null; dom.tooltip.el.classList.add('hidden'); 
                window.open(data.url, '_blank'); 
            };
            dom.tooltip.btnCategory.onclick = (ev) => { 
                ev.stopPropagation(); 
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
    
    dom.tooltip.el.classList.remove('hidden');
    
    if (isTouch) {
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