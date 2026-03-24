import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(1000).default(25),
});

export const evaluationFiltersSchema = paginationSchema.extend({
  statuses: z.string().optional(),
  workStatuses: z.string().optional(),
  priorities: z.string().optional(),
  categories: z.string().optional(),
  bidTypes: z.string().optional(),
  organizations: z.string().optional(),
  prefectures: z.string().optional(),
  searchQuery: z.string().max(200).optional(),
  sortField: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export type EvaluationFilters = z.infer<typeof evaluationFiltersSchema>;
