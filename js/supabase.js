// Supabase configuration
const SUPABASE_URL = 'https://nxastrezgmowxpnptvzj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_TNpzqw2Ar5FD0C2CPv7ysw_ij4RnCxA';

// Create Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export { supabase };
