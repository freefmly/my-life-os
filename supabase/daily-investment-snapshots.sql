-- Run after deploying the `daily-investment-snapshots` Edge Function.
-- 1) In Edge Function Secrets, create CRON_SNAPSHOT_SECRET with a long random value.
-- 2) Store the identical value in Vault with the name below.
--    select vault.create_secret('your-long-random-value', 'daily_snapshot_cron_secret');
-- 3) Run the remainder of this file in the Supabase SQL Editor.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid)
from cron.job
where jobname = 'daily-investment-market-close';

select cron.schedule(
  'daily-investment-market-close',
  '30 21 * * 1-5', -- 21:30 UTC: after the regular US market close in both DST and standard time.
  $$
    select net.http_post(
      url := 'https://mkhqlqagnkskramfrnsa.supabase.co/functions/v1/daily-investment-snapshots',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'sb_publishable_3JsCcOOWE-0KAZizIElY9g_rer8gtoK',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'daily_snapshot_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 15000
    );
  $$
);
