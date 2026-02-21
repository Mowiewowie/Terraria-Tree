// --- State Variables & Dependencies ---
let itemsDatabase = {}, itemIndex = [];
let usageIndex = {}; 

let currentX = 0, currentY = 0, currentScale = 1;
let targetX = 0, targetY = 0, targetScale = 1;   
let isAnimating = false;

let isPanning = false, startX = 0, startY = 0;
let showTransmutations = false;
let treeMode = 'recipe'; // 'recipe' or 'usage'
let currentTreeItemId = null;
let expandedNodes = new Set(); 
let isExpandedAll = false;

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
    controls: document.getElementById('controls'),
    expandAllBtn: document.getElementById('expandAllBtn'),
    resetViewBtn: document.getElementById('resetViewBtn'),
    transmuteCheck: document.getElementById('showTransmutations'),
    dbStatus: document.getElementById('dbStatus'),
    tooltip: {
        el: document.getElementById('globalTooltip'),
        name: document.getElementById('ttName'),
        image: document.getElementById('ttImage'),
        desc: document.getElementById('ttDesc'),
        stats: document.getElementById('ttStats'),
        station: document.getElementById('ttStation'),
        stationText: document.getElementById('ttStationText'),
        wiki: document.getElementById('ttWiki'),
        acq: document.getElementById('ttAcquisition'),
        acqList: document.getElementById('ttAcquisitionList')
    }
};

// --- Physics Engine ---
function renderLoop() {
    const factor = 0.15;
    currentX += (targetX - currentX) * factor;
    currentY += (targetY - currentY) * factor;
    currentScale += (targetScale - currentScale) * factor;

    dom.treeContainer.style.transform = `translate(${currentX}px, ${currentY}px) scale(${currentScale})`;

    const diff = Math.abs(targetX - currentX) + Math.abs(targetY - currentY) + Math.abs(targetScale - currentScale);
    if (diff < 0.001 && !isPanning) {
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
                        usageIndex[key].push({
                            id: item.id,
                            amount: ing.amount,
                            recipe: recipe,
                            viaGroup: groupName
                        });
                    };

                    addUsage(ing.name, null);

                    if (RECIPE_GROUPS[ing.name]) {
                        RECIPE_GROUPS[ing.name].forEach(groupItem => {
                            addUsage(groupItem, ing.name);
                        });
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
    dom.dbStatus.classList.add('text-green-400');
    dom.dbStatus.classList.remove('text-red-400');
    dom.searchInput.focus();
}

// --- User Interface Events ---
dom.transmuteCheck.addEventListener('change', (e) => {
    showTransmutations = e.target.checked;
    if (currentTreeItemId) loadTree(currentTreeItemId, false); 
});

document.querySelectorAll('input[name="treeMode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        treeMode = e.target.value;
        if (treeMode === 'usage') {
            dom.treeContainer.classList.add('mode-usage');
        } else {
            dom.treeContainer.classList.remove('mode-usage');
        }
        if (currentTreeItemId) loadTree(currentTreeItemId, false);
    });
});

document.addEventListener('click', (e) => {
    if (!dom.searchInput.contains(e.target) && !dom.searchResults.contains(e.target)) {
        dom.searchResults.classList.add('hidden');
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
            d.className = 'flex items-center gap-3 p-2 hover:bg-slate-700 cursor-pointer border-b border-slate-700 text-sm';
            d.innerHTML = `<img src="${createDirectImageUrl(i.name)}" class="w-6 h-6 object-contain"><span class="text-slate-200 font-medium">${i.name}</span>`;
            d.onclick = () => loadTree(i.id); 
            dom.searchResults.appendChild(d);
        });
    } else dom.searchResults.classList.add('hidden');
});

// --- Viewport Controls ---
dom.resetViewBtn.onclick = () => resetView(false);

dom.vizArea.addEventListener('wheel', e => { 
    e.preventDefault(); 
    const rect = dom.vizArea.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const localX = (mouseX - targetX) / targetScale;
    const localY = (mouseY - targetY) / targetScale;
    const zoomDelta = -e.deltaY * 0.0015; 
    targetScale = Math.min(Math.max(0.1, targetScale + zoomDelta), 4);
    targetX = mouseX - localX * targetScale;
    targetY = mouseY - localY * targetScale;
    triggerAnimation();
});

dom.vizArea.addEventListener('mousedown', e => { 
    isPanning = true; startX = e.clientX - targetX; startY = e.clientY - targetY; dom.vizArea.classList.add('grabbing'); 
});

window.addEventListener('mouseup', () => { isPanning = false; dom.vizArea.classList.remove('grabbing'); });

window.addEventListener('mousemove', e => { 
    if(isPanning) { e.preventDefault(); targetX = e.clientX - startX; targetY = e.clientY - startY; triggerAnimation(); }
});

// --- Tree Generation Logic ---
function loadTree(id, preserveState = false) {
    currentTreeItemId = id;
    dom.searchInput.value = '';
    dom.searchResults.classList.add('hidden');
    dom.vizArea.classList.remove('hidden');
    dom.controls.classList.remove('hidden');
    dom.treeContainer.innerHTML = '';
    
    let isFirstLoad = false;

    if (!preserveState) {
        expandedNodes.clear();
        isExpandedAll = false;
        dom.expandAllBtn.innerHTML = '<i class="fa-solid fa-layer-group"></i> Expand All';
        isFirstLoad = true;
    }
    dom.treeContainer.appendChild(createTreeNode(id, true));
    
    if (!preserveState) {
        setTimeout(() => resetView(isFirstLoad), 50);
    }
}

function resetView(isInitialLoad = false) { 
    if (!currentTreeItemId) return;
    const vizRect = dom.vizArea.getBoundingClientRect();
    const treeWidth = dom.treeContainer.scrollWidth;
    const treeHeight = dom.treeContainer.scrollHeight;
    const paddingX = 80; const paddingY = 80;
    const scaleX = (vizRect.width - paddingX) / treeWidth;
    const scaleY = (vizRect.height - paddingY) / treeHeight;
    
    targetScale = Math.min(scaleX, scaleY, 1.1);
    targetX = (vizRect.width - (treeWidth * targetScale)) / 2;
    targetY = Math.max(40, (vizRect.height - (treeHeight * targetScale)) / 2);
    
    if (isInitialLoad) {
        currentX = targetX; currentY = targetY; currentScale = targetScale;
        dom.treeContainer.style.transform = `translate(${currentX}px, ${currentY}px) scale(${currentScale})`;
    } else {
        triggerAnimation();
    }
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
    
    const card = document.createElement('div');
    const rootBorder = treeMode === 'recipe' ? 'border-blue-500 ring-blue-500/20' : 'border-purple-500 ring-purple-500/20';
    card.className = `item-card relative flex flex-col items-center justify-center rounded-lg z-10 ${isRoot ? `w-32 h-32 ring-4 ${rootBorder}` : 'w-24 h-24'}`;
    
    const img = document.createElement('img');
    img.src = createDirectImageUrl(data.name);
    img.className = isRoot ? 'w-14 h-14 object-contain mb-2' : 'w-10 h-10 object-contain mb-1';
    img.onerror = () => { if(img.src !== data.image_url) img.src = data.image_url; else img.src = FALLBACK_ICON; };
    
    const name = document.createElement('span');
    name.textContent = data.name;
    name.className = `text-center font-semibold leading-tight px-2 line-clamp-2 ${isRoot ? 'text-sm' : 'text-xs'}`;
    
    card.append(img, name);
    card.onclick = (e) => { e.stopPropagation(); if(data.url) window.open(data.url, '_blank'); };
    card.onmouseenter = e => showTooltip(e, data);
    card.onmouseleave = () => dom.tooltip.el.classList.add('hidden');
    card.onmousemove = moveTooltip;
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
        const btnHover = treeMode === 'recipe' ? 'hover:bg-blue-600' : 'hover:bg-purple-600';
        
        btn.className = `expand-btn mt-2 mb-2 w-6 h-6 rounded-full bg-slate-700 ${btnHover} text-white text-xs flex items-center justify-center transition-colors shadow-lg z-20`;
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
                
                const newVis = new Set(visited).add(id);
                
                if (treeMode === 'recipe') {
                    childrenData.forEach(ing => {
                        const isGroup = ing.name.toLowerCase().startsWith("any ");
                        if (isGroup) {
                            container.appendChild(createGroupNode(ing.name, ing.amount));
                        } else {
                            const cid = itemIndex.find(i => i.name === ing.name)?.id;
                            let child = cid ? createTreeNode(cid, false, newVis) : createGenericNode(ing.name, ing.amount);
                            if(cid) {
                                const b = document.createElement('span');
                                b.className = 'absolute -top-2 -right-2 bg-slate-900 border border-slate-500 text-slate-300 text-[10px] px-1.5 py-0.5 rounded-full z-20 font-mono';
                                b.textContent = `x${ing.amount}`;
                                child.querySelector('.item-card').appendChild(b);
                            }
                            container.appendChild(child);
                        }
                    });
                } else {
                    childrenData.forEach(usage => {
                        const childNode = createTreeNode(usage.id, false, newVis);
                        const b = document.createElement('span');
                        b.className = 'absolute -top-2 -right-2 bg-purple-900 border border-purple-500 text-purple-200 text-[10px] px-1.5 py-0.5 rounded-full z-20 font-mono shadow';
                        b.textContent = usage.viaGroup ? `via ${usage.viaGroup}` : `Req: ${usage.amount}`;
                        childNode.querySelector('.item-card').appendChild(b);
                        container.appendChild(childNode);
                    });
                }
            }
            return true; 
        };
        
        btn.onclick = e => { e.stopPropagation(); btn.toggle(); };
        node.append(btn, container);
        
        if(isRoot || expandedNodes.has(id)) btn.toggle('open');
    }

    if (isRoot && !hasValidChildren) {
        const noDataMsg = document.createElement('div');
        noDataMsg.className = 'px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg shadow-lg text-slate-400 text-sm flex items-center gap-2 z-10';
        
        if (treeMode === 'recipe') {
            noDataMsg.innerHTML = '<i class="fa-solid fa-hammer text-slate-500"></i> Not craftable (Base Item)';
            noDataMsg.classList.add('mt-5');
            node.appendChild(noDataMsg); 
        } else {
            noDataMsg.innerHTML = '<i class="fa-solid fa-leaf text-slate-500"></i> Not used in any recipes (End Item)';
            noDataMsg.classList.add('mb-5');
            node.insertBefore(noDataMsg, node.firstChild); 
        }
    }

    return node;
}

function createGroupNode(ingName, amount) {
    const container = document.createElement('div');
    container.className = 'tree-node';

    const box = document.createElement('div');
    box.className = 'relative flex flex-col items-center justify-center p-3 rounded-xl bg-slate-800/40 border border-dashed border-slate-500 shadow-inner z-10';

    const label = document.createElement('div');
    label.className = 'text-xs text-slate-400 font-bold uppercase tracking-wider mb-2';
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
        const miniCard = document.createElement('div');
        miniCard.className = 'item-card flex flex-col items-center justify-center w-16 h-16 rounded bg-slate-800 border border-slate-600';
        
        const img = document.createElement('img');
        img.src = createDirectImageUrl(altName);
        img.className = 'w-6 h-6 object-contain mb-1';
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = altName;
        nameSpan.className = 'text-[10px] text-center leading-tight px-1 line-clamp-2';
        
        miniCard.append(img, nameSpan);
        
        if (altId) {
            const data = itemsDatabase[altId];
            miniCard.onclick = (e) => { e.stopPropagation(); if(data.url) window.open(data.url, '_blank'); };
            miniCard.onmouseenter = e => showTooltip(e, data);
            miniCard.onmouseleave = () => dom.tooltip.el.classList.add('hidden');
            miniCard.onmousemove = moveTooltip;
        }
        itemsRow.appendChild(miniCard);
    });

    if (remaining > 0) {
        const moreNode = document.createElement('div');
        moreNode.className = 'flex items-center justify-center w-16 h-16 rounded bg-slate-800/50 border border-dashed border-slate-600 text-slate-500 text-xs font-bold';
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
    d.innerHTML = `<div class="item-card relative flex flex-col items-center justify-center w-24 h-24 rounded-lg bg-slate-800/50 border border-dashed border-slate-600"><i class="fa-solid fa-layer-group text-slate-500 text-2xl mb-1"></i><span class="text-xs text-center text-slate-400 font-medium px-2 sanitize-target"></span><span class="absolute -top-2 -right-2 bg-slate-800 border border-slate-600 text-slate-400 text-[10px] px-1.5 py-0.5 rounded-full">x${amount}</span></div>`;
    d.querySelector('.sanitize-target').appendChild(amountText);
    return d;
}

dom.expandAllBtn.onclick = async () => {
    isExpandedAll = !isExpandedAll;
    const targetState = isExpandedAll ? 'open' : 'close';
    dom.expandAllBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
    
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
    
    dom.expandAllBtn.innerHTML = isExpandedAll ? '<i class="fa-solid fa-compress"></i> Collapse All' : '<i class="fa-solid fa-layer-group"></i> Expand All';
    setTimeout(() => resetView(false), 100);
};

function showTooltip(e, data) {
    dom.tooltip.name.textContent = data.name;
    dom.tooltip.desc.textContent = data.description || "No description.";
    dom.tooltip.image.src = createDirectImageUrl(data.name);
    dom.tooltip.image.onerror = () => { if(dom.tooltip.image.src !== data.image_url) dom.tooltip.image.src = data.image_url; else dom.tooltip.image.src = FALLBACK_ICON; };
    dom.tooltip.wiki.href = data.url;
    
    dom.tooltip.stats.innerHTML = '';
    if (data.stats) {
        Object.entries(data.stats).forEach(([k, v]) => {
            const statDiv = document.createElement('div');
            const keySpan = document.createElement('span');
            keySpan.className = 'text-slate-500 capitalize';
            keySpan.textContent = k + ': ';
            const valSpan = document.createElement('span');
            valSpan.className = 'text-white';
            valSpan.textContent = v;
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
            srcSpan.className = 'text-slate-300';
            srcSpan.textContent = src.source + ' ';
            const rateSpan = document.createElement('span');
            rateSpan.className = 'text-emerald-500 text-xs';
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
    moveTooltip(e);
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