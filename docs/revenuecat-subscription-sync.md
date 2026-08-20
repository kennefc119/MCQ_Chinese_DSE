# RevenueCat subscription synchronization

## Required deployment order

1. Apply `supabase/migrations/20260810090000_secure_subscription_sync.sql` to the production database. If this repository is linked to the correct Supabase project, run:

   ```text
   supabase db push
   ```

   Otherwise, paste that migration into the Supabase SQL Editor and run it once.

2. Set a long random webhook secret in Supabase:

   ```text
   supabase secrets set REVENUECAT_WEBHOOK_SECRET=YOUR_RANDOM_SECRET
   ```

3. Deploy the RevenueCat webhook without Supabase JWT verification. RevenueCat authenticates with the separate secret instead of a Supabase user JWT:

   ```text
   supabase functions deploy dsemcq-revenuecat-webhook --no-verify-jwt
   ```

4. In RevenueCat, configure the webhook URL:

   ```text
   https://YOUR_PROJECT_REF.supabase.co/functions/v1/dsemcq-revenuecat-webhook
   ```

   Configure its Authorization header as `Bearer YOUR_RANDOM_SECRET`, using the same secret as step 2.

5. Redeploy the advisor functions that use the strengthened active-Premium quota check:

   ```text
   supabase functions deploy dsemcq-advisor-chat
   supabase functions deploy dsemcq-advisor-v2-start
   ```

## Event behavior

- `CANCELLATION`: records `subscription_will_renew = false` and the paid-through expiry. Access remains active until expiration.
- `EXPIRATION`, `REFUND`, `SUBSCRIPTION_PAUSED`: changes only the matching RevenueCat `app_user_id` profile to `free/inactive`.
- Purchase, renewal, product change, and uncancellation events activate Premium.
- Duplicate and out-of-order events cannot overwrite a newer subscription state.

## Production checks

Check recent webhook processing:

```sql
select event_type, app_user_id, event_time, outcome, processed_at
from dsemcq_subscription_events
order by created_at desc
limit 100;
```

Check for inconsistent subscription rows:

```sql
select id, subscription_tier, subscription_status,
       subscription_expires_at, subscription_will_renew
from dsemcq_profiles
where (subscription_tier = 'premium' and subscription_status <> 'active')
   or (subscription_tier = 'premium'
       and subscription_expires_at is not null
       and subscription_expires_at <= now());
```

Use RevenueCat's webhook test for cancellation and expiration. Confirm the event outcome becomes `applied_cancellation_pending_expiry` and then `applied_inactive`, and confirm only the event's UUID profile changes.