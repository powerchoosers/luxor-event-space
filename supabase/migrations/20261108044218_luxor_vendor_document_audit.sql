begin;
-- created_by is the claimant, even when a different authorized user completes
-- an interrupted upload. finalized_by records the session that finalized it.
alter table public.luxor_vendor_documents add column finalized_by text;
create or replace function public.luxor_guard_vendor_document_claim() returns trigger
language plpgsql set search_path = public as $$
begin
 if coalesce(btrim(new.finalized_by),'') = ''
    or new.storage_path is distinct from ('vendor-documents/' || new.vendor_id::text || '/' || new.id::text)
    or not exists (select 1 from public.luxor_vendor_document_claims c where c.id=new.id and c.vendor_id=new.vendor_id and c.file_name=new.file_name and c.content_type=new.content_type and c.size_bytes=new.size_bytes and c.sha256=new.sha256 and c.kind=new.kind and c.created_by=new.created_by) then
  raise exception 'Matching document claim and finalizer required.' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function public.luxor_guard_vendor_document_claim() from public,anon,authenticated;
commit;
