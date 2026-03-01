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
    currentEngineVersion = targetVersion;
    
    // Force UI dropdown to match the target version (defeats browser form state restoration on refresh)
    const selectEl = document.getElementById('engineVersionSelect');
    if (selectEl) selectEl.value = targetVersion;
    
    dom.dbStatus.innerText = `Loading v${targetVersion}...`;

    // Determine requested environment from checkboxes
    const modCalamity = document.getElementById('modCalamity')?.checked;
    const modFargos = document.getElementById('modFargos')?.checked;
    
    let envName = "Vanilla";
    if (modCalamity && modFargos) envName = "All"; 
    else if (modCalamity) envName = "Vanilla_Calamity";
    else if (modFargos) envName = "Vanilla_Fargowiltas";

    let loadedEnv = envName; 
    let usedLegacy = false;

    try {
        // --- PHASE 1: Try the exact requested environment ---
        let res = await fetch(`Terraria_${envName}_${targetVersion}_Export.json`);
        
        // --- PHASE 2: Fallback to Modern Vanilla ---
        if (!res.ok && envName !== "Vanilla") {
            console.warn(`[Engine] ${envName} not found. Gracefully falling back to Modern Vanilla...`);
            res = await fetch(`Terraria_Vanilla_${targetVersion}_Export.json`);
            if (res.ok) {
                loadedEnv = "Vanilla";
                // Silently uncheck the mods in the UI since we fell back to Vanilla
                if (document.getElementById('modCalamity')) document.getElementById('modCalamity').checked = false;
                if (document.getElementById('modFargos')) document.getElementById('modFargos').checked = false;
            }
        }

        // --- PHASE 3: Fallback to Legacy Python Data ---
        if (!res.ok) {
            if (targetVersion === '1.4.5') {
                console.warn(`[Engine] Modern exports not found. Falling back to Legacy Python...`);
                res = await fetch('terraria_items.json');
                if (!res.ok) throw new Error("No data files found for this version.");
                loadedEnv = "Vanilla";
                usedLegacy = true;
                if (document.getElementById('modCalamity')) document.getElementById('modCalamity').checked = false;
                if (document.getElementById('modFargos')) document.getElementById('modFargos').checked = false;
            } else {
                throw new Error(`Data for ${targetVersion} not found.`);
            }
        }

        // --- LOAD DATA ---
        const rawArray = await res.json();
        initializeData(convertArrayToDict(rawArray));
        
        // --- DYNAMIC UI STATE MANAGEMENT ---
        if (selectEl) {
            const optCurrent = Array.from(selectEl.options).find(o => o.value === targetVersion);
            // Dynamically add/remove the "(Vanilla Only)" tag depending on what actually loaded
            if (optCurrent) {
                optCurrent.text = usedLegacy ? `${targetVersion} (Vanilla Only)` : targetVersion;
            }
            
            const modsContainer = document.getElementById('modsContainer');
            if (modsContainer) {
                // Lock the mod options ONLY if we crashed all the way down to the Python legacy file
                if (usedLegacy) {
                    modsContainer.classList.add('opacity-50', 'pointer-events-none');
                } else {
                    modsContainer.classList.remove('opacity-50', 'pointer-events-none');
                }
            }
        }

        // --- INJECT STATUS BAR TEXT ---
        let displayModsDesktop = "Vanilla";
        let displayModsMobile = "V";
        
        if (loadedEnv === "Vanilla_Calamity") {
            displayModsDesktop = "Vanilla, Calamity";
            displayModsMobile = "V, C";
        } else if (loadedEnv === "Vanilla_Fargowiltas") {
            displayModsDesktop = "Vanilla, Fargo's";
            displayModsMobile = "V, F";
        } else if (loadedEnv === "All" || loadedEnv === "Vanilla_All") {
            displayModsDesktop = "Vanilla, Calamity, Fargo's";
            displayModsMobile = "V, C, F";
        }

        const itemCount = Object.keys(itemsDatabase).length.toLocaleString();
        dom.dbStatus.innerHTML = `
            <span class="hidden lg:inline">v${currentEngineVersion} (${displayModsDesktop})</span>
            <span class="lg:hidden">v${currentEngineVersion} (${displayModsMobile})</span>
            <span class="hidden sm:inline"><span class="opacity-50 mx-1.5">•</span>${itemCount} Items</span>
        `;
        dom.dbStatus.classList.add('text-green-500');
        dom.dbStatus.classList.remove('text-slate-500');

    } catch (e) {
        console.warn("Auto-load failed:", e.message);
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
    // Note: dom.dbStatus text formatting is now handled directly by loadVersionData()
    dom.searchInput.focus();
    
    // Format the loaded mods into a clean display string
    const displayModsDesktop = Array.from(LOADED_MODS).map(m => {
        if (m === 'CalamityMod') return 'Calamity';
        if (m === 'FargowiltasSouls') return "Fargo's";
        return m;
    }).join(', ');
    
    const displayModsMobile = Array.from(LOADED_MODS).map(m => {
        if (m === 'CalamityMod') return 'C';
        if (m === 'FargowiltasSouls') return "F";
        if (m === 'Vanilla') return "V";
        return m.charAt(0);
    }).join(', ');

    // Stitch the version, mods, and item count together using staggered responsive spans
    const itemCount = Object.keys(itemsDatabase).length.toLocaleString();
    dom.dbStatus.innerHTML = `
        <span class="hidden lg:inline">v${currentEngineVersion} (${displayModsDesktop})</span>
        <span class="lg:hidden">v${currentEngineVersion} (${displayModsMobile})</span>
        <span class="hidden sm:inline"><span class="opacity-50 mx-1.5">•</span>${itemCount} Items</span>
    `;
    
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
