exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
  try {
    const { email, password } = JSON.parse(event.body);
    if (!email || !password) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email and password required' }) };
    const SUPA_URL = process.env.SUPABASE_URL;
    const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;
    const authRes = await fetch(`${SUPA_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY },
      body: JSON.stringify({ email, password })
    });
    const authData = await authRes.json();
    if (!authRes.ok || authData.error) throw new Error(authData.error_description || authData.error || 'Invalid email or password');
    const token = authData.access_token;
    const userId = authData.user && authData.user.id;
    const profileRes = await fetch(`${SUPA_URL}/rest/v1/profiles?id=eq.${userId}&select=*`, {
      headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` }
    });
    const profiles = await profileRes.json();
    const profile = profiles[0] || { plan: 'solo', mode: 'trial', trial_start: new Date().toISOString(), generations_used: 0 };
    const trialDays = profile.trial_start
      ? Math.max(0, 14 - Math.floor((Date.now() - new Date(profile.trial_start).getTime()) / 86400000))
      : 14;
    const mode = (profile.mode === 'trial' && trialDays === 0) ? 'expired' : profile.mode;
    return { statusCode: 200, headers, body: JSON.stringify({
      token, plan: profile.plan, mode, trialDays,
      generationsUsed: profile.generations_used,
      email: profile.email || email,
      stripeCustomerId: profile.stripe_customer_id || null
    }) };
  } catch (err) {
    console.error('Login error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
