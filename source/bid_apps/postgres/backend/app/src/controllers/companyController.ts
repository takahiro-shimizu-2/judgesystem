import { Request, Response } from "express";
import { PoolClient } from "pg";
import QueryStream from "pg-query-stream";
import { pool, schemaPrefix } from "../config/database";

export class CompanyController {
  private buildCompaniesQuery(): string {
    const companyTable = `${schemaPrefix}company_master`;
    const officeTable = `${schemaPrefix}office_master`;

    return `
      WITH branches AS (
        SELECT
          company_no,
          jsonb_agg(
            jsonb_build_object(
              'name', COALESCE(office_name, ''),
              'address', COALESCE(office_address, '')
            ) ORDER BY office_no
          ) AS branches
        FROM ${officeTable}
        GROUP BY company_no
      )
      SELECT
        concat('com-', comp.company_no::text) AS id,
        comp.company_no::integer AS no,
        COALESCE(comp.company_name, '') AS name,
        COALESCE(comp.company_address, '') AS address,
        'A' AS grade,
        5 AS priority,
        COALESCE(comp.telephone, '') AS phone,
        '' AS email,
        '' AS fax,
        NULL::text AS "postalCode",
        COALESCE(comp.name_of_representative, '') AS representative,
        COALESCE(comp.establishment_date::text, '') AS established,
        (
          CASE
            WHEN TRIM(comp.capital::text) ~ '^[0-9]+(\\.[0-9]+)?$'
              THEN TRIM(comp.capital::text)::numeric
            ELSE 0::numeric
          END
        )::double precision AS capital,
        0::integer AS "employeeCount",
        COALESCE(br.branches, '[]'::jsonb) AS branches,
        '[]'::jsonb AS certifications
      FROM ${companyTable} comp
      LEFT JOIN branches br
        ON br.company_no = comp.company_no
      ORDER BY comp.company_no
    `;
  }

  getList = async (_req: Request, res: Response) => {
    console.log("GET /api/companies hit");

    let client: PoolClient | undefined;
    let stream: QueryStream | undefined;
    try {
      client = await pool.connect();

      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-cache");

      res.write("[");
      let firstRow = true;

      stream = client.query(new QueryStream(this.buildCompaniesQuery()));

      const finishResponse = () => {
        if (!res.writableEnded) {
          res.write("]");
          res.end();
        }
      };

      const releaseClient = () => {
        if (client) {
          client.release();
          client = undefined;
        }
      };

      stream.on("data", (row: unknown) => {
        if (!firstRow) {
          res.write(",");
        }
        res.write(JSON.stringify(row));
        firstRow = false;
      });

      stream.on("error", (err: Error) => {
        console.error("ERROR in GET /api/companies stream:", err);
        if (!res.headersSent) {
          res.status(500).json({
            error: "Internal Server Error",
            message: err.message,
          });
        } else {
          finishResponse();
        }
        stream?.destroy();
        releaseClient();
      });

      stream.on("end", () => {
        finishResponse();
        releaseClient();
      });

      res.on("close", () => {
        stream?.destroy();
        releaseClient();
      });
    } catch (error) {
      console.error("ERROR in GET /api/companies:", error);
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
      if (stream && !stream.destroyed) {
        stream.destroy();
      }
      if (client) {
        client.release();
        client = undefined;
      }
    }
  };
}
