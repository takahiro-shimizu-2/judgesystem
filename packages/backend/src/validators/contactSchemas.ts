import { z } from "zod";

export const createContactSchema = z.object({
  name: z.string().min(1, "name is required"),
  department: z.string().min(1, "department is required"),
  email: z.string().email("invalid email format"),
  phone: z.string().min(1, "phone is required"),
});

export const updateContactSchema = z.object({
  name: z.string().min(1).optional(),
  department: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().min(1).optional(),
});
