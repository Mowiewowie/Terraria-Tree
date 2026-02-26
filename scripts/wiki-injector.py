import json
import asyncio
import aiohttp
import glob
from bs4 import BeautifulSoup

# SECURITY: Custom User-Agent to identify the bot to Wiki admins
HEADERS = {'User-Agent': 'TerrariTree-Data-Builder/1.0 (https://github.com/yourusername/yourrepo)'}
CONCURRENT_REQUESTS = 10 # Safely limits simultaneous connections to avoid HTTP 429
MAX_RETRIES = 3

def sanitize_text(text):
    """Strips invisible characters and malicious HTML entities."""
    if not text: return ""
    return text.replace('\xa0', ' ').strip()

async def fetch_html(session, url, item_name, retry_count=0):
    """Fetches HTML asynchronously with Exponential Backoff for rate limiting."""
    try:
        async with session.get(url, headers=HEADERS, timeout=15) as response:
            if response.status == 200:
                return await response.text()
            elif response.status == 429 and retry_count < MAX_RETRIES:
                # Exponential backoff: 2s, 4s, 8s delay if rate limited
                sleep_time = 2 ** (retry_count + 1)
                print(f"[Rate Limited] 429 on {item_name}. Retrying in {sleep_time}s...")
                await asyncio.sleep(sleep_time)
                return await fetch_html(session, url, item_name, retry_count + 1)
            else:
                return None
    except asyncio.TimeoutError:
        print(f"[Timeout] Failed to fetch {item_name}")
        return None
    except Exception as e:
        print(f"[Error] Network exception on {item_name}: {e}")
        return None

async def scrape_acquisition_data(session, url, item_name, semaphore):
    """Scrapes the wiki for NPC shop and Chest/Crate locations."""
    if not url: return []
    
    async with semaphore:
        html = await fetch_html(session, url, item_name)
        if not html: return []

        soup = BeautifulSoup(html, 'html.parser')
        new_drops = []

        # 1. Check for "Sold by" tables (NPC Shops)
        sold_by_span = soup.find('span', id='Sold_by')
        if sold_by_span:
            table = sold_by_span.find_next('table', class_='cargoTable')
            if table:
                rows = table.find_all('tr')[1:]
                for row in rows:
                    cols = row.find_all('td')
                    if len(cols) >= 3:
                        npc_name = sanitize_text(cols[0].get_text())
                        conditions = sanitize_text(cols[2].get_text())
                        new_drops.append({
                            "SourceNPC_ID": -1,
                            "SourceNPC_Name": f"NPC: {npc_name}",
                            "DropChance": "100%",
                            "Conditions": [conditions] if conditions else []
                        })

        # 2. Check for "Found in" tables (Chests, Crates)
        found_in_span = soup.find('span', id='Found_in')
        if found_in_span:
            table = found_in_span.find_next('table', class_='cargoTable')
            if table:
                rows = table.find_all('tr')[1:]
                for row in rows:
                    cols = row.find_all('td')
                    if len(cols) >= 3:
                        container_name = sanitize_text(cols[0].get_text())
                        chance = sanitize_text(cols[2].get_text())
                        new_drops.append({
                            "SourceNPC_ID": -1,
                            "SourceNPC_Name": f"Chest/Crate: {container_name}",
                            "DropChance": chance,
                            "Conditions": []
                        })

        return new_drops

async def process_file(file_path):
    """Processes a single JSON database file asynchronously."""
    print(f"\n--- Loading {file_path} ---")
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    updated_count = 0
    semaphore = asyncio.Semaphore(CONCURRENT_REQUESTS)
    
    async with aiohttp.ClientSession() as session:
        tasks = []
        item_references = []

        # Build scraping tasks for missing data
        for item in data:
            has_recipes = len(item.get("Recipes", [])) > 0
            has_drops = len(item.get("ObtainedFromDrops", [])) > 0
            
            if not has_recipes and not has_drops:
                url = item.get("WikiUrl")
                if url:
                    tasks.append(scrape_acquisition_data(session, url, item['DisplayName'], semaphore))
                    item_references.append(item)

        if tasks:
            print(f"Scraping {len(tasks)} missing items in {file_path}...")
            results = await asyncio.gather(*tasks)

            # Map the results back to the original JSON items
            for item, new_acquisition in zip(item_references, results):
                if new_acquisition:
                    item["ObtainedFromDrops"].extend(new_acquisition)
                    updated_count += 1

    print(f"Finished {file_path}. Successfully updated {updated_count} items.")
    
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4)

async def main():
    # Find all JSON files generated by the C# engine
    json_files = glob.glob('*_Export.json')
    if not json_files:
        print("Error: No _Export.json files found. Ensure C# script runs first.")
        return

    for file_path in json_files:
        await process_file(file_path)

if __name__ == "__main__":
    asyncio.run(main())