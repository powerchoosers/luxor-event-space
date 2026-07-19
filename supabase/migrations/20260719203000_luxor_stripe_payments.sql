create unique index if not exists luxor_payments_processor_reference_unique_idx
  on public.luxor_payments (processor, processor_reference)
  where processor is not null and processor_reference is not null;

