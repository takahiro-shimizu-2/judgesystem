import { Request, Response } from "express";
import { ContactService } from "../services/contactService";
import { logger } from "../utils/logger";
import { createContactSchema } from "../validators/contactSchemas";

export class ContactController {
  private service: ContactService;

  constructor() {
    this.service = new ContactService();
  }

  getList = async (_req: Request, res: Response): Promise<void> => {
    logger.info("GET /api/contacts hit");
    try {
      const contacts = await this.service.getList();
      res.setHeader("Content-Type", "application/json");
      res.status(200).json(contacts);
    } catch (error) {
      logger.error({ err: error }, "ERROR in GET /api/contacts");
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    logger.info({ id }, "GET /api/contacts/:id hit");

    try {
      const contact = await this.service.getById(id);
      if (!contact) {
        res.status(404).json({ error: "Contact not found" });
        return;
      }

      res.setHeader("Content-Type", "application/json");
      res.status(200).json(contact);
    } catch (error) {
      logger.error({ err: error, id }, "ERROR in GET /api/contacts/:id");
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  create = async (req: Request, res: Response): Promise<void> => {
    logger.info("POST /api/contacts hit");

    const parsed = createContactSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Bad Request", message: parsed.error.issues });
      return;
    }
    const { name, department, email, phone } = parsed.data;

    try {
      const contact = await this.service.create({ name, department, email, phone });
      res.setHeader("Content-Type", "application/json");
      res.status(201).json(contact);
    } catch (error) {
      logger.error({ err: error }, "ERROR in POST /api/contacts");
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    logger.info({ id }, "PATCH /api/contacts/:id hit");

    try {
      const contact = await this.service.update(id, req.body ?? {});
      if (!contact) {
        res.status(404).json({ error: "Contact not found" });
        return;
      }

      res.setHeader("Content-Type", "application/json");
      res.status(200).json(contact);
    } catch (error) {
      logger.error({ err: error, id }, "ERROR in PATCH /api/contacts/:id");
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };

  delete = async (req: Request, res: Response): Promise<void> => {
    if ((process.env.ENABLE_CONTACT_DELETE ?? "false").toLowerCase() !== "true") {
      res.status(403).json({
        error: "Contact deletion is currently disabled",
      });
      return;
    }

    const { id } = req.params;
    logger.info({ id }, "DELETE /api/contacts/:id hit");

    try {
      const deleted = await this.service.delete(id);
      if (!deleted) {
        res.status(404).json({ error: "Contact not found" });
        return;
      }

      res.status(204).send();
    } catch (error) {
      logger.error({ err: error, id }, "ERROR in DELETE /api/contacts/:id");
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  };
}
