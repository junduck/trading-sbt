-- MariaDB initialization script for trading-sbt

-- Create sample OHLCV table
CREATE TABLE IF NOT EXISTS ohlcv_15m (
    symbol VARCHAR(20) NOT NULL,
    timestamp BIGINT NOT NULL,
    open DOUBLE,
    high DOUBLE,
    low DOUBLE,
    close DOUBLE,
    volume BIGINT,
    turnover DOUBLE,
    datetime_str VARCHAR(50),
    PRIMARY KEY (timestamp, symbol),
    INDEX idx_ohlcv_15m_symbol (symbol),
    INDEX idx_ohlcv_15m_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert sample data
INSERT IGNORE INTO ohlcv_15m (symbol, timestamp, open, high, low, close, volume, turnover, datetime_str)
VALUES
    ('AAPL', 1700000000, 150.0, 152.0, 149.5, 151.0, 1000000, 151000000.0, '2023-11-14 19:33:20'),
    ('AAPL', 1700000900, 151.0, 153.0, 150.5, 152.5, 1100000, 167750000.0, '2023-11-14 19:48:20'),
    ('MSFT', 1700000000, 350.0, 352.0, 349.0, 351.0, 500000, 175500000.0, '2023-11-14 19:33:20'),
    ('MSFT', 1700000900, 351.0, 353.0, 350.0, 352.0, 550000, 193600000.0, '2023-11-14 19:48:20');
