// --- Function: Handles local file dropping, fetching terraria_items.json, and structuring indices ---

// --- Data Fetching & Initialization Engine ---

let currentEngineVersion = '1.4.4';
let currentStatusText = "";
const LOADED_MODS = new Set(['Vanilla']);

dom.fileInput.addEventListener('change', (e) => processFile(e.target.files[0]));
document.body.addEventListener('dragover', e => e.preventDefault());
document.body.addEventListener('drop', e => { e.preventDefault(); if(e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]); });

function processFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => initializeData(convertArrayToDict(JSON.parse(e.target.result)));
    reader.readAsText(file);
}

function convertArrayToDict(data) {
    const db = {};
    
    const items = Array.isArray(data) ? data : Object.values(data);

    items.forEach(item => { 
        const isLegacySchema = item.ID === undefined && item.id !== undefined;
        if (isLegacySchema) {
            db[item.id] = {
                ID: item.id.toString(),
                InternalName: item.name.replace(/\s+/g, ''),
                DisplayName: item.name,
                ModSource: "Vanilla",
                Category: item.specific_type || "Unknown",
                Tooltip: item.description !== "N/A" ? item.description : "",
                WikiUrl: item.url || `https://terraria.wiki.gg/wiki/${item.name.replace(/\s+/g, '_')}`,
                IconUrl: item.image_url || "",
                IsHardmode: item.hardmode || false,
                Stats: {
                    Damage: item.stats?.damage || -1,
                    DamageClass: item.damage_class || "Unknown",
                    Knockback: item.stats?.knockback || 0.0,
                    CritChance: 0,
                    UseTime: item.stats?.usetime || 100,
                    Velocity: item.stats?.velocity || 0.0,
                    Defense: item.stats?.defense || 0,
                    Value: item.stats?.sell ? { Raw: item.stats.sell } : null,
                    Rarity: item.stats?.rarity || 0
                },
                Recipes: (item.crafting?.recipes || []).map(r => ({
                    Stations: r.station ? [r.station] : [],
                    Conditions: [],
                    Ingredients: (r.ingredients || []).map(ing => ({
                        ID: ing.id !== undefined ? ing.id.toString() : undefined, 
                        Name: ing.name,
                        Amount: ing.amount
                    })),
                    IsTransmutation: r.transmutation || false
                })),
                ObtainedFromDrops: (item.acquisition || []).map(acq => ({
                    SourceNPC_Name: acq.source,
                    DropChance: acq.rate,
                    Conditions: []
                })),
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
        if (targetVersion === '1.4.5') {
            const res = await fetch(`terraria_items.json`);
            if (!res.ok) throw new Error("terraria_items.json not found.");
            const contentType = res.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") === -1) {
                throw new Error("terraria_items.json returned non-JSON content.");
            }
            const rawData = await res.json();
            initializeData(convertArrayToDict(rawData));
            LOADED_MODS.add('Vanilla');
            console.log(`[Engine] Success: Legacy Schema loaded for v1.4.5`);
        } else {
            // Determine which mods are selected
            const modCalamity = document.getElementById('modCalamity')?.checked;
            const modFargos = document.getElementById('modFargos')?.checked;
            
            let envName = "Vanilla";
            if (modCalamity && modFargos) envName = "All";
            else if (modCalamity) envName = "Vanilla_Calamity";
            else if (modFargos) envName = "Vanilla_Fargowiltas";

            const fileName = `Terraria_${envName}_1.4.4_Export.json`;
            const res = await fetch(fileName);
            if (!res.ok) throw new Error(`${fileName} not found.`);
            const contentType = res.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") === -1) {
                throw new Error(`${fileName} returned non-JSON content.`);
            }
            const rawArray = await res.json();
            initializeData(convertArrayToDict(rawArray));
            LOADED_MODS.add('Vanilla');
            if (modCalamity) LOADED_MODS.add('CalamityMod');
            if (modFargos) LOADED_MODS.add('FargowiltasSouls');
            console.log(`[Engine] Success: Pristine C# Schema loaded for v1.4.4 (${envName})`);
        }
    } catch (e) {
        console.warn("Auto-load failed, falling back to manual upload:", e.message);
        dom.uploadSection.classList.remove('hidden');
        dom.autoLoadStatus.classList.add('hidden');
        dom.manualUpload.classList.remove('hidden');
        if (manualUploadText) manualUploadText.innerText = "Auto-load failed. Please drop your JSON database here.";
        dom.dbStatus.innerHTML = `Loading failed. <button onclick="document.getElementById('fileInput').click()" class="text-blue-500 hover:text-blue-600 underline ml-1 pointer-events-auto">Upload Data</button>`;
    }
}

function buildUsageIndex() {
    usageIndex = {};
    Object.values(itemsDatabase).forEach(item => {
        if (item.Recipes && item.Recipes.length > 0) {
            item.Recipes.forEach(recipe => {
                if(recipe.Ingredients) {
                    recipe.Ingredients.forEach(ing => {
                        const ingName = ing.Name || ing.name;
                        const ingAmount = ing.Amount || ing.amount;
                        const addUsage = (targetName, groupName) => {
                            if (!targetName) return;
                            const key = targetName.toLowerCase();
                            if (!usageIndex[key]) usageIndex[key] = [];
                            usageIndex[key].push({ id: item.ID, amount: ingAmount, recipe: recipe, viaGroup: groupName });
                        };
                        addUsage(ingName, null);
                        if (typeof RECIPE_GROUPS !== 'undefined' && RECIPE_GROUPS[ingName]) {
                            RECIPE_GROUPS[ingName].forEach(groupItem => addUsage(groupItem, ingName));
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
        id: i.ID || i.id, 
        name: i.DisplayName || i.name || "Unknown", 
        type: (i.Category || i.specific_type || i.ModSource || "").toLowerCase(),
        icon_url: i.IconUrl || i.image_url || "",
        fallback_image: i.WikiUrl || i.url || "" // Fallback mapping based on the new schema
    }));
    
    buildUsageIndex(); 

    dom.uploadSection.classList.add('hidden');
    dom.searchInput.disabled = false;
    
    // Format the loaded mods into a clean display string
    const modNames = Array.from(LOADED_MODS).map(m => {
        if (m === 'CalamityMod') return 'Calamity';
        if (m === 'FargowiltasSouls') return "Fargo's";
        return m;
    }).join(', ');
    
    // Stitch the version, mods, and item count together
    const itemCount = Object.keys(itemsDatabase).length.toLocaleString();
    dom.dbStatus.innerText = `v${currentEngineVersion} (${modNames}) • ${itemCount} Items`;
    
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
