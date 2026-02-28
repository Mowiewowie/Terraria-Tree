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
let expandedNodes = new Set(JSON.parse(localStorage.getItem('terraria_expandedNodes')) || []); 
let isExpandedAll = false;
let selectedRecipeIndices = {}; // Tracks user-selected alternative recipes

let discoverBoxItems = JSON.parse(localStorage.getItem('terraria_discoverBox')) || []; 

let lineTooltipTimeout = null;
let lastMouseCoords = { x: 0, y: 0 };

// History Engine Variables
let appHistory = [];
let historyIdx = -1;

let initialPinchDist = null;
let initialScale = 1;
let activeMobileCard = null; 

// A completely offline-ready, inline SVG (Sleek Slate-400 Question Mark)
const FALLBACK_ICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'%3E%3C/circle%3E%3Cpath d='M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3'%3E%3C/path%3E%3Cline x1='12' y1='17' x2='12.01' y2='17'%3E%3C/line%3E%3C/svg%3E";
const JSON_FILENAME = 'terraria_items.json';

const RECIPE_GROUPS = {
    "Any Wood": ["Wood", "Boreal Wood", "Rich Mahogany", "Ebonwood", "Shadewood", "Pearlwood", "Spooky Wood", "Dynasty Wood", "Ash Wood"],
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
    "Any Scorpion": ["Scorpion", "Black Scorpion"],
    "Any Squirrel": ["Squirrel", "Red Squirrel", "Gold Squirrel"],
    "Any Bug": ["Grubby", "Sluggy", "Buggy"],
    "Any Jungle Bug": ["Grubby", "Sluggy", "Buggy"],
    "Any Duck": ["Duck", "Mallard Duck"],
    "Any Butterfly": ["Monarch Butterfly", "Sulphur Butterfly", "Zebra Swallowtail Butterfly", "Ulysses Butterfly", "Julia Butterfly", "Red Admiral Butterfly", "Purple Emperor Butterfly", "Tree Nymph Butterfly"],
    "Any Firefly": ["Firefly", "Lightning Bug"],
    "Any Snail": ["Snail", "Glowing Snail", "Magma Snail"],
    "Any Fruit": ["Apple", "Apricot", "Banana", "Blackcurrant", "Blood Orange", "Cherry", "Coconut", "Dragon Fruit", "Elderberry", "Grapefruit", "Lemon", "Mango", "Peach", "Pineapple", "Plum", "Rambutan", "Starfruit", "Spicy Pepper", "Pomegranate"],
    "Any Dragonfly": ["Black Dragonfly", "Blue Dragonfly", "Green Dragonfly", "Orange Dragonfly", "Red Dragonfly", "Yellow Dragonfly"],
    "Any Turtle": ["Turtle", "Jungle Turtle"],
    "Any Macaw": ["Blue Macaw", "Scarlet Macaw"],
    "Any Cockatiel": ["Gray Cockatiel", "Yellow Cockatiel"],
    "Any Balloon": ["Shiny Red Balloon", "Green Balloon", "Pink Balloon"],
    "Any Cloud": ["Cloud", "Rain Cloud", "Snow Cloud"],
    "Any Pressure Plate": ["Red Pressure Plate", "Green Pressure Plate", "Gray Pressure Plate", "Brown Pressure Plate", "Blue Pressure Plate", "Yellow Pressure Plate", "Lihzahrd Pressure Plate"]
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
    if (w < 1024) return 0.35; 
    return 0.30; 
}

const imageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const img = entry.target;
            if (img.dataset.src) {
                img.src = img.dataset.src;
                img.removeAttribute('data-src');
            }
            observer.unobserve(img);
        }
    });
}, {
    rootMargin: '200px' // Load slightly beyond viewport
});

function createDirectImageUrl(name) {
    if (!name) return FALLBACK_ICON;
    // Replace spaces with underscores and point to the local sprites folder
    const f = name.replace(/ /g, '_') + '.png';
    return `/sprites/${f}`;
}
