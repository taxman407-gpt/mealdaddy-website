create or replace function public.invalidate_edited_meal_estimate()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  replacement jsonb;
begin
  if current_user = 'authenticated'
     and new.status::text = 'pending_estimate'
     and (new.description is distinct from old.description or new.kind is distinct from old.kind)
  then
    replacement := jsonb_build_object(
      'input_authority', 'edited_text',
      'edit_revision', gen_random_uuid()::text
    );
    if new.kind::text = 'meal' then
      if jsonb_typeof(new.nutrition_estimate -> 'photo_path') = 'string' then
        replacement := replacement || jsonb_build_object('photo_path', new.nutrition_estimate -> 'photo_path');
      end if;
      if jsonb_typeof(new.nutrition_estimate -> 'favorite_origin') = 'object' then
        replacement := replacement || jsonb_build_object('favorite_origin', new.nutrition_estimate -> 'favorite_origin');
      end if;
    elsif new.kind::text = 'hydration' then
      if jsonb_typeof(new.nutrition_estimate -> 'ounces') = 'number' then
        replacement := replacement || jsonb_build_object('ounces', new.nutrition_estimate -> 'ounces');
      end if;
    end if;
    new.nutrition_estimate := replacement;
  end if;
  return new;
end;
$function$;
revoke all on function public.invalidate_edited_meal_estimate() from public, anon, authenticated;
drop trigger if exists invalidate_edited_meal_estimate on public.ledger_entries;
create trigger invalidate_edited_meal_estimate
before update of description, kind on public.ledger_entries
for each row execute function public.invalidate_edited_meal_estimate();
comment on function public.invalidate_edited_meal_estimate() is 'An edited pending entry replaces all prior computed components; a retained photo is reference-only. Invoker security; no authorization bypass.';
