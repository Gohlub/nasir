alter table channels
add column if not exists session_state text;
