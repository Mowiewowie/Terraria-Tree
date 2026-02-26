// --- Function: Handles local file dropping, fetching terraria_items.json, and structuring indices ---

// --- Data Fetching & Initialization Engine ---

let currentEngineVersion = '1.4.4'; 
const LOADED_MODS = new Set(['Vanilla']);

dom.fileInput.addEventListener('change', (e) => processFile(e.target.files[0]));
document.body.addEventListener('dragover', e => e.preventDefault());
document.body.addEventListener('drop', e => { e.preventDefault(); if(e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]); });

function processFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => initializeData(convertArrayToDict(JSON.parse(e.target.result), false));
    reader.readAsText(file);
}

function convertArrayToDict(arr, isLegacySchema = false) {
    const db = {};
    
    arr.forEach(item => { 
        if (isLegacySchema) {
            // Morph the old Python output into the new C# format
            db[item.id] = {
                ID: item.id.toString(),
                InternalName: item.name.replace(/\s+/g, ''),
                DisplayName: item.name,
                ModSource: "Vanilla",
                Category: item.specific_type || "Unknown",
                WikiUrl: `https://terraria.wiki.gg/wiki/${item.name.replace(/\s+/g, '_')}`,
                Stats: {
                    Damage: item.damage || -1,
                    DamageClass: "Unknown",
                    Knockback: 0.0,
                    CritChance: 0,
                    UseTime: 100,
                    Defense: item.defense || 0,
                    Value: 0,
                    Rarity: 0,
                    IsHardmode: item.hardmode || false
                },
                Recipes: (item.crafting?.recipes || []).map(r => ({
                    Stations: r.stations || [],
                    Conditions: [],
                    Ingredients: r.ingredients.map(ing => ({
                        ID: ing.id ? ing.id.toString() : ing.name, 
                        Name: ing.name,
                        Amount: ing.amount
                    }))
                })),
                ObtainedFromDrops: [],
                ShimmerDecraft: null
            };
        } else {
            db[item.ID] = item; 
        }
    });
    
    return db;
}

window.addEventListener('load', () => loadVersionData('1.4.5'));

async function loadVersionData(targetVersion) {
    const isLocal = window.location.protocol === 'file:';
    const manualUploadText = document.querySelector('#manualUpload p:first-child');

    if (isLocal) {
        dom.uploadSection.classList.remove('hidden');
        dom.autoLoadStatus.classList.add('hidden');
        dom.manualUpload.classList.remove('hidden');
        if (manualUploadText) manualUploadText.innerText = "Local mode detected. Please drop your JSON database here.";
        dom.dbStatus.innerText = "Local Mode";
        return;
    }

    // Reset RAM to prevent cross-contamination
    itemsDatabase = {};
    LOADED_MODS.clear();
    currentEngineVersion = targetVersion;
    dom.dbStatus.innerText = `Loading v${targetVersion}...`;

    try {
        // Attempt to load pristine C# auto-generated file
        const res = await fetch(`Terraria_Vanilla_${targetVersion}_Export.json`);
        if (!res.ok) throw new Error("Pristine schema not found on server.");
        
        const rawArray = await res.json();
        initializeData(convertArrayToDict(rawArray, false));
        LOADED_MODS.add('Vanilla');
        console.log(`[Engine] Success: Pristine C# Schema loaded for v${targetVersion}`);
        
    } catch (e) {
        console.warn(`[Engine] Pristine not available for v${targetVersion}. Falling back to Legacy Schema...`);
        try {
            const fallbackRes = await fetch(`Terraria_Vanilla_${targetVersion}_Legacy.json`);
            if (!fallbackRes.ok) throw new Error("Legacy schema not found.");
            
            const legacyArray = await fallbackRes.json();
            initializeData(convertArrayToDict(legacyArray, true));
            LOADED_MODS.add('Vanilla');
        } catch (fallbackError) {
            console.error("Critical Data Load Failure:", fallbackError);
            dom.uploadSection.classList.remove('hidden');
            dom.autoLoadStatus.classList.add('hidden');
            dom.manualUpload.classList.remove('hidden');
            if (manualUploadText) manualUploadText.innerText = "Auto-load failed. Please drop your JSON database here.";
            dom.dbStatus.innerHTML = `Loading failed. <button onclick="document.getElementById('fileInput').click()" class="text-blue-500 hover:text-blue-600 underline ml-1 pointer-events-auto">Upload Data</button>`;
        }
    }
}

async function loadModData(modName) {
    if (LOADED_MODS.has(modName)) return; 

    dom.dbStatus.innerText = `Loading ${modName}...`;
    dom.dbStatus.classList.replace('text-green-500', 'text-amber-500');

    try {
        const res = await fetch(`Terraria_${modName}_${currentEngineVersion}_Export.json`);
        if (!res.ok) throw new Error(`Failed to fetch ${modName}`);
        
        const modArray = await res.json();
        const modDict = convertArrayToDict(modArray, false);
        
        Object.assign(itemsDatabase, modDict);
        
        itemIndex = Object.values(itemsDatabase).map(i => ({ 
            id: i.ID, 
            name: i.DisplayName, 
            type: (i.ModSource || "Unknown").toLowerCase(),
            fallback_image: createDirectImageUrl(i.DisplayName) 
        }));
        
        buildUsageIndex(); 

        LOADED_MODS.add(modName);
        dom.dbStatus.innerText = `${Object.keys(itemsDatabase).length.toLocaleString()} Items`;
        dom.dbStatus.classList.replace('text-amber-500', 'text-green-500');
        
        console.log(`[Engine] Successfully injected ${modName} into active memory.`);
    } catch (e) {
        console.error(`Failed to load mod: ${modName}`, e);
        dom.dbStatus.innerText = `${modName} Load Failed`;
        dom.dbStatus.classList.replace('text-amber-500', 'text-red-500');
    }
}

function buildUsageIndex() {
    usageIndex = {};
    Object.values(itemsDatabase).forEach(item => {
        // Map over the new schema's "Recipes" array
        if (item.Recipes && item.Recipes.length > 0) {
            item.Recipes.forEach(recipe => {
                if(recipe.Ingredients) {
                    recipe.Ingredients.forEach(ing => {
                        const addUsage = (targetName, groupName) => {
                            if (!targetName) return;
                            const key = targetName.toLowerCase();
                            if (!usageIndex[key]) usageIndex[key] = [];
                            usageIndex[key].push({ id: item.ID, amount: ing.Amount, recipe: recipe, viaGroup: groupName });
                        };
                        addUsage(ing.Name, null);
                        if (typeof RECIPE_GROUPS !== 'undefined' && RECIPE_GROUPS[ing.Name]) {
                            RECIPE_GROUPS[ing.Name].forEach(groupItem => addUsage(groupItem, ing.Name));
                        }
                    });
                }
            });
        }
    });
}

function initializeData(data) {
    itemsDatabase = data;
    itemIndex = Object.values(itemsDatabase).map(i => ({ 
        id: i.ID, 
        name: i.DisplayName, 
        type: (i.Category || i.ModSource || "").toLowerCase(),
        fallback_image: i.WikiUrl || "" // Fallback mapping based on the new schema
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