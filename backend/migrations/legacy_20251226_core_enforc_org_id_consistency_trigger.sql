create or replace function core.enforce_location_external_ids_org_match()
returns trigger as $$
declare loc_org bigint;
begin
  select org_id into loc_org
  from core.locations
  where id = new.location_id;

  if loc_org is null then
    raise exception 'Invalid location_id %', new.location_id;
  end if;

  if new.org_id <> loc_org then
    raise exception 'Org mismatch: location_external_ids.org_id % must match locations.org_id %',
      new.org_id, loc_org;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_location_external_ids_org_match on core.location_external_ids;

create trigger trg_location_external_ids_org_match
before insert or update on core.location_external_ids
for each row execute function core.enforce_location_external_ids_org_match();