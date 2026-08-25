-- RZV veritabani yapisi — 4/6: FONKSIYONLAR (6/6)
set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.yonetici_mi()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.platform_yoneticileri y where y.user_id = auth.uid());
$function$
;
