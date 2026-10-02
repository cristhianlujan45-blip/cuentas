/* Vento Nube · conexión por defecto para TODOS los celulares.
   Si se llenan estos dos datos (Supabase → Project Settings → API), cada celular que abra Vento ya
   queda conectado a la base de datos sin tener que pegarlos a mano.
   Solo va la clave PÚBLICA (anon / publishable). NUNCA la service_role / secret key. */
window.VENTO_NUBE_DEFAULT = {
  url: '',   // ej. 'https://abcdefghijklmnop.supabase.co'
  key: ''    // ej. 'eyJhbGciOiJIUzI1NiIs…'  o  'sb_publishable_…'
};
