import { AsyncLocalStorage } from 'node:async_hooks';

const governanceContextStorage = new AsyncLocalStorage();

export function runWithGovernanceContext(ctx, fn) {
  return governanceContextStorage.run(ctx || null, fn);
}

export function getActiveGovernanceContext() {
  return governanceContextStorage.getStore() || null;
}
