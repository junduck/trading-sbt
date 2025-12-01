import { z } from "zod";

export const BaseRequestSchema = z.object({
  action: z.string(),
  action_id: z.number(),
  params: z.unknown(),
});

export type BaseRequest = z.infer<typeof BaseRequestSchema>;
