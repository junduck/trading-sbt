import type { Position } from "@junduck/trading-core";
import {
  decodePosition,
  encodePosition,
  type PositionWire,
} from "@junduck/trading-core-serdes";

export const getPosition = {
  request: {},
  response: {
    encode: (res: Position) => {
      return encodePosition(res);
    },
    decode: (wire: PositionWire) => {
      return decodePosition(wire);
    },
  },
};
