import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(1000).default(25),
});

export const evaluationFilterSchema = paginationSchema.extend({
  statuses: z.union([z.string().transform(s => s.split(",")), z.array(z.string())]).optional(),
  workStatuses: z.union([z.string().transform(s => s.split(",")), z.array(z.string())]).optional(),
  priorities: z.union([z.string().transform(s => s.split(",")), z.array(z.string())]).optional(),
  categories: z.union([z.string().transform(s => s.split(",")), z.array(z.string())]).optional(),
  bidTypes: z.union([z.string().transform(s => s.split(",")), z.array(z.string())]).optional(),
  organizations: z.union([z.string().transform(s => s.split(",")), z.array(z.string())]).optional(),
  prefectures: z.union([z.string().transform(s => s.split(",")), z.array(z.string())]).optional(),
  searchQuery: z.string().optional().default(""),
  sortField: z.string().optional().default(""),
  sortOrder: z.enum(["asc", "desc"]).optional().default("asc"),
  ordererId: z.string().optional(),
});

export const workStatusUpdateSchema = z.object({
  workStatus: z.enum(["not_started", "in_progress", "completed"]),
  currentStep: z.number().int().optional(),
});

export const assigneeUpdateSchema = z.object({
  stepId: z.string().min(1, "stepId is required"),
  contactId: z.string().nullable().optional(),
});
