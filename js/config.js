// Public configuration. The Supabase publishable key is safe to ship in the client
// ONLY because Row Level Security is enabled (see supabase/schema.sql).
export const config = {
  appVersion: '5.2.0',
  supabaseUrl: 'https://kzbfndtzcrnmqvbhkxmf.supabase.co',
  supabaseKey: 'sb_publishable_Iz1yza7ZokWP480Z9Q7XdA_JEIHGQ4v',
  // Pinned version. For maximum safety, download this file into js/vendor/ and point to it here.
  supabaseModule: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm',
  syncTable: 'vault_sync_state',
};
