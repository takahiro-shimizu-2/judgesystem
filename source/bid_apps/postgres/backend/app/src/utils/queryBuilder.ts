export class QueryBuilder {
  private whereClauses: string[] = [];
  private params: unknown[] = [];
  private paramIndex = 1;

  where(clause: string, value: unknown): this {
    this.whereClauses.push(clause.replace("?", `$${this.paramIndex}`));
    this.params.push(value);
    this.paramIndex++;
    return this;
  }

  whereIn(column: string, values: unknown[]): this {
    if (values.length === 0) return this;
    const placeholders = values.map((_, i) => `$${this.paramIndex + i}`).join(", ");
    this.whereClauses.push(`${column} IN (${placeholders})`);
    this.params.push(...values);
    this.paramIndex += values.length;
    return this;
  }

  build(): { whereClause: string; params: unknown[]; paramIndex: number } {
    const whereClause = this.whereClauses.length > 0
      ? `WHERE ${this.whereClauses.join(" AND ")}`
      : "";
    return { whereClause, params: this.params, paramIndex: this.paramIndex };
  }
}
