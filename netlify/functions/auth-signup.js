exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS" } };
  }
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" };
  try {
    const { email, password, firstName } = JSON.parse(event.body);
    if (!email || !password) return { statusCode: 400, headers, body: JSON.stringify({ error: "Email and password required" }) };
    if (password.length < 8) return { statusCode: 400, headers, body: JSON.stringify({ error: "Password must be at least 8 characters" }) };

    const SUPA_URL = process.env.SUPABASE_URL;
    const SUPA_KEY = process.env.SUPABASE_SERVICE_KEY;

    // Use admin endpoint so user is auto-confirmed, no email verification needed
    const adminRes = await fetch(, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPA_KEY, "Authorization":  },
      body: JSON.stringify({ email, password, email_confirm: true })
    });
    const adminData = await adminRes.json();
    if (!adminRes.ok || adminData.error) throw new Error(adminData.msg || adminData.error || "Signup failed");

    const userId = adminData.id;

    // Now sign in to get a token
    const authRes = await fetch(, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPA_KEY },
      body: JSON.stringify({ email, password })
    });
    const authData = await authRes.json();
    if (!authRes.ok || authData.error) throw new Error(authData.error_description || "Login after signup failed");

    const token = authData.access_token;

    // Create profile
    await fetch(, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPA_KEY, "Authorization": , "Prefer": "return=minimal" },
      body: JSON.stringify({ id: userId, email, plan: "solo", mode: "trial", trial_start: new Date().toISOString(), generations_used: 0 })
    });

    return { statusCode: 200, headers, body: JSON.stringify({ token, plan: "solo", mode: "trial", trialDays: 14, generationsUsed: 0 }) };
  } catch (err) {
    console.error("Signup error:", err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
