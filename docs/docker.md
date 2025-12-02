# Docker Setup

Docker Compose configuration for PostgreSQL and MariaDB databases for development and testing environment.

## Services

### PostgreSQL

- **Image**: `postgres:17-alpine`
- **Port**: 5432
- **Database**: `trading`
- **User**: `trading`
- **Password**: `trading123`

### MariaDB

- **Image**: `mariadb:11-ubi`
- **Port**: 3306
- **Database**: `trading`
- **User**: `trading`
- **Password**: `trading123`
- **Root Password**: `root123`

## Quick Start

### Start databases

```bash
pnpm docker:up
```

### Stop databases

```bash
pnpm docker:down
```

### View logs

```bash
pnpm docker:logs
```

### Restart services

```bash
pnpm docker:restart
```

### Clean up (removes volumes)

```bash
pnpm docker:clean
```

## Using with Examples

### PostgreSQL Example

```bash
# Start PostgreSQL
pnpm docker:up postgres

# Run server with PostgreSQL config
CONFIG_FILE=config.postgres.json pnpm example:server
```

```json
{
  "type": "postgres",
  "conn": "tcp",
  "host": "localhost",
  "port": 5432,
  "database": "trading",
  "schema": "public",
  "username": "trading",
  "password": "trading123",
  "mapping": {
    "symbolColumn": "symbol",
    "epochColumn": "timestamp",
    "priceColumn": "close",
    "epochUnit": "s",
    "timezone": "UTC"
  }
}
```

### MariaDB Example

```bash
# Start MariaDB
pnpm docker:up mariadb

# Run server with MariaDB config
CONFIG_FILE=config.mariadb.json pnpm example:server
```

## Data Initialization

Both databases are initialized with sample OHLCV data on first startup:

- PostgreSQL: [fixtures/init-postgres.sql](../fixtures/init-postgres.sql)
- MariaDB: [fixtures/init-mariadb.sql](../fixtures/init-mariadb.sql)

The sample table schema:

```sql
CREATE TABLE IF NOT EXISTS ohlcv_15m (
    symbol TEXT NOT NULL,
    timestamp BIGINT NOT NULL,
    open DOUBLE PRECISION,
    high DOUBLE PRECISION,
    low DOUBLE PRECISION,
    close DOUBLE PRECISION,
    volume BIGINT,
    turnover DOUBLE PRECISION,
    datetime_str TEXT,
    PRIMARY KEY (timestamp, symbol)
);

CREATE INDEX IF NOT EXISTS idx_ohlcv_15m_symbol ON ohlcv_15m (symbol);
CREATE INDEX IF NOT EXISTS idx_ohlcv_15m_timestamp ON ohlcv_15m (timestamp);
```

## Connecting to Databases

### PostgreSQL

```bash
docker exec -it trading-sbt-postgres psql -U trading -d trading
```

### MariaDB

```bash
docker exec -it trading-sbt-mariadb mariadb -u trading -ptrading123 trading
```

## Data Persistence

Database data is persisted in Docker volumes:

- `postgres_data`
- `mariadb_data`

To completely reset databases, use:

```bash
pnpm docker:clean
pnpm docker:up
```
