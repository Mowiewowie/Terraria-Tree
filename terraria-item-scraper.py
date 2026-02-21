import json
import requests
import re
import time
import urllib.parse
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# --- Configuration ---
OUTPUT_FILE = "terraria_items_final.json"
USER_AGENT = "TerrariaJSONBuilder/2.2 (Acquisition Restored)"

def sanitize_text(text: str) -> str:
    if not text: return ""
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'\[c/[a-fA-F0-9]{6}:(.*?)\]', r'\1', text)
    text = re.sub(r'\[[a-zA-Z]:.*?\]', '', text)
    text = re.sub(r'\[\[(?:[^|\]]*\|)?([^\]]+)\]\]', r'\1', text) # Strip wiki links
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

def parse_recipe_version(args_string: str) -> str:
    """
    Parses the Wiki 'args' column to determine version applicability.
    Returns: 'Desktop' (Default), 'Old-gen console', '3DS', etc.
    """
    if not args_string:
        return "Desktop" # Default assumption if no version tag exists
    
    args_lower = args_string.lower()
    if "old-gen" in args_lower or "3ds" in args_lower:
        return "Legacy"
    if "console" in args_lower and "desktop" not in args_lower:
        return "Console"
    
    return "Desktop"

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

    items_database = {}
    name_to_id_map = {} # Required for mapping drops to items
    
    # 1. Fetch Items
    print("Step 1/4: Fetching Items...")
    offset = 0
    limit = 500
    while True:
        params = {
            "action": "cargoquery",
            "tables": "Items",
            "fields": "itemid,name,tooltip,damage,knockback,defense",
            "limit": limit, "offset": offset, "format": "json"
        }
        try:
            resp = session.get("https://terraria.wiki.gg/api.php", params=params, timeout=10)
            results = resp.json().get("cargoquery", [])
            if not results: break
            
            for entry in results:
                data = entry.get("title", {})
                item_id = data.get("itemid", "")
                if item_id.isdigit():
                    name = sanitize_text(data.get("name", ""))
                    stats = {}
                    dmg = parse_numeric_stat(data.get("damage"))
                    if dmg: stats["damage"] = int(dmg)
                    
                    items_database[item_id] = {
                        "id": int(item_id),
                        "name": name,
                        "description": sanitize_text(data.get("tooltip", "")) or "N/A",
                        "url": generate_wiki_url(name),
                        "image_url": generate_image_url(name),
                        "stats": stats,
                        "crafting": { "is_craftable": False, "recipes": [] },
                        "acquisition": [] # Initialize array for drops
                    }
                    name_to_id_map[name.lower()] = item_id
            print(f"Items fetched: {len(items_database)}")
            offset += limit
            time.sleep(0.5)
        except Exception as e:
            print(f"Error: {e}")
            break

    # 2. Fetch Recipes (Now with Version Parsing & Historical Filtering)
    print("Step 2/4: Fetching Recipes...")
    offset = 0
    while True:
        params = {
            "action": "cargoquery",
            "tables": "Recipes",
            "fields": "resultid,station,ings,args", # 'args' contains version info
            "limit": limit, "offset": offset, "format": "json"
        }
        try:
            resp = session.get("https://terraria.wiki.gg/api.php", params=params, timeout=10)
            results = resp.json().get("cargoquery", [])
            if not results: break
            
            for entry in results:
                data = entry.get("title", {})
                result_id = data.get("resultid", "")
                
                if result_id in items_database:
                    args_string = data.get("args", "")
                    args_lower = args_string.lower()
                    
                    # Filter out historical/removed recipes using embedded tags
                    if any(bad_word in args_lower for bad_word in ["i:old", "removed", "historical", "obsolete", "deprecated", "legacy"]):
                        continue
                    
                    version_tag = parse_recipe_version(args_string)
                    is_transmutation = "extractinator" in sanitize_text(data.get("station", "")).lower() or "shimmer" in sanitize_text(data.get("station", "")).lower()
                    
                    # Store the recipe (Deferred craftability evaluation)
                    items_database[result_id]["crafting"]["recipes"].append({
                        "station": sanitize_text(data.get("station", "By Hand")),
                        "ingredients": parse_ingredients(data.get("ings", "")),
                        "version": version_tag,
                        "transmutation": is_transmutation
                    })
            
            offset += limit
            time.sleep(0.5)
        except Exception as e:
            print(f"Error: {e}")
            break

    # 3. Fetch Drops
    print("Step 3/4: Fetching Drops...")
    offset = 0
    drop_count = 0
    while True:
        params = {
            "action": "cargoquery", 
            "tables": "Drops",
            "fields": "item, name, rate", # 'name' is the mob/source in this table
            "limit": limit, "offset": offset, "format": "json"
        }
        try:
            resp = session.get("https://terraria.wiki.gg/api.php", params=params, timeout=10)
            data = resp.json()
            
            if "error" in data:
                print(f"API Error during drops: {data['error'].get('info')}")
                break
                
            results = data.get("cargoquery", [])
            if not results: break
            
            for entry in results:
                entry_data = entry.get("title", {})
                
                item_name = sanitize_text(entry_data.get("item", "")).lower()
                source_name = sanitize_text(entry_data.get("name", "")) 
                rate = sanitize_text(entry_data.get("rate", ""))
                
                if item_name in name_to_id_map and source_name:
                    item_id = name_to_id_map[item_name]
                    
                    existing_sources = [x['source'] for x in items_database[item_id]["acquisition"]]
                    if source_name not in existing_sources:
                        items_database[item_id]["acquisition"].append({
                            "type": "drop",
                            "source": source_name,
                            "rate": rate
                        })
                        drop_count += 1
            
            offset += limit
            if offset % 2000 == 0: print(f"Processed {offset} drop entries...")
            time.sleep(0.5)
        except Exception as e:
            print(f"Error fetching drops: {e}")
            break
            
    print(f"Total drops successfully matched to items: {drop_count}")

    # 4. Final Data Cleanup (Evaluate Craftability)
    print("Step 4/4: Evaluating Craftability...")
    for item in items_database.values():
        # Dynamically set to True only if valid modern recipes exist in the array
        item["crafting"]["is_craftable"] = len(item["crafting"]["recipes"]) > 0

    print(f"Saving to {OUTPUT_FILE}...")
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(items_database, f, indent=4, ensure_ascii=False)
    print("Done.")

if __name__ == "__main__":
    fetch_data()