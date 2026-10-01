import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** One current generation per trusted account. Old generations are removed atomically. */
export const accountLibrary = sqliteTable("account_library", {
  userId: text("user_id").primaryKey().notNull(),
  revision: integer("revision").notNull(),
  generation: text("generation").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** Small rows keep large editable board libraries below D1's per-row limit. */
export const libraryChunks = sqliteTable("library_chunks", {
  userId: text("user_id").notNull(),
  generation: text("generation").notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  payload: text("payload").notNull(),
}, table => [primaryKey({ columns: [table.userId, table.generation, table.chunkIndex] })]);
