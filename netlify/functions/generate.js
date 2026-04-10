exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' };
  try {
    const { prompt, system } = JSON.parse(event.body);
    const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
    if (!apiKey) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY is not set in Netlify environment variables' }) };
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 1500, system: system, messages: [{ role: 'user', content: prompt }] }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }
    const data = await response.json();
    if (!response.ok) {
      console.error('Anthropic error:', JSON.stringify(data));
      throw new Error(data.error?.message || 'Anthropic API error');
    }
    return { statusCode: 200, headers, body: JSON.stringify({ text: data.content[0].text }) };
  } catch (err) {
    console.error('Generate error:', err.message);
    const msg = err.name === 'AbortError' ? 'Request timed out - try again' : err.message;
    return { statusCode: 500, headers, body: JSON.stringify({ error: msg }) };
  }
};
