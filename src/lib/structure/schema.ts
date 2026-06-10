import { z } from "zod";
import { locationTypeEnum } from "@/lib/validators";

export const MAX_STRUCTURE_DEPTH = 4;
export const MAX_STRUCTURE_NODES = 200;

// A node the LLM proposes. `count` replicates the node (and its subtree) N times,
// e.g. count:2 hoophouse → "Hoop House 1", "Hoop House 2". Children nest inside.
export type StructureNode = {
  type: z.infer<typeof locationTypeEnum>;
  name: string;
  count?: number | null;
  children?: StructureNode[] | null;
};

export const structureNodeSchema: z.ZodType<StructureNode> = z.lazy(() =>
  z.object({
    type: locationTypeEnum,
    name: z.string().min(1),
    count: z.number().int().min(1).max(50).nullable().optional(),
    children: z.array(structureNodeSchema).nullable().optional(),
  }),
);

export const structureSpecSchema = z.object({
  nodes: z.array(structureNodeSchema).min(1),
  // One short line the agent can say back to the grower, e.g. a clarifying note.
  summary: z.string().nullable().optional(),
});

export type StructureSpec = z.infer<typeof structureSpecSchema>;

export const structureParseRequestSchema = z.object({
  rawText: z.string().min(1),
});
