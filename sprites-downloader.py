import json
import os
import requests
import time
import random
import logging
from urllib.parse import urlparse, unquote
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# Configuration
JSON_FILE_PATH = 'Terraria_All_1.4.4_Export.json'
OUTPUT_DIR = 'sprites'
FAILED_LOG_FILE = 'failed_links_and_duplicates.txt'
MIN_DELAY_SEC = 0.5
MAX_DELAY_SEC = 1.5
ALLOWED_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.gif', '.webp'}

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')

def sanitize_and_validate_filename(url: str) -> str:
    """
    Strips paths, sanitizes characters, and strictly enforces safe image extensions.
    """
    parsed_url = urlparse(url)
    filename = unquote(os.path.basename(parsed_url.path))
    
    # Whitelist safe characters
    safe_chars = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-. ")
    sanitized = "".join(c for c in filename if c in safe_chars)
    if not sanitized:
        sanitized = "unknown_file"

    # Enforce safe file extension
    name, ext = os.path.splitext(sanitized)
    if ext.lower() not in ALLOWED_EXTENSIONS:
        # Neutralize potentially malicious extensions by forcing .png
        sanitized = f"{sanitized}.png"
        
    return sanitized

def create_resilient_session() -> requests.Session:
    session = requests.Session()
    retry_strategy = Retry(
        total=5,
        backoff_factor=1,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"]
    )
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Bot/1.0'
    })
    return session

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    try:
        with open(JSON_FILE_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        logging.error(f"Failed to load JSON: {e}")
        return

    # Step 1: Pre-process and group URLs by their base filename
    # Structure: { "Item.png": ["url1", "url2"], ... }
    name_registry = {}
    for item in data:
        url = item.get("IconUrl")
        if url:
            base_name = sanitize_and_validate_filename(url)
            if base_name not in name_registry:
                name_registry[base_name] = []
            name_registry[base_name].append(url)

    if not name_registry:
        logging.info("No valid URLs found in the JSON file.")
        return

    # Step 2: Build the download queue and handle duplicate renaming
    download_queue = []
    duplicates_report = {} # To store data for the final text file
    
    for base_name, urls in name_registry.items():
        if len(urls) > 1:
            duplicates_report[base_name] = urls
            
        for index, url in enumerate(urls):
            if index == 0:
                final_filename = base_name
            else:
                # E.g., Item.png becomes Item_2.png
                name, ext = os.path.splitext(base_name)
                final_filename = f"{name}_{index + 1}{ext}"
                
            download_queue.append((url, final_filename))

    # Step 3: Randomize the queue
    random.shuffle(download_queue)
    logging.info(f"Loaded {len(download_queue)} items. Beginning download process...")

    session = create_resilient_session()
    download_count = 0
    failed_urls = []

    # Step 4: Execution Loop
    for url, filename in download_queue:
        filepath = os.path.join(OUTPUT_DIR, filename)

        if os.path.exists(filepath):
            logging.info(f"Skipping {filename} - already exists.")
            continue

        try:
            response = session.get(url, timeout=10)
            if response.status_code == 200:
                with open(filepath, 'wb') as img_file:
                    for chunk in response.iter_content(chunk_size=8192):
                        img_file.write(chunk)
                download_count += 1
                print(f"[{filename}] icon downloaded. Total items downloaded: {download_count}")
            else:
                logging.error(f"Failed to download {url} - HTTP {response.status_code}")
                failed_urls.append(url)

        except requests.exceptions.RequestException as e:
            logging.error(f"Request exception for {url}: {e}")
            failed_urls.append(url)

        time.sleep(random.uniform(MIN_DELAY_SEC, MAX_DELAY_SEC))

    # Step 5: Composite Reporting
    with open(FAILED_LOG_FILE, 'w', encoding='utf-8') as f:
        f.write("=== FAILED DOWNLOADS ===\n")
        if failed_urls:
            for fail_url in failed_urls:
                f.write(f"{fail_url}\n")
        else:
            f.write("No downloads failed.\n")
            
        f.write("\n\n=== REPEATED FILE NAMES AND THEIR LINKS ===\n")
        if duplicates_report:
            for base_name, urls in duplicates_report.items():
                f.write(f"\nBase Filename: {base_name}\n")
                for i, url in enumerate(urls):
                    suffix = "" if i == 0 else f" (Saved as: {os.path.splitext(base_name)[0]}_{i+1}{os.path.splitext(base_name)[1]})"
                    f.write(f"  - {url}{suffix}\n")
        else:
            f.write("No repeated filenames detected.\n")

    logging.info(f"Process complete. Log saved to {FAILED_LOG_FILE}.")

if __name__ == "__main__":
    main()