// Supabase Edge Function «vento-suscripciones». Toda la lógica está en app.ts (también se prueba en Node).
import { manejar } from "./app.ts";
import { leerEnv } from "../vento-pagos/util.ts";

Deno.serve((req: Request) => manejar(req, leerEnv()));
