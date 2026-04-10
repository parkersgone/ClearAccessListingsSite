const PRICE_IDS = {
  solo:       { monthly: 'price_1TKPlJGEX11Cve8swlBU8DAM', annual: 'price_1TKPrXGEX11Cve8s5el4LmoU' },
  team:       { monthly: 'price_1TKPmaGEX11Cve8sEqx7JY4S', annual: 'price_1TKPskGEX11Cve8sBentDGX9' },
  enterprise: { monthly: 'price_1TKPoSGEX11Cve8sDfxWvUL7', annual: 'price_1TKPu0GEX11Cve8sHgwzg4Ju' }
};
const STRIPE_API = 'https://api.stripe.com/v1';

async function stripePost(path, params, key) {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString()
  });
  return res.json();
}

async function updateProfile(token, fields) {
  const SUPA_URL = process.env.SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPA_URL || !SUPA_KEY || !token) return;
  try {
    const u = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${token}` }
    });
    const ud = await u.json();
    if (!ud.id) return;
    await fetch(`${SUPA_URL}/rest/v1/profiles?id=eq.${ud.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Prefer': 'return=minimal' },
      body: JSON.stringify(fields)
    });
  } catch (e) { console.error('Supabase update failed:', e.message); }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' };

  try {
    const { mode, email, token, customerId, paymentMethodId, plan, billing } = JSON.parse(event.body);
    const key = process.env.stripekey;
    if (!key) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Stripe not configured' }) };

    // ── MODE: setup-intent ────────────────────────────────────────────────────
    // Called at signup: creates Stripe customer + SetupIntent, returns clientSecret
    // so the browser can confirm the card via Stripe.js (handles 3DS automatically)
    if (mode === 'setup-intent') {
      if (!email) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email required' }) };
      const customer = await stripePost('/customers', { email }, key);
      if (customer.error) throw new Error(customer.error.message);
      const si = await stripePost('/setup_intents', {
        customer: customer.id,
        'payment_method_types[]': 'card',
        'metadata[supabase_token]': token || ''
      }, key);
      if (si.error) throw new Error(si.error.message);
      // Save customer ID to Supabase immediately so it is not lost
      await updateProfile(token, { stripe_customer_id: customer.id });
      return { statusCode: 200, headers, body: JSON.stringify({ clientSecret: si.client_secret, customerId: customer.id }) };
    }

    // ── MODE: subscribe ───────────────────────────────────────────────────────
    // Called when user hits paywall: creates the actual subscription with 14-day trial.
    // Customer already exists with saved card from setup-intent step.
    if (mode === 'subscribe') {
      if (!customerId) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Customer ID required' }) };
      if (!PRICE_IDS[plan]) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid plan' }) };
      const priceId = PRICE_IDS[plan][billing === 'annual' ? 'annual' : 'monthly'];

      // If a new paymentMethodId was provided (user changed card), attach it
      if (paymentMethodId) {
        await stripePost(`/payment_methods/${paymentMethodId}/attach`, { customer: customerId }, key);
        await stripePost(`/customers/${customerId}`, { 'invoice_settings[default_payment_method]': paymentMethodId }, key);
      }

      const subscription = await stripePost('/subscriptions', {
        customer: customerId,
        'items[0][price]': priceId,
        trial_period_days: '14',
        'payment_settings[save_default_payment_method]': 'on_subscription',
        'expand[0]': 'latest_invoice.payment_intent'
      }, key);
      if (subscription.error) throw new Error(subscription.error.message);

      await updateProfile(token, { mode: 'active', plan, subscription_id: subscription.id });

      // Handle 3DS on trial start (rare but possible)
      const pi = subscription.latest_invoice && subscription.latest_invoice.payment_intent;
      if (pi && pi.status === 'requires_action') {
        return { statusCode: 200, headers, body: JSON.stringify({ requiresAction: true, clientSecret: pi.client_secret }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, subscriptionId: subscription.id }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid mode' }) };
  } catch (err) {
    console.error('Checkout error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
