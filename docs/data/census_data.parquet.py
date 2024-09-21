import os
import sys
import pandas as pd
import requests
import pyarrow as pa
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

# schema = pa.schema([
#     ('code', pa.string()),
#     ('category', pa.string()),
#     ('value', pa.float64()),
#     ('source', pa.string())
# ])

combined_df = pd.concat(dfs, ignore_index=True)
combined_df['category'] = combined_df['category'].apply(lambda x: str(x) if isinstance(x, int) else x)
# combined_df.to_parquet(sys.stdout, index=False, schema=schema)
combined_df.to_parquet(sys.stdout, index=False)


