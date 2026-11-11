import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { asBool, readUserProfile } from '../.test-build/profile.js';

void describe('Neon user profile normalization', () => {
  void it('normalizes boolean, SMALLINT, and supported string encodings', () => {
    for (const value of [true, 1, -1, '1', 'true', ' T ', 'Yes']) {
      assert.equal(asBool(value), true, `expected ${String(value)} to normalize to true`);
    }
    for (const value of [false, 0, '0', 'false', 'f', 'no', null, undefined, 'unknown', '2']) {
      assert.equal(asBool(value), false, `expected ${String(value)} to normalize to false`);
    }
  });

  void it('queries the profile using a parameter and derives active membership from expiry/exemption/trial', async () => {
    let capturedSql = '';
    let capturedValues: readonly unknown[] = [];
    const profile = await readUserProfile(async (sql, values) => {
      capturedSql = sql;
      capturedValues = values;
      return { rows: [{
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
      }] };
    }, 'user-123', Date.parse('2026-12-01T00:00:00.000Z'));

    assert.match(capturedSql, /where id = \$1/i);
    assert.deepEqual(capturedValues, ['user-123']);
    assert.equal(profile?.is_subscribed, true);
    assert.equal(profile?.is_paid_membership_active, true);
    assert.equal(profile?.banned, true);
    assert.equal(profile?.moderation_state, 'suspended');
  });

  void it('does not treat a stale SMALLINT subscription flag as active after expiry', async () => {
    const profile = await readUserProfile(async () => ({ rows: [{
      id: 'user-456', email: null, role: 'user', onboarding_completed: false,
      is_subscribed: 1, banned: 0, is_membership_exempt: false,
      membership_expires_at: '2025-01-01T00:00:00.000Z', trial_ends_at: null,
      moderation_state: 'active', signed_out_at: null,
    }] }), 'user-456', Date.parse('2026-01-01T00:00:00.000Z'));

    assert.equal(profile?.is_subscribed, false);
    assert.equal(profile?.is_paid_membership_active, false);
    assert.equal(profile?.banned, false);
  });

  void it('honors a current trial or exemption independently of paid membership', async () => {
    for (const [exempt, trialEnd] of [[true, null], [false, '2026-02-01T00:00:00.000Z']] as const) {
      const profile = await readUserProfile(async () => ({ rows: [{
        id: 'user-789', email: null, role: 'user', onboarding_completed: false,
        is_subscribed: 0, banned: null, is_membership_exempt: exempt,
        membership_expires_at: null, trial_ends_at: trialEnd,
        moderation_state: 'active', signed_out_at: null,
      }] }), 'user-789', Date.parse('2026-01-01T00:00:00.000Z'));
      assert.equal(profile?.is_subscribed, true);
      assert.equal(profile?.is_paid_membership_active, false);
    }
  });

  void it('treats malformed or expired expiry values as inactive', async () => {
    for (const expiry of ['not-a-date', '2026-01-01T00:00:00.000Z']) {
      const profile = await readUserProfile(async () => ({ rows: [{
        id: 'user-invalid-expiry', email: null, role: 'user', onboarding_completed: false,
        is_subscribed: 1, banned: 0, is_membership_exempt: 'false',
        membership_expires_at: expiry, trial_ends_at: null,
        moderation_state: 'active', signed_out_at: null,
      }] }), 'user-invalid-expiry', Date.parse('2026-01-01T00:00:00.000Z'));
      assert.equal(profile?.is_subscribed, false);
      assert.equal(profile?.is_paid_membership_active, false);
    }
  });
});
