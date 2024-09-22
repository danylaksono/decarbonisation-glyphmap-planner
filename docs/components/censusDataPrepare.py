import duckdb
import pyarrow

# Create an in-memory DuckDB connection
con = duckdb.connect()

# Load the parquet files from the URLs and create tables in DuckDB
con.execute("""
    CREATE OR REPLACE TABLE pop AS
        SELECT *, 'pop' AS source
        FROM read_parquet('https://gicentre.github.io/data/census21/englandAndWales/pop.parquet');

    CREATE OR REPLACE TABLE deprivation AS
        SELECT *, 'deprivation' AS source
        FROM read_parquet('https://gicentre.github.io/data/census21/englandAndWales/deprivation.parquet');

    CREATE OR REPLACE TABLE vehicle AS
        SELECT *, 'vehicle' AS source
        FROM read_parquet('https://gicentre.github.io/data/census21/englandAndWales/vehicle.parquet');

    CREATE OR REPLACE TABLE heating AS
        SELECT *, 'heating' AS source
        FROM read_parquet('https://gicentre.github.io/data/census21/englandAndWales/heating.parquet');

    CREATE OR REPLACE TABLE health AS
        SELECT *, 'health' AS source
        FROM read_parquet('https://gicentre.github.io/data/census21/englandAndWales/health.parquet');
""")

# Now run the filtered query and join the tables as described in your SQL
result = con.execute("""
    -- Filter and aggregate the tables as described
    WITH filtered_pop AS (
        SELECT code, MAX(value) AS pop_value
        FROM pop
        GROUP BY code
    ),
    filtered_deprivation AS (
        SELECT code, value AS deprivation_value
        FROM deprivation
        WHERE category = 5
    ),
    filtered_vehicle AS (
        SELECT code, value AS vehicle_value
        FROM vehicle
        WHERE category = 0
    ),
    filtered_heating AS (
        SELECT code, value AS heating_value
        FROM heating
        WHERE category = 1
    ),
    filtered_health AS (
        SELECT code, value AS health_value
        FROM health
        WHERE category = 5
    )

    -- Join the filtered tables by 'code'
    SELECT 
        f_pop.code,
        f_pop.pop_value,
        f_deprivation.deprivation_value,
        f_vehicle.vehicle_value,
        f_heating.heating_value,
        f_health.health_value
    FROM filtered_pop f_pop
    LEFT JOIN filtered_deprivation f_deprivation ON f_pop.code = f_deprivation.code
    LEFT JOIN filtered_vehicle f_vehicle ON f_pop.code = f_vehicle.code
    LEFT JOIN filtered_heating f_heating ON f_pop.code = f_heating.code
    LEFT JOIN filtered_health f_health ON f_pop.code = f_health.code

    -- Order the result by deprivation_value
    ORDER BY f_deprivation.deprivation_value DESC;
""").fetchdf()

print(result)

# Convert the result to a Parquet file
con.execute("CREATE TABLE output_table AS SELECT * FROM result;")
con.execute("FROM result limit 10;")
con.execute("COPY output_table TO 'census_data_output.parquet' (FORMAT PARQUET);")

print("Data has been saved to census_data_output.parquet")
