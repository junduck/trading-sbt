#!/bin/bash

# Export some from cn_data.db to sample_data.db

SOURCE_DB="fixtures/cn_data.db"
TARGET_DB="fixtures/sample_data.db"

# Remove target database if it exists
rm -f "$TARGET_DB"

# Create the new database with schema and data
sqlite3 "$SOURCE_DB" <<EOF
-- Attach the new database
ATTACH DATABASE '$TARGET_DB' AS target;

-- Create the table structure in the new database
CREATE TABLE target.ohlcv_15m (
    symbol TEXT,
    timestamp INTEGER,
    open REAL,
    high REAL,
    low REAL,
    close REAL,
    volume INTEGER,
    turnover REAL,
    datetime_str TEXT
);

-- Create the same index
CREATE UNIQUE INDEX target.idx_ohlcv_15m_timestamp_symbol
    ON ohlcv_15m (timestamp, symbol);

-- Export data from last 160 unique timestamps 40 hr ~ 10 trading days
INSERT INTO target.ohlcv_15m
SELECT * FROM main.ohlcv_15m
WHERE timestamp IN (
    SELECT DISTINCT timestamp
    FROM ohlcv_15m
    ORDER BY timestamp DESC
    LIMIT 160
);

-- Detach the database
DETACH DATABASE target;
EOF

echo "Export complete!"

echo ""
echo "New sample database stats:"
sqlite3 "$TARGET_DB" "SELECT COUNT(*) as total_rows, COUNT(DISTINCT timestamp) as unique_timestamps FROM ohlcv_15m;"

echo ""
echo "Sample data from new database:"
sqlite3 "$TARGET_DB" "SELECT timestamp, symbol, open, close, volume FROM ohlcv_15m LIMIT 5;"
