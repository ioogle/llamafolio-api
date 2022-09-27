import { Pool } from "pg";
import env from "../../env";

// See: https://gist.github.com/streamich/6175853840fb5209388405910c6cc04b
// connection details inherited from environment
const pool = new Pool({
  max: 1,
  min: 0,
  idleTimeoutMillis: 120000,
  connectionTimeoutMillis: 10000,
  host: env.DB_PGHOST,
  user: env.DB_PGUSER,
  database: env.DB_PGDATABASE,
  password: env.DB_PGPASSWORD,
  port: env.DB_PGPORT,
});

export default pool;
