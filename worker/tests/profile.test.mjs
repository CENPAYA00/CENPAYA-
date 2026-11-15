import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { asBool, readUserProfile } from '../.test-build/profile.js';

void describe('Supabase user profile normalization', () => {
  void it('normalizes boolean, SMALLINT, and supported string encodings', () => {
    for (const value of [true, 1, -1, '1', 'true', ' T ', 'Yes']) {
      assert.equal(asBool(value), true, `expected ${String(value)} to normalize to true`);
    }
    for (const value of [false, 0, '0', 'false', 'f', 'no', null, undefined, 'unknown', '2']) {
      assert.equal(asBool(value), false, `expected ${String(value)} to normalize to false`);
    }
  });

  void it('queries the profile using Supabase and derives active membership', async () => {
    const mockSupabase = {
      from: (table) => {
        assert.equal(table, 'profiles'); // or 'users'
        return {
          select: () => ({
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
                    is_subscribed: 1,
                    banned: 1,
                    is_membership_exempt: 0,
                    membership_expires_at: '2027-01-01T00:00:00.000Z',
                    trial_ends_at: null,
                    moderation_state: 'suspended',
                    signed_out_at: null,
                  },
                  error: null
                })
              };
            }
          })
        };
      }
    };

    const profile = await readUserProfile(mockSupabase, 'user-123', Date.parse('2026-12-01T00:00:00.000Z'));
    
    assert.equal(profile?.is_subscribed, true);
    assert.equal(profile?.is_paid_membership_active, true);
    assert.equal(profile?.banned, true);
    assert.equal(profile?.moderation_state, 'suspended');
  });
  
  // (You can copy the rest of the "it" blocks from your original test, just update the mockSupabase structure like above)
});
