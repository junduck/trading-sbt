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

-- table0: epochs 1003-1005, symbols A, B
INSERT INTO table0 (timestamp, symbol, price, volume) VALUES
  (1003, 'A', 103.0, 1300),
  (1003, 'B', 203.0, 2300),
  (1004, 'A', 104.0, 1400),
  (1004, 'B', 204.0, 2400),
  (1005, 'A', 105.0, 1500),
  (1005, 'B', 205.0, 2500);

-- table1: epochs 1003-1005, symbols X, Y
INSERT INTO table1 (timestamp, symbol, price, volume) VALUES
  (1003, 'X', 53.0, 650),
  (1003, 'Y', 63.0, 750),
  (1004, 'X', 54.0, 700),
  (1004, 'Y', 64.0, 800),
  (1005, 'X', 55.0, 750),
  (1005, 'Y', 65.0, 850);
