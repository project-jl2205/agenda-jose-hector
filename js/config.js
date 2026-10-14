// Configuración PÚBLICA de la web.
// La URL del proyecto y la clave PUBLICABLE (sb_publishable_…) de Supabase son públicas por diseño:
// lo que protege los datos es RLS + la lista de 2 miembros. La clave SECRETA no va NUNCA aquí.
// Vacío = modo demo (datos de ejemplo en este navegador, sin servidor).
export const CONFIG = {
  supabaseUrl: 'https://novkoblptqjuzqypfbhy.supabase.co',
  supabaseClave: 'sb_publishable_kAy8Sc-ypt2nS-vVuf70tw_Zfa5qx4C',
  version: '1.0.0',
};
