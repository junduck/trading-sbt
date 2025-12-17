CREATE TABLE table0 (
  timestamp INTEGER NOT NULL,
  symbol TEXT NOT NULL,
  price REAL NOT NULL,
  volume INTEGER NOT NULL
);

CREATE TABLE table1 (
  timestamp INTEGER NOT NULL,
  symbol TEXT NOT NULL,
  price REAL NOT NULL,
  volume INTEGER NOT NULL
);

-- table0: epochs 1000-1002, symbols A, B
INSERT INTO table0 (timestamp, symbol, price, volume) VALUES
  (1000, 'A', 100.0, 1000),
  (1000, 'B', 200.0, 2000),
  (1001, 'A', 101.0, 1100),
  (1001, 'B', 201.0, 2100),
  (1002, 'A', 102.0, 1200),
  (1002, 'B', 202.0, 2200);

-- table1: epochs 1000-1002, symbols X, Y
INSERT INTO table1 (timestamp, symbol, price, volume) VALUES
  (1000, 'X', 50.0, 500),
  (1000, 'Y', 60.0, 600),
  (1001, 'X', 51.0, 550),
  (1001, 'Y', 61.0, 650),
  (1002, 'X', 52.0, 600),
  (1002, 'Y', 62.0, 700);
