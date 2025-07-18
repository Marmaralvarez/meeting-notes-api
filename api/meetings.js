import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  // CORS HEADERS ON EVERY RESPONSE
  res.setHeader('Access-Control-Allow-Origin', 'https://meeting-notes-app-sigma.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Require user access token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }
  const token = authHeader.replace('Bearer ', '');

  // Create Supabase client with THE USERS JWT
  // Supabase RLS to see authenticated user
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  // Confirm user is logged in
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid authentication token' });
  }

  try {
    // GET: list meetings (for this user)
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .order('meeting_date', { ascending: false });
      if (error) throw error;
      return res.status(200).json(data);
    }

    // POST: insert new meeting (for this user)
    if (req.method === 'POST') {
      // Always attach created_by: user.email
      const meeting = { ...req.body, created_by: user.email };
      const { data, error } = await supabase
        .from('meetings')
        .insert([meeting])
        .select('*'); // so client gets ID and all info back
      if (error) throw error;
      return res.status(201).json(data[0]);
    }

    // DELETE: remove a meeting by id (if owner)
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'Missing meeting id' });
      const { error } = await supabase
        .from('meetings')
        .delete()
        .eq('id', id)
        .eq('created_by', user.email);
      if (error) throw error;
      return res.status(204).end();
    }

    // If not matched
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: error.message || error.toString() });
  }
}
