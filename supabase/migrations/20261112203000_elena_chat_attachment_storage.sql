-- Elena chat PDFs and images persist in private luxor-documents objects at:
--   elena-chat/<chat_id>/<attachment_id>-<filename>
-- Message JSON in luxor_elena_chats.messages stores storagePath + id per attachment (no file bytes).

comment on table public.luxor_elena_chats is 'Owner Elena conversations; attachment files live in luxor-documents under elena-chat/<chat_id>/ when storagePath is set on a message attachment.';
