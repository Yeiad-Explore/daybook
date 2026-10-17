-- Owner's decision (17 Oct 2026, PRD §5.8 / §10.3): light is the default theme; dark or
-- "follow my system" is chosen in Settings → Profile.
alter table public.profiles alter column theme set default 'light';

-- Profiles created under the old default never chose a theme; they get the new default.
update public.profiles set theme = 'light' where theme = 'system';
