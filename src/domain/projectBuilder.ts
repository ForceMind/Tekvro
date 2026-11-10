import { z } from "zod";

/** Observed Builder exit and cleanup facts; neither completion nor prose establishes acceptance. */
export const projectBuilderResultSchema = z.strictObject({
  status: z.enum(["completed", "failed", "cancelled", "interrupted"]),
  exit_code: z.number().int().nullable(),
  session_id: z.string().nullable(),
  stdout: z.string(),
  stderr: z.string(),
  observed_tokens: z.number().int().safe().nonnegative().nullable(),
  cleanup_status: z.enum(["complete", "incomplete", "unknown"]),
  limitations: z.array(z.string()).readonly(),
});

/** One returned observation, independent of whether its receipt was successfully published. */
export type ProjectBuilderResult = Readonly<
  z.infer<typeof projectBuilderResultSchema>
>;
