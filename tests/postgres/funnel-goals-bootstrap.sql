create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create table public.luxor_portal_members(email text not null unique,role text not null,status text not null,permissions jsonb not null);
insert into public.luxor_portal_members values ('owner@example.invalid','owner','active','[]'),('staff@example.invalid','agent','active','["leads"]'),('editor@example.invalid','admin','active','["settings","leads"]'),('suspended@example.invalid','owner','suspended','[]');
