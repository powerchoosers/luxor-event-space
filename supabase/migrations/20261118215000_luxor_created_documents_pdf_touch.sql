-- PDF storage-only updates should not bump updated_at (avoids optimistic-lock 409s while preview renders).
create or replace function public.luxor_created_documents_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (
    old.title is not distinct from new.title
    and old.document_type is not distinct from new.document_type
    and old.body_json is not distinct from new.body_json
    and old.body_html is not distinct from new.body_html
    and old.is_template is not distinct from new.is_template
    and old.status is not distinct from new.status
    and old.archived_at is not distinct from new.archived_at
    and old.created_by is not distinct from new.created_by
    and old.version is not distinct from new.version
    and old.source_template_id is not distinct from new.source_template_id
    and (old.pdf_storage_path is distinct from new.pdf_storage_path)
  ) then
    new.updated_at := old.updated_at;
    return new;
  end if;
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists luxor_created_documents_set_updated_at on public.luxor_created_documents;
create trigger luxor_created_documents_set_updated_at
  before update on public.luxor_created_documents
  for each row execute function public.luxor_created_documents_set_updated_at();