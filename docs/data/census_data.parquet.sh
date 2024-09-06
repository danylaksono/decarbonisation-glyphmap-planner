#!/bin/sh

TMPDIR="docs/.observablehq/cache"

# List of filenames to download (manually loop through them instead of using arrays)
files="pop.parquet deprivation.parquet vehicle.parquet heating.parquet health.parquet"

# Base URL for downloading the files
BASE_URL="https://gicentre.github.io/data/census21/englandAndWales"

# Loop through the list of files and download each one if not already in cache
for FILENAME in $files; do
  URL="$BASE_URL/$FILENAME"
  if [ ! -f "$TMPDIR/$FILENAME" ]; then
    echo "Downloading $FILENAME from $URL..."
    curl "$URL" -o "$TMPDIR/$FILENAME"
  else
    echo "$FILENAME already exists in $TMPDIR, skipping download."
  fi
done

# Start DuckDB and run the query
duckdb :memory: << EOF
COPY (
  SELECT *
  FROM read_parquet('$TMPDIR/*.parquet', union_by_name=true)
) TO STDOUT (FORMAT 'parquet', COMPRESSION 'gzip');
EOF
