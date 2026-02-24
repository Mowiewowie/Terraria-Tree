// --- Function: Search bars, Tooltips bindings, and Toolbar interactions ---

// --- Intelligent Search & UI Events ---

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
    if (currentViewType === 'tree' && currentTreeItemId) {
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

dom.resetViewBtn.onclick = () => resetView();

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
            inputEl.blur(); // Instantly dismiss mobile keyboard
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
                    inputEl.blur(); // Dismiss mobile keyboard on tap
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

// Tooltips
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
            if (k === 'knockback') displayValue = `${v} (${getFriendlyKnockback(v)})`;
            else if (k === 'usetime') displayValue = `${v} (${getFriendlyUseTime(v)})`;
            
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