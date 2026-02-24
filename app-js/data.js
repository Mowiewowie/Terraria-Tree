// --- Function: Handles local file dropping, fetching terraria_items_final.json, and structuring indices ---

// --- Data Fetching & Initialization Engine ---

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

    dom.dbStatus.innerText = "Initializing... Please Wait...";

    try {
        const res = await fetch(JSON_FILENAME);
        if (!res.ok) throw new Error("Fetch failed");
        initializeData(await res.json());
    } catch (e) {
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