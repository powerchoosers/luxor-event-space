-- Remove obsolete legacy package reference from elena knowledge and ensure Elena has the correct packages
delete from public.luxor_elena_knowledge where id = 'ebfc88c7-3d02-4f75-8038-5962827f3870';
