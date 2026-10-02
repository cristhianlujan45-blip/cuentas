// Supabase Edge Function «vento-pagos». Toda la lógica está en app.ts (también se prueba en Node).
import { manejar } from "./app.ts";
import { leerEnv } from "./util.ts";

Deno.serve((req: Request) => manejar(req, leerEnv()));
