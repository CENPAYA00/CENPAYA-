import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkDatabaseHealth } from '../.test-build/database.js';

void describe('Supabase database health query', () => {
  // Helper to mock the Supabase query builder chain
  const createMockSupabase = (error = null, data = [{ id: 1 }]) => ({
    from: () => ({
      select: () => ({
        limit: () => ({
          abortSignal: async () => ({ data, error })
        })
      })
    })
  });

  void it('runs the health query and returns true on success', async () => {
    const result = await checkDatabaseHealth(createMockSupabase(null, [{ id: 1 }]));
    assert.equal(result, true);
  });

  void it('returns false when Supabase returns an error', async () => {
    const result = await checkDatabaseHealth(createMockSupabase(new Error('simulated failure')));
    assert.equal(result, false);
  });
});
