import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { createAdminUserHandler } from "./handler.ts";

Deno.serve(createAdminUserHandler(createClient, Deno.env));
