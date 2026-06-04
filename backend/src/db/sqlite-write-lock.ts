import { AsyncLocalStorage } from "node:async_hooks";

type SqliteWriteLockToken = symbol;

const sqliteWriteLockContext = new AsyncLocalStorage<SqliteWriteLockToken>();

let sqliteWriteQueue: Promise<void> = Promise.resolve();
let activeSqliteWriteLock: SqliteWriteLockToken | null = null;

async function acquireSqliteWriteLock(label: string): Promise<{
  token: SqliteWriteLockToken;
  release: () => void;
}> {
  const token = Symbol(label);
  let releaseCurrent!: () => void;
  const previous = sqliteWriteQueue;
  sqliteWriteQueue = new Promise<void>((resolve) => {
    releaseCurrent = resolve;
  });
  await previous;

  let released = false;
  activeSqliteWriteLock = token;
  return {
    token,
    release() {
      if (released) return;
      released = true;
      if (activeSqliteWriteLock === token) {
        activeSqliteWriteLock = null;
      }
      releaseCurrent();
    },
  };
}

export async function withSqliteWriteLock<T>(
  label: string,
  operation: () => T | Promise<T>,
): Promise<T> {
  const currentToken = sqliteWriteLockContext.getStore();
  if (currentToken && activeSqliteWriteLock === currentToken) {
    return await operation();
  }

  const lock = await acquireSqliteWriteLock(label);
  return await sqliteWriteLockContext.run(lock.token, async () => {
    try {
      return await operation();
    } finally {
      lock.release();
    }
  });
}
