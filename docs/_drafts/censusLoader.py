import os
import requests
import time

def download_github_folder(repo_owner, repo_name, folder_path, local_dir):
    api_url = f"https://api.github.com/repos/{repo_owner}/{repo_name}/contents/{folder_path}"
    response = requests.get(api_url)
    if response.status_code == 200:
        files = response.json()
        for file in files:
            if file['type'] == 'file':
                file_url = file['download_url']
                file_name = file['name']
                if file_name.lower().endswith('.md'):
                    print(f"Skipping markdown file: {file_name}")
                    continue
                local_file_path = os.path.join(local_dir, file_name)
                if os.path.exists(local_file_path):
                    print(f"File already exists, skipping: {local_file_path}")
                else:
                    download_file(file_url, local_file_path)
                    time.sleep(1)  # Add a delay to avoid overwhelming the server
    else:
        print(f"Failed to retrieve folder content. Status code: {response.status_code}")

def download_file(url, local_path):
    max_retries = 3
    for attempt in range(max_retries):
        try:
            response = requests.get(url)
            if response.status_code == 200:
                with open(local_path, 'wb') as file:
                    file.write(response.content)
                print(f"Downloaded: {local_path}")
                return
            else:
                print(f"Failed to download {url}. Status code: {response.status_code}")
        except (requests.exceptions.RequestException, ConnectionResetError) as e:
            print(f"Error downloading {url}: {str(e)}")
            if attempt < max_retries - 1:
                print(f"Retrying in 5 seconds... (Attempt {attempt + 2}/{max_retries})")
                time.sleep(5)
            else:
                print(f"Failed to download {url} after {max_retries} attempts.")

# Usage
repo_owner = 'gicentre'
repo_name = 'data'
folder_path = 'census21/englandAndWales'
local_dir = '../data'

download_github_folder(repo_owner, repo_name, folder_path, local_dir)
