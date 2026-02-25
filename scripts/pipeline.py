import json
import time
import requests
import glob
from bs4 import BeautifulSoup
from datetime import datetime

# FIX: Corrected "Biome_Crate" to "Biome_Crates" to prevent 404 redirects
CHESTS_TO_SCRAPE = ["Gold_Chest", "Water_Chest", "Ivy_Chest", "Ice_Chest", "Skyware_Chest", "Shadow_Chest", "Biome_Crates"]
HEADERS = {"User-Agent": "TerrariTreeDataPipeline/1.0 (Contact: admin@terraritree.com)"}
BASE_WEBSITE_URL = "https://terraritree.com/?id=" 

def scrape_chest_loot(chest_url_name):
    url = f"https://terraria.wiki.gg/wiki/{chest_url_name}"
    try:
        response = requests.get(url, headers=HEADERS, timeout=10)
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        print(f"Error scraping {chest_url_name}: {e}", flush=True)
        return []

    soup = BeautifulSoup(response.text, 'html.parser')
    loot_data = []
    
    for table in soup.find_all('table', class_='wikitable'):
        for row in table.find_all('tr')[1:]:
            cols = row.find_all(['td', 'th'])
            if len(cols) >= 3:
                loot_data.append({
                    "ItemName": cols[0].get_text(strip=True),
                    "ChestName": chest_url_name.replace("_", " "),
                    "ChanceText": cols[2].get_text(strip=True)
                })
    time.sleep(2) 
    return loot_data

# FIX: Refactored XML generation to pure string manipulation to guarantee compatibility 
# across all Python environments running on the GitHub Actions Ubuntu instances.
def generate_sitemap(data):
    print("Generating Sitemap...", flush=True)
    today = datetime.today().strftime('%Y-%m-%d')
    xml_content = ['<?xml version="1.0" encoding="UTF-8"?>']
    xml_content.append('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')
    
    for item in data:
        item_id = item.get("ID")
        if not item_id: continue
        url_text = f"{BASE_WEBSITE_URL}{item_id}"
        xml_content.append(f'  <url>\n    <loc>{url_text}</loc>\n    <lastmod>{today}</lastmod>\n  </url>')

    xml_content.append('</urlset>')
    
    with open("sitemap_test.xml", 'w', encoding='utf-8') as f:
        f.write("\n".join(xml_content))
    print("Sitemap generated successfully.", flush=True)

def main():
    try:
        all_chest_loot = []
        for chest in CHESTS_TO_SCRAPE:
            # FIX: force console buffer flush to guarantee real-time logging
            print(f"Scraping Chest: {chest}", flush=True) 
            all_chest_loot.extend(scrape_chest_loot(chest))

        json_files = glob.glob("Terraria_*_Export.json")
        if not json_files:
            print("CRITICAL: No JSON files found in the workspace!", flush=True)
            return

        all_items_for_sitemap = []

        for file_path in json_files:
            print(f"Processing {file_path}...", flush=True)
            with open(file_path, 'r', encoding='utf-8') as f:
                mod_data = json.load(f)
            
            if "Vanilla" in file_path:
                for item in mod_data:
                    display_name = item.get("DisplayName")
                    matching_chests = [loot for loot in all_chest_loot if loot["ItemName"] == display_name]
                    if matching_chests:
                        item["ObtainedFromChests"] = [{"ChestType": m["ChestName"], "Probability": m["ChanceText"]} for m in matching_chests]

            all_items_for_sitemap.extend(mod_data)

            output_name = file_path.replace("_Export", "_Final")
            with open(f"./{output_name}", 'w', encoding='utf-8') as f:
                json.dump(mod_data, f, indent=4)
                
            print(f"Saved: {output_name}", flush=True)

        generate_sitemap(all_items_for_sitemap)
        print("Pipeline Complete!", flush=True)
        
    # SECURITY: Prevent silent failures by aggressively trapping all exceptions
    except Exception as e:
        print(f"FATAL ERROR: {e}", flush=True)
        raise e

if __name__ == "__main__":
    main()