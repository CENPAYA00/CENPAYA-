import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkDatabaseHealth } from '../.test-build/database.js';

void describe('Supabase database health query', () => {
  void it('runs the health query and returns true on success', async () => {
    const result = await checkDatabaseHealth({
      from: (table) => ({
        select: async () => ({ data: [{ id: 1 }], error: null })
      })
    });
    assert.equal(result, true);
  });

  void it('returns false when Supabase returns an error', async () => {
    const result = await checkDatabaseHealth({
      from: (table) => ({
        select: async () => ({ data: null, error: new Error('simulated failure') })
      })
    });
    assert.equal(result, false);
  });

  void it('returns false for an unexpected empty result', async () => {
    const result = await checkDatabaseHealth({
      from: (table) => ({
        select: async () => ({ data: [], error: null })
      })
    });
    assert.equal(result, false);
  });
});
