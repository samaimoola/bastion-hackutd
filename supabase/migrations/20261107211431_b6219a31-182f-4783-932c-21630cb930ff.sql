CREATE TABLE public.guide_conversations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL UNIQUE,
 messages jsonb NOT NULL DEFAULT '[]'::jsonb,
 blocked_reason text,
 blocked_status integer,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.guide_conversations TO authenticated;
GRANT ALL ON public.guide_conversations TO service_role;
ALTER TABLE public.guide_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners manage guide conversations" ON public.guide_conversations FOR ALL TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
CREATE FUNCTION public.update_guide_timestamp() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER guide_updated_at BEFORE UPDATE ON public.guide_conversations FOR EACH ROW EXECUTE FUNCTION public.update_guide_timestamp();