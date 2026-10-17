import type { SqlValue, Statement } from './ports'

/**
 * A statement for the database: SQL with numbered placeholders (?1, ?2, ...) and the values they take,
 * in order. For example `sql('SELECT value FROM meta WHERE key = ?1', 'seed')`.
 */
export function sql(text: string, ...params: SqlValue[]): Statement {
  return { sql: text, params }
}
