exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
  try {
    const { token } = JSON.parse(event.body);
    if (!token) return { statusCode: 401, headers, body: JSON.stringify({ valid: false, error: 'No token' }) };
    const SUPA_URL = process.env.SUPABASE_URL;
    const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;
    const userRes = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${token}` }
    });
    const userData = await userRes.json();
    if (!userRes.ok || userData.error) return { statusCode: 401, headers, body: JSON.stringify({ valid: false, error: 'Session expired' }) };
    const profileRes = await fetch(`${SUPA_URL}/rest/v1/profiles?id=eq.${userData.id}&select=*`, {
      headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` }
    });
    const profiles = await profileRes.json();
    const profile = profiles[0] || { plan: 'solo', mode: 'trial', trial_start: new Date().toISOString(), generations_used: 0 };
    const trialDays = profile.trial_start
      ? Math.max(0, 14 - Math.floor((Date.now() - new Date(profile.trial_start).getTime()) / 86400000))
      : 14;
    const mode = (profile.mode === 'trial' && trialDays === 0) ? 'expired' : profile.mode;
    return { statusCode: 200, headers, body: JSON.stringify({
      valid: true, plan: profile.plan, mode, trialDays,
      generationsUsed: profile.generations_used,
      email: profile.email || userData.email || '',
      stripeCustomerId: profile.stripe_customer_id || null,
      subscriptionId: profile.subscription_id || null
    }) };
  } catch (err) {
    console.error('Session error:', err.message);
    return { statusCode: 401, headers, body: JSON.stringify({ valid: false, error: err.message }) };
  }
};
