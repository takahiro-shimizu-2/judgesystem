export class QueryBuilder {
  private conditions: string[] = [];
  private params: unknown[] = [];
  private paramIndex = 1;

  where(column: string, operator: string, value: unknown): this {
    if (value === undefined || value === null || value === "") return this;
    this.conditions.push(`${column} ${operator} $${this.paramIndex}`);
    this.params.push(value);
    this.paramIndex++;
    return this;
  }

  whereIn(column: string, values: unknown[] | undefined): this {
    if (!values || values.length === 0) return this;
    const placeholders = values.map((_, i) => `$${this.paramIndex + i}`).join(", ");
    this.conditions.push(`${column} IN (${placeholders})`);
    this.params.push(...values);
    this.paramIndex += values.length;
    return this;
  }

  whereLike(column: string, value: string | undefined): this {
    if (!value) return this;
    this.conditions.push(`${column} ILIKE $${this.paramIndex}`);
    this.params.push(`%${value}%`);
    this.paramIndex++;
    return this;
  }

  build(): { clause: string; params: unknown[]; nextIndex: number } {
    const clause = this.conditions.length > 0
      ? "WHERE " + this.conditions.join(" AND ")
      : "";
    return { clause, params: this.params, nextIndex: this.paramIndex };
  }
}
