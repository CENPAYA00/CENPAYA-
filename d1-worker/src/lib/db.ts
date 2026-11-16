
export async function getOne<T>(
  db: D1Database,
  sql: string,
  values: unknown[] = []
): Promise<T | null> {
  const statement = db.prepare(sql).bind(...values);

  return statement.first<T>();
}

export async function getMany<T>(
  db: D1Database,
  sql: string,
  values: unknown[] = []
): Promise<T[]> {
  const statement = db.prepare(sql).bind(...values);
  const result = await statement.all<T>();

  if (!result.success) {
    throw new Error("D1 query failed");
  }

  return result.results ?? [];
}

export async function execute(
  db: D1Database,
  sql: string,
  values: unknown[] = []
): Promise<void> {
  const statement = db.prepare(sql).bind(...values);
  const result = await statement.run();

  if (!result.success) {
    throw new Error("D1 database operation failed");
  }
}
