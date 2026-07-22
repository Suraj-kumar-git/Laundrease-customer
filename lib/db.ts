import { Pool, PoolClient, QueryResult, QueryResultRow, types } from 'pg'

// Return DATE columns (oid 1082) as plain 'YYYY-MM-DD' strings instead of
// letting pg convert them to local-timezone Date objects, which when
// re-serialised as JSON become ISO timestamps that break downstream code
// expecting 'YYYY-MM-DD' (e.g. calculateEstimatedDeliveryDate).
types.setTypeParser(1082, (val: string) => val)

// Create a connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: false }
    : false,
  max: 10, // Maximum number of clients in the pool
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
})

// Log pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle database client', err)
  // process.exit(-1)
})

/**
 * Execute a query with parameterized values
 * @param text SQL query string
 * @param params Query parameters
 * @returns Query result
 */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const start = Date.now()
  try {
    const result = await pool.query<T>(text, params)
    const duration = Date.now() - start
    
    // Log slow queries in development
    if (process.env.NODE_ENV === 'development' && duration > 1000) {
      console.log('Slow query detected:', {
        text,
        duration,
        rows: result.rowCount,
      })
    }
    
    return result
  } catch (error) {
    console.error('Database query error:', {
      text,
      params,
      error,
    })
    throw error
  }
}

/**
 * Query and return a single row or null
 * @param text SQL query string
 * @param params Query parameters
 * @returns Single row or null
 */
export async function queryOne<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<T | null> {
  const result = await query<T>(text, params)
  return result.rows.length > 0 ? result.rows[0] : null
}

export async function queryWithUserContext<T extends QueryResultRow = any>(
  userId: string | number,
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const client = await pool.connect()
  try {
    await client.query(`SELECT set_config('app.current_user_id', $1, TRUE)`, [
      String(userId),
    ])
    return await client.query<T>(text, params)
  } finally {
    client.release()
  }
}
 
/**
* Transaction variant with user context — use when updating order status
* inside a multi-step transaction.
*/
export async function transactionWithUserContext<T>(
  userId: string | number,
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`SELECT set_config('app.current_user_id', $1, TRUE)`, [
      String(userId),
    ])
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

/**
 * Execute queries within a transaction
 * @param callback Async function that receives a client and executes queries
 * @returns Result from callback
 */
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect()
  
  try {
    await client.query('BEGIN')
    const result = await callback(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

/**
 * Get a client from the pool for manual transaction control
 * Don't forget to release the client when done!
 */
export async function getClient(): Promise<PoolClient> {
  return await pool.connect()
}

/**
 * Close all connections in the pool
 * Call this when shutting down the application
 */
export async function closePool(): Promise<void> {
  await pool.end()
}

// Export pool for advanced use cases
export { pool }