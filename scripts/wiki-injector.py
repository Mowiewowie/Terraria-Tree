import json
import glob
import time
import random
from concurrent.futures import ThreadPoolExecutor, as_completed
import cloudscraper
from bs4 import BeautifulSoup

CONCURRENT_REQUESTS = 3 
MAX_RETRIES = 5

# SECURITY: Use Cloudscraper to simulate a real Chrome desktop browser to bypass Cloudflare WAF
scraper = cloudscraper.create_scraper(
    browser={
        'browser': 'chrome',
        'platform': 'windows',
        'desktop': True
    }
)

def sanitize_text(text):
    if not text: return ""
    return text.replace('\xa0', ' ').strip()

def fetch_html(url, item_name, retry_count=0):
    try:
        response = scraper.get(url, timeout=15)
        if response.status_code == 200:
            return response.text
        elif response.status_code in [429, 403] and retry_count < MAX_RETRIES:
            # Jittered backoff if Cloudflare flags us
            sleep_time = (2 ** (retry_count + 1)) + random.uniform(1.0, 3.0)
            print(f"[Cloudflare Block] {response.status_code} on {item_name}. Retrying in {sleep_time:.2f}s...")
            time.sleep(sleep_time)
            return fetch_html(url, item_name, retry_count + 1)
        else:
            return None
    except Exception as e:
        print(f"[Error] Network exception on {item_name}: {e}")
        return None

def scrape_item(item):
    """Worker thread function to scrape a single item."""
    url = item.get("WikiUrl")
    item_name = item.get('DisplayName')
    
    if not url: return None

    # Base throttle to ensure we don't hammer the wiki
    time.sleep(random.uniform(1.0, 2.0))

    html = fetch_html(url, item_name)
    if not html: return None

    soup = BeautifulSoup(html, 'html.parser')
    new_drops = []

    # 1. Sold By
    sold_by_span = soup.find('span', id='Sold_by')
    if sold_by_span:
        table = sold_by_span.find_next('table', class_='cargoTable')
        if table:
            for row in table.find_all('tr')[1:]:
                cols = row.find_all('td')
                if len(cols) >= 3:
                    new_drops.append({
                        "SourceNPC_ID": -1,
                        "SourceNPC_Name": f"NPC: {sanitize_text(cols[0].get_text())}",
                        "DropChance": "100%",
                        "Conditions": [sanitize_text(cols[2].get_text())] if sanitize_text(cols[2].get_text()) else []
                    })

    # 2. Found In
    found_in_span = soup.find('span', id='Found_in')
    if found_in_span:
        table = found_in_span.find_next('table', class_='cargoTable')
        if table:
            for row in table.find_all('tr')[1:]:
                cols = row.find_all('td')
                if len(cols) >= 3:
                    new_drops.append({
                        "SourceNPC_ID": -1,
                        "SourceNPC_Name": f"Chest/Crate: {sanitize_text(cols[0].get_text())}",
                        "DropChance": sanitize_text(cols[2].get_text()),
                        "Conditions": []
                    })

    return item.get("ID"), new_drops

def process_file(file_path):
    print(f"\n--- Processing {file_path} ---")
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Filter items that need scraping
    items_to_scrape = [
        item for item in data 
        if len(item.get("Recipes", [])) == 0 and len(item.get("ObtainedFromDrops", [])) == 0 and item.get("WikiUrl")
    ]

    if not items_to_scrape:
        print("No missing items to scrape.")
        return

    print(f"Scraping {len(items_to_scrape)} missing items via Cloudscraper...")
    
    updates_map = {}
    with ThreadPoolExecutor(max_workers=CONCURRENT_REQUESTS) as executor:
        # Submit all tasks
        future_to_item = {executor.submit(scrape_item, item): item for item in items_to_scrape}
        
        for future in as_completed(future_to_item):
            result = future.result()
            if result:
                item_id, new_drops = result
                if new_drops:
                    updates_map[item_id] = new_drops

    # Apply updates to original data
    updated_count = 0
    for item in data:
        if item.get("ID") in updates_map:
            item["ObtainedFromDrops"].extend(updates_map[item["ID"]])
            updated_count += 1

    print(f"Finished {file_path}. Successfully updated {updated_count} items.")
    
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4)

def main():
    json_files = glob.glob('*_Export.json')
    if not json_files:
        print("Error: No _Export.json files found. Ensure C# script runs first.")
        return

    for file_path in json_files:
        process_file(file_path)

if __name__ == "__main__":
    main()