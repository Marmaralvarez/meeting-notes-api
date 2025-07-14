export default async function handler(req, res) {
  // Enable CORS for all domains
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const SUPABASE_FUNCTION_URL = 'https://quowetoinybkfxakmvkl.supabase.co/functions/v1/meetings-api';

  try {
    let url = `${SUPABASE_FUNCTION_URL}/meetings`;
    
    // Handle DELETE requests with ID
    if (req.method === 'DELETE' && req.query.id) {
      url = `${SUPABASE_FUNCTION_URL}/meetings/${req.query.id}`;
    }

    // Forward the request to your Supabase Edge Function
    const response = await fetch(url, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
    });

    const data = await response.json();
    
    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
