import { Client } from 'pg';

type QueryClient = Pick<Client, 'connect' | 'query' | 'end'>;
type ClientFactory = (connectionString: string) => QueryClient;

const HEALTH_QUERY = 'select 1 as ok';
const DB_TIMEOUT_MS = 5_000;

/** Execute only the constant health query through the existing Hyperdrive binding. */
export async function checkDatabaseHealth(
  connectionString: string,
  createClient: ClientFactory = (value) => new Client({
    connectionString: value,
    connectionTimeoutMillis: DB_TIMEOUT_MS,
    query_timeout: DB_TIMEOUT_MS,
    statement_timeout: DB_TIMEOUT_MS,
  }),
): Promise<boolean> {
  const client = createClient(connectionString);
  try {
    await client.connect();
    const result = await client.query<{ ok: number }>(HEALTH_QUERY);
    return result.rows[0]?.ok === 1;
  } finally {
    await client.end().catch(() => undefined);
  }
}
