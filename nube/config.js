/* Vento Nube · conexión por defecto para TODOS los celulares.
   Si se llenan estos dos datos (Supabase → Project Settings → API), cada celular que abra Vento ya
   queda conectado a la base de datos sin tener que pegarlos a mano.
   Solo va la clave PÚBLICA (anon / publishable). NUNCA la service_role / secret key. */
window.VENTO_NUBE_DEFAULT = {
  url: 'https://tdxcrvuuefpthvrkokuh.supabase.co',   // ej. 'https://abcdefghijklmnop.supabase.co'
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkeGNydnV1ZWZwdGh2cmtva3VoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA5NDI0MzUsImV4cCI6MjEwNjUxODQzNX0.6V1MZEHVTMNNMtaOsjghMLNGFxXSe0qfAA0Qq5Lq8gU'    // ej. 'eyJhbGciOiJIUzI1NiIs…'  o  'sb_publishable_…'
};
