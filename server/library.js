import { CLOUD_MAX_BYTES, validateCloudSnapshot } from "../src/cloud/snapshot.ts";

export const LIBRARY_CHUNK_CHARACTERS = 250_000;
const emptyLibrary = () => ({ revision: 0, updatedAt: null, snapshot: { version: 1, boards: [] } });

function assertResults(results, expectedLength) {
  if (!Array.isArray(results) || results.length !== expectedLength
    || results.some(result => !result || result.success === false)) {
    throw new Error("The database did not complete the library transaction");
  }
}

export function splitLibraryPayload(payload) {
  const chunks = [];
  for (let offset = 0; offset < payload.length;) {
    let end = Math.min(offset + LIBRARY_CHUNK_CHARACTERS, payload.length);
    // Never leave an emoji's high surrogate in a different SQLite text row.
    const lastCodeUnit = payload.charCodeAt(end - 1);
    if (end < payload.length && lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff) end -= 1;
    chunks.push(payload.slice(offset, end));
    offset = end;
  }
  return chunks;
}

export async function readLibrary(db, userId) {
  // D1 batches run as one transaction: metadata and its chunks share a snapshot.
  const results = await db.batch([
    db.prepare("SELECT revision, generation, updated_at FROM account_library WHERE user_id = ?").bind(userId),
    db.prepare(`SELECT chunk_index, payload FROM library_chunks
      WHERE user_id = ? AND generation = (SELECT generation FROM account_library WHERE user_id = ?)
      ORDER BY chunk_index`).bind(userId, userId),
  ]);
  assertResults(results, 2);
  const manifests = results[0].results;
  const chunks = results[1].results;
  if (!Array.isArray(manifests) || !Array.isArray(chunks)) throw new Error("Invalid database result");
  if (manifests.length === 0) return emptyLibrary();
  const manifest = manifests[0];
  if (manifests.length !== 1 || !Number.isSafeInteger(manifest.revision) || manifest.revision < 1
    || typeof manifest.generation !== "string" || typeof manifest.updated_at !== "string"
    || chunks.length < 1 || chunks.some((chunk, index) => chunk.chunk_index !== index
      || typeof chunk.payload !== "string" || chunk.payload.length > LIBRARY_CHUNK_CHARACTERS)) {
    throw new Error("Incomplete cloud library");
  }
  const serialized = chunks.map(chunk => chunk.payload).join("");
  if (new TextEncoder().encode(serialized).byteLength > CLOUD_MAX_BYTES) throw new Error("Cloud library exceeds its limit");
  const parsed = validateCloudSnapshot(JSON.parse(serialized));
  if (!parsed.ok) throw new Error("Invalid cloud library");
  return { revision: manifest.revision, updatedAt: manifest.updated_at, snapshot: parsed.value };
}

export async function writeLibrary(db, userId, expectedRevision, snapshot) {
  const generation = globalThis.crypto.randomUUID();
  const updatedAt = new Date().toISOString();
  const chunks = splitLibraryPayload(JSON.stringify(snapshot));
  const guard = expectedRevision === 0
    ? db.prepare(`INSERT INTO account_library (user_id, revision, generation, updated_at)
      SELECT ?, 1, ?, ? WHERE NOT EXISTS (SELECT 1 FROM account_library WHERE user_id = ?)
      ON CONFLICT(user_id) DO NOTHING`).bind(userId, generation, updatedAt, userId)
    : db.prepare(`UPDATE account_library SET revision = revision + 1, generation = ?, updated_at = ?
      WHERE user_id = ? AND revision = ?`).bind(generation, updatedAt, userId, expectedRevision);
  const statements = [guard];
  for (const [index, payload] of chunks.entries()) {
    statements.push(db.prepare(`INSERT INTO library_chunks (user_id, generation, chunk_index, payload)
      SELECT ?, ?, ?, ? WHERE EXISTS
      (SELECT 1 FROM account_library WHERE user_id = ? AND generation = ?)`)
      .bind(userId, generation, index, payload, userId, generation));
  }
  statements.push(db.prepare(`DELETE FROM library_chunks WHERE user_id = ? AND generation <> ?
    AND EXISTS (SELECT 1 FROM account_library WHERE user_id = ? AND generation = ?)`)
    .bind(userId, generation, userId, generation));
  // The generation condition applies to every write and cleanup. A losing CAS
  // cannot insert stale chunks or remove the other device's winning generation.
  const results = await db.batch(statements);
  assertResults(results, statements.length);
  if (results[0].meta?.changes === 0) return { conflict: true, current: await readLibrary(db, userId) };
  if (results[0].meta?.changes !== 1) throw new Error("Unknown database commit result");
  return { conflict: false, current: { revision: expectedRevision + 1, updatedAt, snapshot } };
}
