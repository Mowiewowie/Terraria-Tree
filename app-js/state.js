// --- Function: Holds all global variables, constants, DOM hooks, and universal math/string utilities ---

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

// History Engine Variables
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

// --- Universal Utilities ---
function isMobileUX() {
    return window.matchMedia("(any-pointer: coarse) and (hover: none)").matches;
}

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

function createDirectImageUrl(name) {
    if (!name) return FALLBACK_ICON;
    const f = name.replace(/ /g, '_') + '.png';
    const h = md5(f);
    return `https://terraria.wiki.gg/images/${h[0]}/${h.substring(0, 2)}/${f}`;
}