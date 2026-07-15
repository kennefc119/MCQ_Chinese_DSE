alter table dsemcq_nd_passages
add column if not exists word_count int not null default 0 check (word_count >= 0);