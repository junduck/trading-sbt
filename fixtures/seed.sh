#!/bin/bash
set -e

# Seed PostgreSQL and MariaDB with data from sample_data.db

SOURCE_DB="${1:-fixtures/sample_data.db}"

if [ ! -f "$SOURCE_DB" ]; then
    echo "Error: Source database not found at $SOURCE_DB"
    echo "Run './fixtures/export_sample.sh' first to create sample data"
    exit 1
fi

echo "Seeding databases from $SOURCE_DB..."
echo ""

# Check if containers are running
if ! docker ps | grep -q trading-sbt-postgres; then
    echo "Error: PostgreSQL container not running. Run 'pnpm docker:up' first."
    exit 1
fi

if ! docker ps | grep -q trading-sbt-mariadb; then
    echo "Error: MariaDB container not running. Run 'pnpm docker:up' first."
    exit 1
fi

# Get row count
ROW_COUNT=$(sqlite3 "$SOURCE_DB" "SELECT COUNT(*) FROM ohlcv_15m;")
echo "Total rows to import: $ROW_COUNT"
echo ""

# Seed PostgreSQL
echo "Seeding PostgreSQL..."

# Clear existing data
docker exec trading-sbt-postgres psql -U trading -d trading -c "TRUNCATE TABLE ohlcv_15m;"

# Import CSV data
sqlite3 -separator '|' "$SOURCE_DB" "SELECT symbol, timestamp, open, high, low, close, volume, turnover, datetime_str FROM ohlcv_15m;" | \
docker exec -i trading-sbt-postgres psql -U trading -d trading -c "COPY ohlcv_15m (symbol, timestamp, open, high, low, close, volume, turnover, datetime_str) FROM STDIN WITH (FORMAT csv, DELIMITER '|');"

PG_COUNT=$(docker exec trading-sbt-postgres psql -U trading -d trading -tAc "SELECT COUNT(*) FROM ohlcv_15m;")
echo "✓ PostgreSQL loaded: $PG_COUNT rows"
echo ""

# Seed MariaDB
echo "Seeding MariaDB..."

# Clear existing data
docker exec trading-sbt-mariadb mariadb -u trading -ptrading123 trading -e "TRUNCATE TABLE ohlcv_15m;"

# Import CSV data via LOAD DATA
sqlite3 -separator '|' "$SOURCE_DB" "SELECT symbol, timestamp, open, high, low, close, volume, turnover, datetime_str FROM ohlcv_15m;" | \
docker exec -i trading-sbt-mariadb mariadb -u trading -ptrading123 trading --local-infile=1 -e "
SET SESSION sql_mode='';
LOAD DATA LOCAL INFILE '/dev/stdin'
INTO TABLE ohlcv_15m
FIELDS TERMINATED BY '|'
LINES TERMINATED BY '\n'
(symbol, timestamp, open, high, low, close, volume, turnover, datetime_str);
"

MARIA_COUNT=$(docker exec trading-sbt-mariadb mariadb -u trading -ptrading123 trading -sN -e "SELECT COUNT(*) FROM ohlcv_15m;")
echo "✓ MariaDB loaded: $MARIA_COUNT rows"
echo ""
