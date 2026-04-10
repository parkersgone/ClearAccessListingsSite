exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
  try {
    const { token, subscriptionId } = JSON.parse(event.body);
    if (!token || !subscriptionId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields' }) };

    const SUPA_URL = process.env.SUPABASE_URL;
    const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;
    const stripeKey = process.env.stripekey;

    // Verify token is valid
    const userRes = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${token}` }
    });
    const userData = await userRes.json();
    if (!userRes.ok || userData.error) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };

    // Cancel at period end — they keep access until the billing period is up
    const res = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${stripeKey}` }
    });
    const cancelled = await res.json();
    if (cancelled.error) throw new Error(cancelled.error.message);

    // Mark as cancelled in Supabase
    await fetch(`${SUPA_URL}/rest/v1/profiles?id=eq.${userData.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ mode: 'cancelled', subscription_id: null })
    });

    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error('Cancel error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
