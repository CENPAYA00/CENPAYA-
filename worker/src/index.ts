import { createClient } from '@supabase/supabase-js';
import {
  corsHeaders,
  jsonResponse,
  originAllowed,
  readJsonObject,
} from './http-utils';
import { checkDatabaseHealth } from './database';
import { readUserProfile } from './profile';

interface Env {
  CENPAYA_ORIGIN: string;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const headers = corsHeaders(request, env.CENPAYA_ORIGIN);
    const url = new URL(request.url);

    if (!originAllowed(request, env.CENPAYA_ORIGIN)) {
      return jsonResponse({ error: 'origin_not_allowed' }, 403, headers);
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers });
    }

    if (url.pathname === '/healthz' && request.method === 'GET') {
      return jsonResponse({ status: 'ok' }, 200, headers);
    }

    // Initialize Supabase Admin Client (bypasses RLS for backend logic)
    const supabaseAdmin = createClient(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );

    if (url.pathname === '/api/v1/me' && request.method === 'GET') {
      try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return jsonResponse({ error: 'unauthorized' }, 401, headers);
        }
        
        const token = authHeader.split(' ')[1];

        // Verify the existing Supabase bearer token
        const supabaseAuth = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
        const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);

        if (authError || !user) {
          return jsonResponse({ error: 'unauthorized' }, 401, headers);
        }

        // Fetch the user profile using the verified user ID
        const profile = await readUserProfile(supabaseAdmin, user.id);

        if (!profile) {
          return jsonResponse({ error: 'profile_not_found' }, 404, headers);
        }

        return jsonResponse(
          {
            user: {
              id: user.id,
              email: user.email,
            },
            profile,
          },
          200,
          headers,
        );
      } catch (err) {
        return jsonResponse({ error: 'profile_unavailable' }, 503, headers);
      }
    }

    if (url.pathname === '/api/v1/healthz/db' && request.method === 'GET') {
      try {
        const healthy = await checkDatabaseHealth(supabaseAdmin);
        return jsonResponse(
          { status: healthy ? 'ok' : 'unavailable' },
          healthy ? 200 : 503,
          headers,
        );
      } catch {
        return jsonResponse({ status: 'unavailable' }, 503, headers);
      }
    }

    if (url.pathname.startsWith('/api/')) {
      return jsonResponse({ error: 'not_implemented' }, 501, headers);
    }

    return jsonResponse({ error: 'not_found' }, 404, headers);
  },
} satisfies ExportedHandler<Env>;
