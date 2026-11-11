
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkDatabaseHealth } from '../.test-build/database.js';

void describe('Hyperdrive database health query', () => {
  void it('runs only the health query and closes the client', async () => {
    const calls = [];

    const result = await checkDatabaseHealth(
      'connection-string-must-not-be-logged',
      () => ({
        connect: async () => { calls.push('connect'); },
        query: async (sql) => {
          calls.push(sql);
          return { rows: [{ ok: 1 }] };
        },
        end: async () => { calls.push('end'); },
      })
    );

    assert.equal(result, true);
    assert.deepEqual(calls, ['connect', 'select 1 as ok', 'end']);
    assert.equal(
      calls.some(value => value.includes('connection-string-must-not-be-logged')),
      false
    );
  });

  void it('closes the client when the query fails', async () => {
    let closed = false;

    await assert.rejects(
      () => checkDatabaseHealth('unused', () => ({
        connect: async () => {},
        query: async () => {
          throw new Error('simulated database failure');
        },
        end: async () => { closed = true; },
      })),
      /simulated database failure/
    );

    assert.equal(closed, true);
  });

  void it('closes the client when connecting fails', async () => {
    let closed = false;

    await assert.rejects(
      () => checkDatabaseHealth('unused', () => ({
        connect: async () => {
          throw new Error('simulated connection failure');
        },
        query: async () => ({ rows: [{ ok: 1 }] }),
        end: async () => { closed = true; },
      })),
      /simulated connection failure/
    );

    assert.equal(closed, true);
  });

  void it('returns false for an unexpected health result', async () => {
    const result = await checkDatabaseHealth('unused', () => ({
      connect: async () => {},
      query: async () => ({ rows: [{ ok: 0 }] }),
      end: async () => {},
    }));

    assert.equal(result, false);
  });
});
