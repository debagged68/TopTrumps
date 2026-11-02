import { sqliteTable, text } from 'drizzle-orm/sqlite-core';
export const rounds = sqliteTable('rounds', { id: text('id').primaryKey(), state: text('state').notNull() });
