# Security Checklist

## Secrets and accounts

- Never commit secrets or expose server-only variables with a `NEXT_PUBLIC_` prefix.
- Keep Supabase secret/service-role keys, Resend keys, OpenAI keys, and `CRON_SECRET`
  limited to the Vercel production environment unless a preview explicitly needs them.
- Require MFA on GitHub, Vercel, Supabase, Resend, and OpenAI accounts.
- Rotate a key immediately if it is exposed in source, logs, screenshots, or client code.

## Deployment

1. Deploy application changes before applying migrations that revoke existing access.
2. Confirm the Vercel deployment is healthy.
3. Run `npx supabase db push --dry-run`, then `npx supabase db push`.
4. Run `npm audit`, `npm test`, `npm run lint`, and `npm run build` before release.

## Platform controls

- Configure Vercel rate limits for public write routes, especially
  `/api/feedback`, `/api/question-reports`, `/api/groups/join`, and sport quiz
  submission routes.
- Keep Supabase RLS enabled on every exposed table and explicitly revoke grants that
  are not needed by `anon` or `authenticated`.
- Review Vercel, Supabase, Resend, and OpenAI logs and billing alerts regularly.
