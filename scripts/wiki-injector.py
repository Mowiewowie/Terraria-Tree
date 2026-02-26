import json
import asyncio
import aiohttp
import glob
import urllib.parse
import random
from bs4 import BeautifulSoup

HEADERS = {'User-Agent': 'TerrariTree-Data-Builder/1.0 (https://github.com/yourusername/yourrepo)'}
CONCURRENT_REQUESTS = 5 # Safely increased since API limits are more generous
MAX_RETRIES = 3

def sanitize_text(text):
    if not text: return ""
    return text.replace('\xa0', ' ').strip()

async def fetch_api_html(session, wiki_url, item_name, retry_count=0):
    """Hits the MediaWiki api.php endpoint instead of scraping the HTML webpage."""
    parsed_url = urllib.parse.urlparse(wiki_url)
    if '/wiki/' not in parsed_url.path:
        return None
        
    # Extract the exact page name from the end of the URL
    page_name = urllib.parse.unquote(parsed_url.path.split('/wiki/')[-1])
    api_url = f"https://{parsed_url.netloc}/api.php"
    
    params = {
        'action': 'parse',
        'page': page_name,
        'prop': 'text',
        'format': 'json'
    }
    
    try:
        async with session.get(api_url, params=params, headers=HEADERS, timeout=15) as response:
            if response.status == 200:
                data = await response.json()
                if 'error' in data:
                    print(f"[API Error] {item_name}: {data['error'].get('info')}")
                    return None
                # Extract the raw HTML string from the JSON response
                return data['parse']['text']['*']
            elif response.status in [429, 403] and retry_count < MAX_RETRIES:
                sleep_time = (2 ** retry_count) + random.uniform(0.5, 1.5)
                print(f"[API Rate Limit] {response.status} on {item_name}. Retrying in {sleep_time:.2f}s...")
                await asyncio.sleep(sleep_time)
                return await fetch_api_html(session, wiki_url, item_name, retry_count + 1)
            return None
    except Exception as e:
        print(f"[Network Error] {item_name}: {e}")
        return None

async def scrape_acquisition_data(session, url, item_name, semaphore):
    if not url: return []
    
    async with semaphore:
        # Polite 0.5s delay between API hits
        await asyncio.sleep(0.5)
        
        html = await fetch_api_html(session, url, item_name)
        if not html: return []

        # The HTML returned by the API is identical to the main content div of the webpage, 
        # so your existing BeautifulSoup logic works perfectly!
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
                        new_drops.append({
                            "SourceNPC_ID": -1,
                            "SourceNPC_Name": f"NPC: {sanitize_text(cols[0].get_text())}",
                            "DropChance": "100%",
                            "Conditions": [sanitize_text(cols[2].get_text())] if sanitize_text(cols[2].get_text()) else []
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
                        new_drops.append({
                            "SourceNPC_ID": -1,
                            "SourceNPC_Name": f"Chest/Crate: {sanitize_text(cols[0].get_text())}",
                            "DropChance": sanitize_text(cols[2].get_text()),
                            "Conditions": []
                        })

        return item_name, new_drops

async def process_file(file_path):
    print(f"\n--- Loading {file_path} ---")
    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    updated_count = 0
    semaphore = asyncio.Semaphore(CONCURRENT_REQUESTS)
    
    connector = aiohttp.TCPConnector(limit=CONCURRENT_REQUESTS)
    async with aiohttp.ClientSession(connector=connector) as session:
        tasks = []
        item_references = []

        for item in data:
            has_recipes = len(item.get("Recipes", [])) > 0
            has_drops = len(item.get("ObtainedFromDrops", [])) > 0
            
            if not has_recipes and not has_drops:
                url = item.get("WikiUrl")
                if url:
                    tasks.append(scrape_acquisition_data(session, url, item['DisplayName'], semaphore))
                    item_references.append(item)

        if tasks:
            print(f"Querying API for {len(tasks)} missing items in {file_path}...")
            results = await asyncio.gather(*tasks)

            # Map the results back to the original JSON items
            for item, result in zip(item_references, results):
                if result:
                    _, new_acquisition = result
                    if new_acquisition:
                        item["ObtainedFromDrops"].extend(new_acquisition)
                        updated_count += 1

    print(f"Finished {file_path}. Successfully updated {updated_count} items.")
    
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=4)

async def main():
    json_files = glob.glob('*_Export.json')
    if not json_files:
        print("Error: No _Export.json files found. Ensure C# script runs first.")
        return

    for file_path in json_files:
        await process_file(file_path)

if __name__ == "__main__":
    asyncio.run(main())