exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
  try {
    const { email, password, firstName } = JSON.parse(event.body);
    if (!email || !password) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email and password required' }) };
    if (password.length < 8) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Password must be at least 8 characters' }) };

    const SUPA_URL = process.env.SUPABASE_URL;
    const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;

    const authRes = await fetch(`${SUPA_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` },
      body: JSON.stringify({ email, password })
    });
    const authData = await authRes.json();
    if (authData.error) throw new Error(authData.error.message || 'Signup failed');
    if (!authData.user) throw new Error('Email may already be in use');

    const userId = authData.user.id;
    const token = authData.access_token;

    await fetch(`${SUPA_URL}/rest/v1/profiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ id: userId, email, plan: 'solo', mode: 'trial', trial_start: new Date().toISOString(), generations_used: 0 })
    });

    return { statusCode: 200, headers, body: JSON.stringify({ token, plan: 'solo', mode: 'trial', trialDays: 14, generationsUsed: 0 }) };
  } catch (err) {
    console.error('Signup error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
