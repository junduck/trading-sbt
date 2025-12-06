import { z } from "zod";

// Wire format - uses epoch ms for timestamps
export const RequestWireSchema = z.object({
  method: z.string(), // request method

  id: z.number(),
  cid: z.string().optional(),

  params: z.unknown(), // params will be validated per action
});

export const ResponseWireSchema = z.object({
  type: z.enum(["result", "error", "event"]),

  id: z.number().optional(),
  cid: z.string().optional(),

  result: z.unknown().optional(),
  event: z.unknown().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
});

export type EventType = "market" | "order" | "metrics" | "external";

export type RequestWire = z.infer<typeof RequestWireSchema>;
export type ResponseWire = z.infer<typeof ResponseWireSchema>;
