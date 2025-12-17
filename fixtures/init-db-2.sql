CREATE TABLE table1 (
  timestamp INTEGER NOT NULL,
  symbol TEXT NOT NULL,
  price REAL NOT NULL,
  volume INTEGER NOT NULL
);

-- table1: epochs 1006-1008, symbols X, Y
INSERT INTO table1 (timestamp, symbol, price, volume) VALUES
  (1006, 'X', 56.0, 800),
  (1006, 'Y', 66.0, 900),
  (1007, 'X', 57.0, 850),
  (1007, 'Y', 67.0, 950),
  (1008, 'X', 58.0, 900),
  (1008, 'Y', 68.0, 1000);
