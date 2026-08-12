create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

do $deployment$
declare
  v_site_url text;
  v_cron_secret text;
  v_job_name constant text := 'nightly-question-verification';
begin
  select decrypted_secret
  into v_site_url
  from vault.decrypted_secrets
  where name = 'daily_review_site_url';

  if v_site_url is null or btrim(v_site_url) = '' then
    raise exception 'daily_review_site_url is missing or blank';
  end if;

  select decrypted_secret
  into v_cron_secret
  from vault.decrypted_secrets
  where name = 'daily_review_cron_secret';

  if v_cron_secret is null or btrim(v_cron_secret) = '' then
    raise exception 'daily_review_cron_secret is missing or blank';
  end if;

  if exists (
    select 1
    from cron.job
    where jobname = v_job_name
      and username = current_user
  ) then
    perform cron.unschedule(v_job_name);
  end if;

  perform cron.schedule(
    v_job_name,
    '*/5 0-2,23 * * *',
    $command$
      select net.http_post(
        url => (
          select rtrim(decrypted_secret, '/')
          from vault.decrypted_secrets
          where name = 'daily_review_site_url'
        ) || '/api/cron/daily-question-review',
        headers => jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'daily_review_cron_secret'
          )
        ),
        body => '{}'::jsonb,
        timeout_milliseconds => 300000
      );
    $command$
  );
end;
$deployment$;
