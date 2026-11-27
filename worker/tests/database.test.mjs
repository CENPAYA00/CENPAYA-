import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkDatabaseHealth, runDatabaseMaintenance } from '../.test-build/database.js';

void describe('Supabase database maintenance monitor', () => {
  const createMockSupabase = (error = null, data = [{ code: 'XAF' }]) => ({
    from: () => ({
      select: () => ({
        limit: () => ({
          abortSignal: async () => ({ data, error })
        })
      })
    })
  });

  void it('reports a successful read-only database check', async () => {
    const result = await checkDatabaseHealth(createMockSupabase());
    assert.equal(result, true);
  });

  void it('reports a failed database check without throwing', async () => {
    const result = await checkDatabaseHealth(createMockSupabase(new Error('simulated failure')));
    assert.equal(result, false);
  });

  void it('emits a structured successful maintenance report', async () => {
    const report = await runDatabaseMaintenance(createMockSupabase());
    assert.equal(report.task, 'supabase_database_maintenance');
    assert.equal(report.status, 'ok');
    assert.equal(report.checks.length, 1);
    assert.equal(report.checks[0].name, 'database_read_access');
    assert.equal(report.checks[0].status, 'ok');
    assert.equal(typeof report.checkedAt, 'string');
    assert.equal(typeof report.checks[0].durationMs, 'number');
  });

  void it('emits a structured failed maintenance report', async () => {
    const report = await runDatabaseMaintenance(createMockSupabase(new Error('simulated failure')));
    assert.equal(report.status, 'failed');
    assert.equal(report.checks[0].status, 'failed');
  });
});
