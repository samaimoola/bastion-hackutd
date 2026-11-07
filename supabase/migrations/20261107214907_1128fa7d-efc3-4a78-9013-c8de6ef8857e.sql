REVOKE ALL ON public.incidents, public.incident_members FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.incidents, public.incident_members TO authenticated;