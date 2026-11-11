-- Minimal disposable schema for the real calendar/schedule/visit functions.
create role anon;
create role authenticated;
create role service_role bypassrls;
create table public.luxor_calls(id uuid primary key default gen_random_uuid(),twilio_call_sid text unique,direction text,to_number text,status text,inquiry_id uuid,metadata jsonb default '{}',updated_at timestamptz default now());
create table public.luxor_inquiries(id uuid primary key default gen_random_uuid(),full_name text,email text,phone text,status text default 'new',pipeline_stage text default 'inquiry',archived_at timestamptz,is_test boolean default false,metadata jsonb default '{}',updated_at timestamptz default now(),preferred_tour_date date,preferred_tour_time text,current_tour_visit_id uuid,current_tour_visit_version integer default 0,tour_response_token text,tour_attendance_status text,tour_confirmed_at timestamptz);
create table public.luxor_phone_numbers(phone_number text,is_public boolean);
create table public.luxor_tour_slots(id uuid primary key default gen_random_uuid(),slot_date date,start_time time,end_time time,status text,capacity integer,booked_count integer default 0,title text,updated_at timestamptz default now(),unique(slot_date,start_time));
create table public.luxor_calendar_events(id uuid primary key default gen_random_uuid(),inquiry_id uuid unique,uid text unique,sequence integer,status text,state jsonb,created_at timestamptz default now(),updated_at timestamptz default now());
create table public.luxor_calendar_revisions(id uuid primary key default gen_random_uuid(),event_id uuid,sequence integer,state jsonb,requested_by text,created_at timestamptz default now(),unique(event_id,sequence));
create table public.luxor_calendar_attendees(event_id uuid,email text,sequence integer,partstat text default 'NEEDS-ACTION',response_at timestamptz,response_message_id uuid,active boolean default true,primary key(event_id,email));
create table public.luxor_email_jobs(id uuid primary key default gen_random_uuid(),inquiry_id uuid,job_type text,recipient_email text,subject text,body text,scheduled_for timestamptz default now(),status text default 'queued',metadata jsonb default '{}',calendar_revision_id uuid,calendar_method text,tour_revision_id uuid,tour_notice text,updated_at timestamptz default now(),last_error text);
create table public.luxor_tour_visits(id uuid primary key,inquiry_id uuid,calendar_event_id uuid,tour_date date,attendance_status text default 'pending',version integer default 1,updated_at timestamptz default now());
create table public.luxor_tour_schedule_receipts(revision_id uuid primary key,requested_by text,tour jsonb,visit_id uuid,visit_intent text,request_id uuid unique,request_payload jsonb,result jsonb);
create table public.luxor_notes(id uuid primary key default gen_random_uuid(),inquiry_id uuid,content text,note_type text,author text);
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
