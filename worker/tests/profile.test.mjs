import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { asBool, readUserProfile } from '../.test-build/profile.js';

void describe('Supabase user profile normalization', () => {
  void it('normalizes supported boolean encodings without accepting arbitrary strings', () => {
    for (const value of [true, 1, -1, '1', 'true', ' T ', 'Yes']) {
      assert.equal(asBool(value), true);
    }
    for (const value of [false, 0, '0', 'false', 'f', 'no', null, undefined, 'unknown', '2']) {
      assert.equal(asBool(value), false);
    }
  });

  void it('reads the existing public.users row and derives active membership', async () => {
    const mockSupabase = {
      from: (table) => {
        assert.equal(table, 'users');
        return {
          select: (columns) => {
            assert.match(columns, /id, email, role/);
            return {
              eq: (column, value) => {
                assert.equal(column, 'id');
                assert.equal(value, 'user-123');
                return {
                  single: async () => ({
                    data: {
                      id: 'user-123',
                      email: 'person@example.test',
                      role: 'user',
                      onboarding_completed: true,
                      is_subscribed: false,
                      banned: false,
                      is_membership_exempt: false,
                      membership_expires_at: '2027-01-01T00:00:00.000Z',
                      trial_ends_at: null,
                      moderation_state: 'active',
                      signed_out_at: null,
                    },
                    error: null,
                  }),
                };
              },
            };
          },
        };
      },
    };

    const profile = await readUserProfile(
      mockSupabase,
      'user-123',
      Date.parse('2026-12-01T00:00:00.000Z'),
    );

    assert.equal(profile?.id, 'user-123');
    assert.equal(profile?.is_subscribed, true);
    assert.equal(profile?.is_paid_membership_active, true);
    assert.equal(profile?.banned, false);
    assert.equal(profile?.moderation_state, 'active');
  });

  void it('returns null when the database cannot find the user', async () => {
    const mockSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: { message: 'not found' } }),
          }),
        }),
      }),
    };

    assert.equal(await readUserProfile(mockSupabase, 'missing-user'), null);
  });
});
