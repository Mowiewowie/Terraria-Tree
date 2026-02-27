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
                img.onerror = () => { img.src = FALLBACK_ICON; };
                img.src = m.item.icon_url || createDirectImageUrl(m.item.name);
                img.alt = `${m.item.name} Terraria Icon`; // SEO Addition
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
    // --- Special Interceptor for Flashing Group Cards ---
    if (data.isGroupData) {
        dom.tooltip.name.className = `terraria-text font-bold text-lg leading-tight text-amber-500`;
        dom.tooltip.name.textContent = data.name;
        
        // Use the standard description styling
        dom.tooltip.desc.textContent = "Accepts ANY of the following items.";
        dom.tooltip.desc.className = "text-sm text-slate-700 dark:text-slate-300 mb-3 block";
        dom.tooltip.desc.classList.remove('hidden');
        
        const primaryItemId = Object.keys(itemsDatabase).find(id => itemsDatabase[id].DisplayName === data.groupItems[0] || itemsDatabase[id].name === data.groupItems[0]);
        dom.tooltip.image.src = (primaryItemId && itemsDatabase[primaryItemId].IconUrl) ? itemsDatabase[primaryItemId].IconUrl : createDirectImageUrl(data.groupItems[0]); 
        dom.tooltip.image.onerror = () => { dom.tooltip.image.src = FALLBACK_ICON; };
        
        // Restore exact DOM consistency for the shortcuts under the title
        if (!isMobileUX()) {
            dom.tooltip.wikiDesktop.classList.remove('hidden');
            Array.from(dom.tooltip.wikiDesktop.children).forEach(c => c.classList.remove('hidden'));
            dom.tooltip.wikiMobile.classList.add('hidden');
        } else {
            dom.tooltip.wikiDesktop.classList.add('hidden');
            dom.tooltip.wikiMobile.classList.remove('hidden');
            dom.tooltip.btnWiki.classList.remove('hidden');
            dom.tooltip.btnCategory.classList.remove('hidden');

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
                
                // Fallback: View the category of the primary default item
                const primaryItemId = Object.keys(itemsDatabase).find(id => itemsDatabase[id].name === data.groupItems[0]);
                if (primaryItemId && itemsDatabase[primaryItemId].specific_type) {
                    viewCategory(itemsDatabase[primaryItemId].specific_type);
                }
            };
        }

        // Build the Alternative Items grid with a clear label so it doesn't look like "Also Requires"
        dom.tooltip.stats.innerHTML = '<div class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 mt-2">Valid Alternatives:</div>';
        const gridWrap = document.createElement('div');
        gridWrap.className = 'flex flex-wrap gap-1';
        data.groupItems.forEach(itemName => {
            const itemId = Object.keys(itemsDatabase).find(id => itemsDatabase[id].DisplayName === itemName || itemsDatabase[id].name === itemName);
            const img = document.createElement('img');
            img.src = (itemId && itemsDatabase[itemId].IconUrl) ? itemsDatabase[itemId].IconUrl : createDirectImageUrl(itemName);
            img.className = 'w-8 h-8 object-contain rounded bg-slate-100 dark:bg-slate-800 p-1 border border-slate-300 dark:border-slate-600 shadow-sm';
            img.title = itemName;
            img.onerror = () => { img.src = FALLBACK_ICON; };
            gridWrap.appendChild(img);
        });
        dom.tooltip.stats.appendChild(gridWrap);

        dom.tooltip.station.classList.add('hidden');
        dom.tooltip.acq.classList.add('hidden');
        
        // Explicitly hide the "Also Requires" container
        dom.tooltip.extraIngContainer.classList.add('hidden');

        dom.tooltip.el.classList.remove('hidden');
        if (isMobileUX()) moveTooltip({ clientX: (e.touches ? e.touches[0] : e).clientX, clientY: (e.touches ? e.touches[0] : e).clientY });
        else moveTooltip(e.clientX !== undefined ? e : { clientX: e.x, clientY: e.y });
        return;
    }
    // --- End Interceptor ---

    const rarityVal = data.Stats?.Rarity !== undefined ? data.Stats.Rarity : 0;
    dom.tooltip.name.className = `terraria-text font-bold text-lg leading-tight rarity-${rarityVal}`;
    dom.tooltip.name.textContent = data.DisplayName || data.name;
    
    dom.tooltip.desc.className = "text-sm text-slate-700 dark:text-slate-300 mb-3 block";
    
    if (!data.Category || data.Category.trim() === "") {
        dom.tooltip.desc.classList.add('hidden');
    } else {
        dom.tooltip.desc.textContent = `Type: ${data.Category}`;
        dom.tooltip.desc.classList.remove('hidden');
    }
    
    dom.tooltip.image.src = data.IconUrl || createDirectImageUrl(data.DisplayName || data.name);
    dom.tooltip.image.onerror = () => { dom.tooltip.image.src = FALLBACK_ICON; };
    
    const usingMobileUX = isMobileUX();

    if (data.WikiUrl || data.Category) {
        if (usingMobileUX) {
            dom.tooltip.wikiDesktop.classList.add('hidden');
            dom.tooltip.wikiMobile.classList.remove('hidden');
            
            dom.tooltip.btnWiki.classList.toggle('hidden', !data.WikiUrl);
            dom.tooltip.btnCategory.classList.toggle('hidden', !data.Category);
            
            dom.tooltip.btnWiki.onclick = (ev) => { 
                ev.stopPropagation(); 
                if (activeMobileCard) activeMobileCard.classList.remove('mobile-active');
                activeMobileCard = null; dom.tooltip.el.classList.add('hidden'); 
                window.open(data.WikiUrl, '_blank'); 
            };
            dom.tooltip.btnCategory.onclick = (ev) => { 
                ev.stopPropagation(); 
                if (activeMobileCard) activeMobileCard.classList.remove('mobile-active');
                activeMobileCard = null; dom.tooltip.el.classList.add('hidden'); 
                viewCategory(data.Category); 
            };
        } else {
            dom.tooltip.wikiMobile.classList.add('hidden');
            dom.tooltip.wikiDesktop.classList.remove('hidden');
            dom.tooltip.wikiDesktop.children[0].classList.toggle('hidden', !data.WikiUrl);
            dom.tooltip.wikiDesktop.children[1].classList.toggle('hidden', !data.Category);
        }
    } else {
        dom.tooltip.wikiDesktop.classList.add('hidden');
        dom.tooltip.wikiMobile.classList.add('hidden');
    }
    
    dom.tooltip.stats.innerHTML = '';
    if (data.Stats) {
        Object.entries(data.Stats).forEach(([k, v]) => {
            if (k === 'Rarity' || k === 'MaxStack' || k === 'ToolPower' || k === 'Value' || k === 'IsHardmode' || v === -1 || v === null || v === "") return; 
            
            const statDiv = document.createElement('div');
            const keySpan = document.createElement('span');
            keySpan.className = 'text-slate-500 capitalize';
            
            let label = k.replace(/([A-Z])/g, ' $1').trim();
            keySpan.textContent = label + ': ';
            
            const valSpan = document.createElement('span');
            valSpan.className = 'text-slate-900 dark:text-white font-medium';
            
            let displayValue = v;
            if (k === 'Knockback') displayValue = `${v} (${getFriendlyKnockback(v)})`;
            else if (k === 'UseTime') displayValue = `${v} (${getFriendlyUseTime(v)})`;
            
            valSpan.textContent = displayValue;
            statDiv.append(keySpan, valSpan);
            dom.tooltip.stats.appendChild(statDiv);
        });
    }
    
    const validRecipes = data.Recipes?.filter(r => showTransmutations || !r.IsTransmutation) || [];
    if (validRecipes.length > 0) {
        const rIndex = selectedRecipeIndices[data.ID || data.id] || 0;
        const r = validRecipes[Math.min(rIndex, validRecipes.length - 1)];
        const stationText = r.Stations && r.Stations.length > 0 ? r.Stations.join(', ') : 'By Hand';
        dom.tooltip.stationText.textContent = `Crafted at: ${stationText}`;
        dom.tooltip.station.classList.remove('hidden');
    } else {
        dom.tooltip.station.classList.add('hidden');
    }

    if (data.ObtainedFromDrops && data.ObtainedFromDrops.length > 0) {
        dom.tooltip.acqList.innerHTML = '';
        const sources = data.ObtainedFromDrops.slice(0, 3);
        sources.forEach(src => {
            const li = document.createElement('li');
            const srcSpan = document.createElement('span');
            srcSpan.className = 'text-slate-700 dark:text-slate-300';
            srcSpan.textContent = (src.SourceNPC_Name || src.source) + ' ';
            const rateSpan = document.createElement('span');
            rateSpan.className = 'text-emerald-600 dark:text-emerald-500 text-xs';
            rateSpan.textContent = `(${src.DropChance || src.rate})`;
            li.append(srcSpan, rateSpan);
            dom.tooltip.acqList.appendChild(li);
        });
        if (data.ObtainedFromDrops.length > 3) {
            const li = document.createElement('li');
            li.className = "text-xs text-slate-500 italic mt-1";
            li.textContent = `+${data.ObtainedFromDrops.length - 3} more...`;
            dom.tooltip.acqList.appendChild(li);
        }
        dom.tooltip.acq.classList.remove('hidden');
    } else {
        dom.tooltip.acq.classList.add('hidden');
    }

    if ((treeMode === 'usage' || treeMode === 'discover') && extraRecipe && (currentTreeItemId || discoverBoxItems.length > 0)) {
        const contextualRootNames = treeMode === 'discover' 
            ? discoverBoxItems.map(id => (itemsDatabase[id].DisplayName || itemsDatabase[id].name).toLowerCase()) 
            : [(itemsDatabase[currentTreeItemId].DisplayName || itemsDatabase[currentTreeItemId].name).toLowerCase()];
        
        const extraIngs = (extraRecipe.Ingredients || extraRecipe.ingredients || []).filter(ing => {
            const ingName = ing.Name || ing.name;
            const ingLower = ingName.toLowerCase();
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
                const ingName = ing.Name || ing.name;
                const ingAmount = ing.Amount || ing.amount;
                const img = document.createElement('img');
                img.onerror = () => { img.src = FALLBACK_ICON; };
                const ingId = ing.ID || Object.keys(itemsDatabase).find(id => itemsDatabase[id].DisplayName === ingName || itemsDatabase[id].name === ingName);
                img.src = (ingId && itemsDatabase[ingId].IconUrl) ? itemsDatabase[ingId].IconUrl : createDirectImageUrl(ingName);
                img.className = 'w-6 h-6 object-contain rounded bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-300 dark:border-slate-600 shadow-sm';
                img.title = `${ingName} (x${ingAmount})`;
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
