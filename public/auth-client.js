/* BiteShark Standalone Authentication Client Bridge
 *
 * Replaces Hatchable's browser auth dependency with real same-origin HTTP requests
 * to `/api/auth/{start,verify,session,logout}` backed by HttpOnly `__Host-truckly_session`
 * cookies (preserved internal cookie name for same-origin session continuity) and PostgreSQL session records.
 *
 * Security & Scope Guarantees:
 *   - Never fabricates or caches unverified client-side sessions.
 *   - Passkeys (WebAuthn) are explicitly disabled/deferred (`supportsPasskeys() === false`)
 *     until origin-bound production RP ID configuration is finalized.
 */
(function () {
  'use strict';

  if (typeof window === 'undefined') return;
  if (window.hatchable && window.hatchable.auth) return;

  var AUTH_CLIENT_HEADER = 'web-auth-v1';

  async function postAuthJson(path, payload) {
    var res = await fetch('/api/auth/' + path, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'X-BiteShark-Client': AUTH_CLIENT_HEADER
      },
      body: JSON.stringify(payload || {})
    });
    var data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok) {
      var err = new Error(data.error || 'Authentication request failed.');
      err.status = res.status;
      err.code = data.code || null;
      throw err;
    }
    return data;
  }

  var standaloneAuthClient = {
    async startLogin(opts) {
      var o = opts || {};
      var payload = {
        email: typeof o.email === 'string' ? o.email.trim() : ''
      };
      if (typeof o.intent === 'string' && o.intent.trim()) {
        payload.intent = o.intent.trim();
      }
      if (typeof o.dob === 'string' && o.dob.trim()) {
        payload.dob = o.dob.trim();
      }
      if (o.dob_year !== undefined) payload.dob_year = o.dob_year;
      if (o.dob_month !== undefined) payload.dob_month = o.dob_month;
      if (o.dob_day !== undefined) payload.dob_day = o.dob_day;
      return postAuthJson('start', payload);
    },

    async submitAgeAssessment(opts) {
      var o = opts || {};
      var payload = {};
      if (typeof o.dob === 'string' && o.dob.trim()) {
        payload.dob = o.dob.trim();
      }
      if (o.dob_year !== undefined) payload.dob_year = o.dob_year;
      if (o.dob_month !== undefined) payload.dob_month = o.dob_month;
      if (o.dob_day !== undefined) payload.dob_day = o.dob_day;
      return postAuthJson('age-assessment', payload);
    },

    async verifyCode(opts) {
      var email = opts && typeof opts.email === 'string' ? opts.email.trim() : '';
      var code = opts && typeof opts.code === 'string' ? opts.code.trim() : '';
      return postAuthJson('verify', { email: email, code: code });
    },

    async getUser() {
      var res = await fetch('/api/auth/session', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store'
      });
      if (!res.ok) return null;
      var data = await res.json().catch(function () {
        return null;
      });
      if (data && data.authenticated === true && data.user && typeof data.user.id === 'string') {
        return data.user;
      }
      return null;
    },

    async signOut() {
      return postAuthJson('logout', {});
    },

    async logout() {
      return postAuthJson('logout', {});
    },

    supportsPasskeys() {
      return false;
    },

    async signInWithPasskey() {
      throw new Error('Passkey sign-in is unavailable in standalone staging. Use a 6-digit email verification code.');
    },

    async registerPasskey() {
      throw new Error('Passkey registration is unavailable in standalone staging.');
    }
  };

  window.bitesharkAuth = standaloneAuthClient;
  window.trucklyAuth = standaloneAuthClient;
  window.hatchable = Object.assign({}, window.hatchable || {}, {
    auth: standaloneAuthClient
  });
})();
