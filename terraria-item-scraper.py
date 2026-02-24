import json
import requests
import re
import time
import urllib.parse
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

OUTPUT_FILE = "terraria_items.json"
USER_AGENT = "TerrariaJSONBuilder/14.0 (Heuristic Fallback Engine)"

# --- THE ULTIMATE CATEGORY MAP (Layer 1: Category API) ---
CATEGORY_MAP = {
    # ⚔️ Melee Weapons
    "Broadswords": "Sword",
    "Shortswords": "Sword",
    "Yoyos": "Yoyo",
    "Spears": "Spear",
    "Boomerangs": "Boomerang",
    "Flails": "Flail",
    "Whips": "Whip",
    "Other melee weapons": "Melee Weapon",
    
    # 🏹 Ranged Weapons
    "Bows": "Bow",
    "Repeaters": "Repeater",
    "Guns": "Gun",
    "Launchers": "Launcher",
    "Consumable ranged weapons": "Consumable Ranged",
    "Other ranged weapons": "Ranged Weapon",
    
    # 🔮 Magic Weapons
    "Magic weapons": "Magic Weapon",
    "Wands": "Wand",
    "Magic guns": "Magic Gun",
    "Spell tomes": "Spell Tome",
    
    # 👻 Summon Weapons
    "Minion summon items": "Minion Summon",
    "Sentry summon items": "Sentry Summon",
    
    # ⛏️ Tools
    "Pickaxes": "Pickaxe",
    "Axes": "Axe",
    "Hammers": "Hammer",
    "Hamaxes": "Hamaxe",
    "Chainsaws": "Chainsaw",
    "Drills": "Drill",
    "Fishing poles": "Fishing Pole",
    "Grappling hooks": "Grappling Hook",
    "Wiring tools": "Wiring Tool",
    "Painting tools": "Painting Tool",
    
    # 🛡️ Armor & Vanity
    "Head armor": "Head Armor",
    "Body armor": "Body Armor",
    "Leg armor": "Leg Armor",
    "Vanity items": "Vanity",
    "Vanity accessories": "Vanity Accessory",
    
    # 💍 Accessories
    "Accessory items": "Accessory",
    "Wings": "Wings",
    "Shields": "Shield",
    "Boots": "Boots",
    "Informational accessories": "Informational Accessory",
    "Combat accessories": "Combat Accessory",
    "Movement accessories": "Movement Accessory",
    "Health and Mana accessories": "Health/Mana Accessory",
    "Construction accessories": "Construction Accessory",
    "Fishing accessories": "Fishing Accessory",
    "Music Boxes": "Music Box",
    
    # 🧪 Consumables / Materials
    "Potion items": "Potion",
    "Food items": "Food",
    "Ammunition items": "Ammo",
    "Arrows": "Arrow",
    "Bullets": "Bullet",
    "Rockets": "Rocket",
    "Darts": "Dart",
    "Dye items": "Dye",
    "Paints": "Paint",
    "Flasks": "Flask",
    "Hair dyes": "Hair Dye",
    "Material items": "Material",
    "Bait items": "Bait",
    
    # 🐟 Nature & Wildlife
    "Fish": "Fish",
    "Quest fish": "Quest Fish",
    "Critters": "Critter",
    "Seeds": "Seed",
    "Plants": "Plant",
    
    # 💎 Materials & Mining
    "Ores": "Ore",
    "Bars": "Bar",
    "Gems": "Gem",
    
    # 🐶 Summons, Pets & Bags
    "Boss summon items": "Boss Summon",
    "Event summon items": "Event Summon",
    "Pet summon items": "Pet",
    "Light pet summon items": "Light Pet",
    "Mount summon items": "Mount",
    "Minecarts": "Minecart",
    "Treasure Bags": "Treasure Bag",
    "Crates": "Crate",
    "Grab bags": "Grab Bag",
    
    # 🧱 World Building & Furniture
    "Block items": "Block",
    "Wall items": "Wall",
    "Furniture items": "Furniture",
    "Crafting stations": "Crafting Station",
    "Light sources": "Light Source",
    "Doors": "Door",
    "Chairs": "Chair",
    "Tables": "Table",
    "Beds": "Bed",
    "Chests": "Chest",
    "Banners": "Banner",
    "Trophies": "Trophy",
    "Statues": "Statue",
    "Paintings": "Painting",
    "Mechanisms": "Mechanism",
    "Traps": "Trap",
    "Wire items": "Wire",
    
    # 🔑 Misc
    "Keys": "Key",
    "Golf clubs": "Golf Club",
    "Kites": "Kite",
    "Quest items": "Quest Item",
    "Souls": "Soul",
    "Developer items": "Developer Item",
    "Unobtainable items": "Unobtainable"
}

# --- THE HEURISTIC SAFETY NET (Layer 2: Generic Type Inference) ---
# Maps reliable Cargo generic_types to our clean specific_type tags.
GENERIC_FALLBACK_MAP = {
    "Mount summon": "Mount",
    "Pet summon": "Pet",
    "Light pet summon": "Light Pet",
    "Food": "Food",
    "Potion": "Potion",
    "Ammunition": "Ammo",
    "Dye": "Dye",
    "Hook": "Grappling Hook",
    "Minecart": "Minecart",
    "Boss summon": "Boss Summon",
    "Event summon": "Event Summon",
    "Block": "Block",
    "Wall": "Wall",
    "Material": "Material",
    "Accessory": "Accessory",
    "Armor": "Armor",
    "Furniture": "Furniture",
    "Weapon": "Weapon",
    "Tool": "Tool",
    "Key": "Key",
    "Ore": "Ore",
    "Bar": "Bar",
    "Coin": "Coin",
    "Gem": "Gem",
    "Fish": "Fish",
    "Quest Fish": "Quest Fish",
    "Critter": "Critter",
    "Seed": "Seed"
}

# Cache to prevent spamming the Wiki API for the same redirects
ALIAS_CACHE = {}

def resolve_canonical_name(session, name: str) -> str:
    """Queries the Wiki API to resolve redirects (e.g., Fiery Greatsword -> Volcano)"""
    if name in ALIAS_CACHE:
        return ALIAS_CACHE[name]
    
    params = {
        "action": "query",
        "titles": name,
        "redirects": 1,
        "format": "json"
    }
    try:
        # Polite delay to prevent rate-limiting/DDoS blocking
        time.sleep(0.05) 
        resp = session.get("https://terraria.wiki.gg/api.php", params=params, timeout=5).json()
        redirects = resp.get("query", {}).get("redirects", [])
        
        if redirects:
            canonical = redirects[0]["to"]
            ALIAS_CACHE[name] = canonical
            print(f"    [Alias Resolved] {name} -> {canonical}")
            return canonical
        
        ALIAS_CACHE[name] = name
        return name
    except:
        return name

def sanitize_text(text: str) -> str:
    if not text: return ""
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'\[c/[a-fA-F0-9]{6}:(.*?)\]', r'\1', text)
    text = re.sub(r'\[[a-zA-Z]:.*?\]', '', text)
    text = re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]+)\]\]', r'\1', text)
    return re.sub(r'[\r\n\t]+', ' ', text).strip()

def parse_numeric_stat(text: str) -> float | None:
    if not text: return None
    match = re.search(r'-?\d+(?:\.\d+)?', str(text))
    return float(match.group()) if match else None

def parse_ingredients(ings_string: str) -> list:
    ingredients = []
    if not ings_string: return ingredients
    parts = ings_string.split('^')
    for part in parts:
        match = re.search(r'¦(.*?)¦(\d+)', part)
        if match:
            ingredients.append({
                "name": sanitize_text(match.group(1)),
                "amount": int(match.group(2))
            })
    return ingredients

def generate_wiki_url(item_name: str) -> str:
    formatted_name = item_name.replace(" ", "_")
    safe_name = urllib.parse.quote(formatted_name, safe="")
    return f"https://terraria.wiki.gg/wiki/{safe_name}"

def generate_image_url(item_name: str) -> str:
    formatted_name = item_name.replace(" ", "_")
    safe_name = urllib.parse.quote(formatted_name, safe="")
    return f"https://terraria.wiki.gg/wiki/Special:FilePath/{safe_name}.png"

def fetch_data():
    session = requests.Session()
    retries = Retry(total=3, backoff_factor=1, status_forcelist=[429, 500, 502, 503, 504])
    session.mount("https://", HTTPAdapter(max_retries=retries))
    session.headers.update({'User-Agent': USER_AGENT})

    items_db = {}
    name_to_id_map = {} 
    
    # 1. Fetch Core Base Items from Cargo
    print("Step 1/6: Fetching Base Items & Universal Stats...")
    offset = 0
    limit = 500
    safe_fields = "itemid,name,tooltip,damage,knockback,defense,usetime,velocity,rare,hardmode,type,damagetype,buy,sell,axe,hammer"
    
    while True:
        params = {
            "action": "cargoquery", "tables": "Items",
            "fields": safe_fields,
            "limit": limit, "offset": offset, "format": "json"
        }
        try:
            resp = session.get("https://terraria.wiki.gg/api.php", params=params, timeout=10)
            data_json = resp.json()
            
            if "error" in data_json: 
                print(f"\n[!] FATAL API ERROR in Step 1: {data_json['error'].get('info')}")
                break

            results = data_json.get("cargoquery", [])
            if not results: break
            
            for entry in results:
                data = entry.get("title", {})
                item_id = data.get("itemid", "")
                
                if item_id.isdigit():
                    name = sanitize_text(data.get("name", ""))
                    stats = {}
                    
                    numeric_keys = ["damage", "knockback", "defense", "usetime", "velocity", "buy", "sell", "axe", "hammer", "rare"]
                    for key in numeric_keys:
                        if data.get(key):
                            val = parse_numeric_stat(data.get(key))
                            if val is not None:
                                if key == "rare":
                                    stats["rarity"] = int(val)
                                else:
                                    stats[key] = val
                    
                    raw_type = sanitize_text(data.get("type", ""))
                    generic_types = [t.strip().capitalize() for t in raw_type.split('^') if t.strip()]

                    item_payload = {
                        "id": int(item_id),
                        "name": name,
                        "description": sanitize_text(data.get("tooltip", "")) or "N/A",
                        "url": generate_wiki_url(name),
                        "image_url": generate_image_url(name),
                        "generic_types": generic_types,
                        "specific_type": None, 
                        "damage_class": sanitize_text(data.get("damagetype", "")),
                        "stats": stats,
                        "crafting": { "is_craftable": False, "recipes": [] },
                        "acquisition": [] 
                    }
                    
                    if data.get("hardmode"):
                        hm_raw = str(data.get("hardmode", "")).strip().lower()
                        item_payload["hardmode"] = hm_raw in ["1", "true", "yes"]

                    items_db[item_id] = item_payload
                    name_to_id_map[name.lower()] = item_id
                    
            print(f"Fetched {len(items_db)} items...")
            offset += limit
            time.sleep(0.45)
        except Exception as e:
            print(f"Network/Parsing Error in Step 1: {e}")
            break

    # 2. Map Specific Types via Category API
    print(f"\nStep 2/6: Categorizing Sub-types via Category API...")
    for category_name, specific_tag in CATEGORY_MAP.items():
        cmcontinue = None
        match_count = 0
        
        while True:
            params = {
                "action": "query",
                "list": "categorymembers",
                "cmtitle": f"Category:{category_name}",
                "cmlimit": 500,
                "format": "json"
            }
            if cmcontinue:
                params["cmcontinue"] = cmcontinue
                
            try:
                resp = session.get("https://terraria.wiki.gg/api.php", params=params, timeout=10).json()
                
                if "error" in resp:
                    print(f"   [!] API Error for {category_name}: {resp['error'].get('info')}")
                    break
                    
                members = resp.get("query", {}).get("categorymembers", [])
                
                for member in members:
                    member_name = member['title'].split(':')[-1].lower()
                    
                    if member_name in name_to_id_map:
                        item_id = name_to_id_map[member_name]
                        items_db[item_id]["specific_type"] = specific_tag
                        match_count += 1
                        
                if "continue" in resp and "cmcontinue" in resp["continue"]:
                    cmcontinue = resp["continue"]["cmcontinue"]
                    time.sleep(0.45)
                else:
                    break
            except Exception as e:
                break
        
        if match_count > 0:
            print(f"  -> Tagged {match_count} items as '{specific_tag}' (via {category_name}).")
        time.sleep(0.45) 

    # 2.5 THE NEW HEURISTIC FALLBACK LAYER & DETECTIVE
    print("\nStep 3/6: Running Heuristic Fallbacks & Detective Inference...")
    fallback_count = 0
    inference_count = 0
    catchall_count = 0
    
    for item in items_db.values():
        if not item["specific_type"]:
            # Layer A: Try explicit generic map
            for g_type in item["generic_types"]:
                if g_type in GENERIC_FALLBACK_MAP:
                    item["specific_type"] = GENERIC_FALLBACK_MAP[g_type]
                    fallback_count += 1
                    break 
                    
            # Layer B: Keyword & Stat Detective
            if not item["specific_type"]:
                name_lower = item["name"].lower()
                dmg_class = item.get("damage_class", "").lower()
                g_types_lower = [t.lower() for t in item["generic_types"]]
                
                # Tools
                if "pickaxe" in name_lower: item["specific_type"] = "Pickaxe"
                elif "hamaxe" in name_lower: item["specific_type"] = "Hamaxe"
                elif "chainsaw" in name_lower: item["specific_type"] = "Chainsaw"
                elif "drill" in name_lower: item["specific_type"] = "Drill"
                elif item["stats"].get("axe") and "axe" in name_lower: item["specific_type"] = "Axe"
                elif item["stats"].get("hammer") and "hammer" in name_lower: item["specific_type"] = "Hammer"
                elif "fishing pole" in name_lower: item["specific_type"] = "Fishing Pole"
                
                # Weapons
                elif "weapon" in g_types_lower:
                    if "whip" in name_lower and dmg_class == "summon": item["specific_type"] = "Whip"
                    elif "staff" in name_lower:
                        if dmg_class == "summon": item["specific_type"] = "Minion Summon"
                        elif dmg_class == "magic": item["specific_type"] = "Wand"
                    elif any(x in name_lower for x in ["sword", "blade", "saber", "katana", "scimitar", "claymore"]): item["specific_type"] = "Sword"
                    elif "bow" in name_lower and dmg_class == "ranged": item["specific_type"] = "Bow"
                    elif "gun" in name_lower and dmg_class == "ranged": item["specific_type"] = "Gun"
                    elif "yoyo" in name_lower: item["specific_type"] = "Yoyo"
                    elif any(x in name_lower for x in ["spear", "lance", "pike", "trident", "halberd"]): item["specific_type"] = "Spear"
                
                # Armor & Vanity
                elif "armor" in g_types_lower or "vanity" in g_types_lower:
                    if any(x in name_lower for x in ["helmet", "headgear", "mask", "hat", "hood", "cap", "crown", "goggles", "helm"]): item["specific_type"] = "Head Armor"
                    elif any(x in name_lower for x in ["breastplate", "shirt", "robe", "chainmail", "tunic", "chestplate", "suit", "armor"]): item["specific_type"] = "Body Armor"
                    elif any(x in name_lower for x in ["leggings", "greaves", "pants", "boots"]): item["specific_type"] = "Leg Armor"
                
                # Consumables & Miscs
                elif any(x in name_lower for x in ["potion", "flask", "brew"]): item["specific_type"] = "Potion"
                elif "dye" in name_lower: item["specific_type"] = "Dye"
                elif "arrow" in name_lower: item["specific_type"] = "Arrow"
                elif "bullet" in name_lower: item["specific_type"] = "Bullet"
                
                # Nature & Wildlife
                elif any(x in name_lower for x in ["fish", "koi", "trout", "salmon", "bass", "jellyfish", "tuna", "minnow"]): item["specific_type"] = "Fish"
                elif any(x in name_lower for x in ["seed", "spore"]): item["specific_type"] = "Seed"
                elif "crate" in name_lower: item["specific_type"] = "Crate"
                
                if item["specific_type"]:
                    inference_count += 1
            
            # Layer C: The Universal Catch-All (Zero Nulls Guarantee)
            if not item["specific_type"]:
                if item["generic_types"]:
                    item["specific_type"] = item["generic_types"][0]
                else:
                    item["specific_type"] = "Item"
                catchall_count += 1
                
    print(f"  -> Salvaged {fallback_count} items via generic type map.")
    print(f"  -> Salvaged {inference_count} items via keyword/stat inference.")
    print(f"  -> Assigned {catchall_count} items via Universal Catch-All.")

    # 3. Fetch Recipes 
    print("\nStep 4/6: Fetching Recipes & Resolving Aliases...")
    offset = 0
    while True:
        params = {
            "action": "cargoquery", "tables": "Recipes",
            "fields": "_pageName,resultid,station,ings,args", 
            "limit": 500, "offset": offset, "format": "json"
        }
        try:
            resp = session.get("https://terraria.wiki.gg/api.php", params=params, timeout=10)
            data_json = resp.json()
            if "error" in data_json: break
            results = data_json.get("cargoquery", [])
            if not results: break
            
            for entry in results:
                data = entry.get("title", {})
                rid = data.get("resultid", "")
                
                if rid in items_db:
                    page_name = str(data.get("_pageName", "")).lower()
                    station = sanitize_text(data.get("station", "By Hand"))
                    args_lower = str(data.get("args", "")).lower()
                    
                    # NEW: Drop anything from the archived Legacy pages or tagged as old ingredients
                    if "legacy:" in page_name or "#i:old" in args_lower: 
                        continue
                    
                    bad_flags = ["removed", "historical", "obsolete", "deprecated", "legacy", "old=", "former", "unobtainable", "desktop=n", "desktop=false", "desktop=0", "pc=n", "pc=false", "pc=0"]
                    if any(flag in args_lower for flag in bad_flags): continue 
                    if re.search(r'(?:version|patch)[=:\s\'"]+[0-9]+\.[0-9]+', args_lower): continue
                    if re.search(r'\b[0-9]+\.[0-9]+(?:\.[0-9]+)?\s*=\s*(?:n|false|0)\b', args_lower): continue
                    
                    # Extract raw ingredients directly (no API aliasing required)
                    resolved_ings = parse_ingredients(data.get("ings", ""))
                    if not resolved_ings: continue
                    
                    # Generate a unique mathematical signature for the recipe to deduplicate identical rows
                    sig_parts = sorted([f"{i['name']}:{i['amount']}" for i in resolved_ings])
                    recipe_signature = station + "|" + "|".join(sig_parts)
                    
                    # Check if we already have this exact recipe saved
                    existing_signatures = items_db[rid].setdefault("_recipe_signatures", set())
                    if recipe_signature not in existing_signatures:
                        existing_signatures.add(recipe_signature)
                        
                        is_transmutation = "extractinator" in station.lower() or "shimmer" in station.lower()
                        version = "Legacy" if ("old-gen" in args_lower or "3ds" in args_lower) else "Console" if "console" in args_lower else "Desktop"

                        items_db[rid]["crafting"]["recipes"].append({
                            "station": station,
                            "ingredients": resolved_ings,
                            "version": version,
                            "transmutation": is_transmutation
                        })
            offset += 500
            print(f"  ... Parsed {offset} recipe entries ...")
            time.sleep(0.45) # Polite batch delay
        except Exception as e:
            print(f"Error fetching recipes: {e}")
            break
            
    # Cleanup temporary signatures
    for item in items_db.values():
        item.pop("_recipe_signatures", None)

    # 4. Fetch Drops
    print("\nStep 5/6: Fetching Drops...")
    offset = 0
    drop_count = 0
    while True:
        params = {
            "action": "cargoquery", "tables": "Drops",
            "fields": "item, name, rate", 
            "limit": 500, "offset": offset, "format": "json"
        }
        try:
            resp = session.get("https://terraria.wiki.gg/api.php", params=params, timeout=10)
            data_json = resp.json()
            
            if "error" in data_json: 
                print(f"[!] API Error in Drops: {data_json['error'].get('info')}")
                break
                
            results = data_json.get("cargoquery", [])
            if not results: break
            
            for entry in results:
                entry_data = entry.get("title", {})
                
                item_name = sanitize_text(entry_data.get("item", "")).lower()
                source_name = sanitize_text(entry_data.get("name", "")) 
                rate = sanitize_text(entry_data.get("rate", ""))
                
                if item_name in name_to_id_map and source_name:
                    item_id = name_to_id_map[item_name]
                    
                    existing_sources = [x['source'] for x in items_db[item_id]["acquisition"]]
                    if source_name not in existing_sources:
                        items_db[item_id]["acquisition"].append({
                            "type": "drop",
                            "source": source_name,
                            "rate": rate
                        })
                        drop_count += 1
            
            offset += 500
            if offset % 2000 == 0: print(f"Processed {offset} drop entries...")
            time.sleep(0.45)
        except Exception as e:
            print(f"Error fetching drops: {e}")
            break
    
    print(f"Total drops successfully matched to items: {drop_count}")
    
    # 5. Final Data Cleanup
    print("\nStep 6/6: Evaluating Craftability...")
    for item_data in items_db.values():
        item_data["crafting"]["is_craftable"] = len(item_data["crafting"]["recipes"]) > 0

    print(f"Saving to {OUTPUT_FILE}...")
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(items_db, f, indent=4, ensure_ascii=False)
    print("Extraction Complete.")

if __name__ == "__main__":
    fetch_data()