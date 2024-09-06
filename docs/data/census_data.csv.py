import os
import sys
import pandas as pd
import requests
from urllib.parse import urljoin

BASE_URL = "https://gicentre.github.io/data/census21/englandAndWales/"
CACHE_DIR = "docs/.observablehq/cache"

# load some data from 2021 census
files = [
    "pop.parquet", 
    "deprivation.parquet", 
    "vehicle.parquet", 
    "heating.parquet", 
    "health.parquet"
]

os.makedirs(CACHE_DIR, exist_ok=True)

dfs = []

for filename in files:
    url = urljoin(BASE_URL, filename)
    local_path = os.path.join(CACHE_DIR, filename)
    
    if not os.path.exists(local_path):
        response = requests.get(url)
        with open(local_path, 'wb') as f:
            f.write(response.content)
    
    df = pd.read_parquet(local_path)
    df['source'] = os.path.splitext(filename)[0] 
    dfs.append(df)

combined_df = pd.concat(dfs, ignore_index=True)

combined_df.to_csv(sys.stdout, index=False)