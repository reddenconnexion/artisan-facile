alter table events add column client_id bigint references clients(id);
