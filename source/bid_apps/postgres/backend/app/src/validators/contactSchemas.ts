import { z } from "zod";

export const createContactSchema = z.object({
  name: z.string().min(1).max(100),
  department: z.string().min(1).max(100),
  email: z.string().email().max(254),
  phone: z.string().min(1).max(20),
});

export const updateContactSchema = createContactSchema.partial();
