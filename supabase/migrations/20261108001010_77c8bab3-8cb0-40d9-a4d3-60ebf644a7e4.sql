REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.guide_conversations FROM anon, authenticated;
REVOKE ALL ON public.guide_conversations FROM anon;