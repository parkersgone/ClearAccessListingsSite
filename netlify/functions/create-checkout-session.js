const PRICE_IDS = {
  solo:       { monthly: 'price_1TKPlJGEX11Cve8swlBU8DAM', annual: 'price_1TKPrXGEX11Cve8s5el4LmoU' },
  team:       { monthly: 'price_1TKPmaGEX11Cve8sEqx7JY4S', annual: 'price_1TKPskGEX11Cve8sBentDGX9' },
  enterprise: { monthly: 'price_1TKPoSGEX11Cve8sDfxWvUL7', annual: 'price_1TKPu0GEX11Cve8sHgwzg4Ju' }
};
const STRIPE_API = 'https://api.stripe.com/v1';

async function stripePost(path, params, stripeKey) {
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString()
  });
  return res.json();
}

async function updateSupabaseProfile(token, fields) {
  const SUPA_URL = process.env.SUPABASE_URL;
  const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPA_URL || !SUPA_KEY || !token) return;
  try {
    const userRes = await fetch(`${SUPA_URL}/auth/v1/user`, {
      headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${token}` }
    });
    if (!userRes.ok) return;
    const userData = await userRes.json();
    if (!userData.id) return;
    await fetch(`${SUPA_URL}/rest/v1/profiles?id=eq.${userData.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Prefer': 'return=minimal' },
      body: JSON.stringify(fields)
    });
  } catch (e) {
    console.error('Supabase update failed:', e.message);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } };
  }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' };
  try {
    const { plan, billing, paymentMethodId, customerId, email, mode, token } = JSON.parse(event.body);
    const stripeKey = process.env.stripekey;
    if (!stripeKey) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Stripe not configured' }) };

    // SAVE-CARD MODE: create customer at signup, no subscription yet
    if (mode === 'save-card' && paymentMethodId && email) {
      const customer = await stripePost('/customers', {
        email,
        payment_method: paymentMethodId,
        'invoice_settings[default_payment_method]': paymentMethodId
      }, stripeKey);
      if (customer.error) throw new Error(customer.error.message);
      await updateSupabaseProfile(token, { stripe_customer_id: customer.id });
      return { statusCode: 200, headers, body: JSON.stringify({ customerId: customer.id }) };
    }

    // ELEMENTS MODE: create subscription
    if (mode === 'elements' && email) {
      if (!PRICE_IDS[plan]) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid plan' }) };
      const priceId = PRICE_IDS[plan][billing === 'annual' ? 'annual' : 'monthly'];
      let customer;
      if (customerId) {
        // Use existing Stripe customer
        customer = { id: customerId };
      } else {
        // Create new customer from payment method
        if (!paymentMethodId) throw new Error('Payment method required');
        customer = await stripePost('/customers', {
          email,
          payment_method: paymentMethodId,
          'invoice_settings[default_payment_method]': paymentMethodId
        }, stripeKey);
        if (customer.error) throw new Error(customer.error.message);
      }
      const subscription = await stripePost('/subscriptions', {
        customer: customer.id,
        'items[0][price]': priceId,
        'trial_period_days': '14',
        'payment_settings[payment_method_types][0]': 'card',
        'payment_settings[save_default_payment_method]': 'on_subscription',
        'expand[0]': 'latest_invoice.payment_intent'
      }, stripeKey);
      if (subscription.error) throw new Error(subscription.error.message);
      await updateSupabaseProfile(token, {
        mode: 'active', plan, stripe_customer_id: customer.id, subscription_id: subscription.id
      });
      const paymentIntent = subscription.latest_invoice && subscription.latest_invoice.payment_intent;
      if (paymentIntent && paymentIntent.status === 'requires_action') {
        return { statusCode: 200, headers, body: JSON.stringify({ requiresAction: true, clientSecret: paymentIntent.client_secret }) };
      }
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, subscriptionId: subscription.id }) };
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request' }) };
  } catch (err) {
    console.error('Checkout error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
