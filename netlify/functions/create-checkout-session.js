// Netlify Function: create-checkout-session.js
// Handles Stripe checkout for Clear Access Listings
// Deploy to: /netlify/functions/create-checkout-session.js in your GitHub repo

const PRICE_IDS = {
  solo: {
    monthly: 'price_1TKPlJGEX11Cve8swlBU8DAM',
    annual:  'price_1TKPrXGEX11Cve8s5el4LmoU'
  },
  team: {
    monthly: 'price_1TKPmaGEX11Cve8sEqx7JY4S',
    annual:  'price_1TKPskGEX11Cve8sBentDGX9'
  },
  enterprise: {
    monthly: 'price_1TKPoSGEX11Cve8sDfxWvUL7',
    annual:  'price_1TKPu0GEX11Cve8sHgwzg4Ju'
  }
};

exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': 'https://clearaccesslistings.com',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  try {
    const { plan, billing } = JSON.parse(event.body);

    // Validate inputs
    if (!PRICE_IDS[plan]) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid plan' }) };
    }

    const priceId = PRICE_IDS[plan][billing === 'annual' ? 'annual' : 'monthly'];

    // Get Stripe secret key from Netlify environment variable
    const stripeKey = process.env.stripekey;
    if (!stripeKey) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Stripe not configured' }) };
    }

    // Call Stripe API directly (no SDK needed)
    const params = new URLSearchParams({
      'mode': 'subscription',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      'subscription_data[trial_period_days]': '14',
      'payment_method_collection': 'always',
      'payment_method_types[0]': 'card',  // Force card field — disables Link/wallet default
      'success_url': 'https://clearaccesslistings.com/app.html?subscribed=true',
      'cancel_url': 'https://clearaccesslistings.com/app.html?cancelled=true',
    });

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const session = await response.json();

    if (!response.ok) {
      throw new Error(session.error?.message || 'Stripe error');
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ url: session.url })
    };

  } catch (err) {
    console.error('Checkout error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
