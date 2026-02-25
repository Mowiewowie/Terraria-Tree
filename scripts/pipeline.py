import json
import time
import requests
from bs4 import BeautifulSoup
from datetime import datetime
import xml.etree.ElementTree as ET

# --- CONFIGURATION ---
CHESTS_TO_SCRAPE = ["Gold_Chest", "Water_Chest", "Ivy_Chest", "Ice_Chest", "Skyware_Chest", "Shadow_Chest", "Biome_Crate"]
HEADERS = {"User-Agent": "TerrariTreeDataPipeline/1.0 (Contact: admin@terraritree.com)"}
BASE_WEBSITE_URL = "https://terraritree.com/?id="

SITEMAP_OUTPUT_PATH = "./sitemap_test.xml"

def scrape_chest_loot(chest_url_name):
    url = f"https://terraria.wiki.gg/wiki/{chest_url_name}"
    try:
        response = requests.get(url, headers=HEADERS, timeout=10)
        response.raise_for_status()
    except requests.exceptions.RequestException:
        return []

    soup = BeautifulSoup(response.text, 'html.parser')
    loot_data = []
    
    # SECURITY: get_text(strip=True) prevents XSS injection from malicious wiki table edits
    for table in soup.find_all('table', class_='wikitable'):
        for row in table.find_all('tr')[1:]:
            cols = row.find_all(['td', 'th'])
            if len(cols) >= 3:
                loot_data.append({
                    "ItemName": cols[0].get_text(strip=True),
                    "ChestName": chest_url_name.replace("_", " "),
                    "ChanceText": cols[2].get_text(strip=True)
                })
    time.sleep(2) # Prevent Rate Limiting
    return loot_data

def generate_sitemap(data):
    today = datetime.today().strftime('%Y-%m-%d')
    
    # Setup XML root
    urlset = ET.Element("urlset", xmlns="http://www.sitemaps.org/schemas/sitemap/0.9")
    
    for item in data:
        item_id = item.get("ID")
        if not item_id: continue
        
        # Build URL based on router.js logic
        url_text = f"{BASE_WEBSITE_URL}{item_id}"
        
        url = ET.SubElement(urlset, "url")
        loc = ET.SubElement(url, "loc")
        loc.text = url_text
        lastmod = ET.SubElement(url, "lastmod")
        lastmod.text = today

    # SECURITY: Using ElementTree automatically escapes illegal XML characters (&, <, >)
    tree = ET.ElementTree(urlset)
    ET.indent(tree, space="  ", level=0)
    tree.write(SITEMAP_OUTPUT_PATH, encoding="utf-8", xml_declaration=True)

def main():
    # 1. Scrape Vanilla Chest Loot
    all_chest_loot = []
    for chest in CHESTS_TO_SCRAPE:
        print(f"Scraping Chest: {chest}")
        all_chest_loot.extend(scrape_chest_loot(chest))

    # 2. Find all dynamically generated JSON files from the C# Mod
    json_files = glob.glob("Terraria_*_Export.json")
    all_items_for_sitemap = []

    for file_path in json_files:
        print(f"Processing {file_path}...")
        with open(file_path, 'r', encoding='utf-8') as f:
            mod_data = json.load(f)
        
        # 3. Only attempt to inject chest loot if this is the Vanilla file
        # (Modded wikis have different HTML structures, preventing reliable cross-scraping here)
        if "Vanilla" in file_path:
            for item in mod_data:
                display_name = item.get("DisplayName")
                matching_chests = [loot for loot in all_chest_loot if loot["ItemName"] == display_name]
                if matching_chests:
                    item["ObtainedFromChests"] = [{"ChestType": m["ChestName"], "Probability": m["ChanceText"]} for m in matching_chests]

        # Accumulate all items for the global sitemap
        all_items_for_sitemap.extend(mod_data)

        # 4. Save the finalized file back to the root, renaming it for the frontend
        output_name = file_path.replace("_Export", "_Final")
        with open(f"./{output_name}", 'w', encoding='utf-8') as f:
            json.dump(mod_data, f, indent=4)

    # 5. Generate one massive sitemap pointing to all items
    generate_sitemap(all_items_for_sitemap)
    print("Pipeline Complete! Distinct JSONs and unified Sitemap generated.")

if __name__ == "__main__":
    main()