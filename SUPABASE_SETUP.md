# NovaBank multi-user setup

NovaBank is an educational banking simulation. All balances are fictional demo credits. It is not a real bank, wallet, payment service, or deposit-taking product.

## 1. Create a Supabase project
1. Create a project at https://supabase.com/dashboard.
2. Open the project's SQL Editor.
3. Open `supabase/schema.sql` in this repository, paste the full SQL into the SQL Editor, and run it.
4. Confirm that the `profiles`, `accounts`, and `transactions` tables were created.

The database creates a profile and account whenever a new Supabase Auth user signs up. Every account starts with ₹1,000 of simulated welcome credit. Deposit, withdrawal, and transfer operations execute inside PostgreSQL functions. Row Level Security limits users to their own data.

## 2. Configure email authentication
In Supabase, open Authentication → Providers → Email and enable email/password sign-in. Configure email confirmation and an email provider before inviting the public. For initial development only, you may temporarily disable confirmation.

Under Authentication → URL Configuration, add your deployed GitHub Pages URL as the Site URL and as an allowed redirect URL. Example format: `https://YOUR_GITHUB_USERNAME.github.io/Nova-bank/`.

## 3. Connect the frontend
1. Open Project Settings → API in Supabase.
2. Copy the Project URL.
3. Copy the publishable key (or legacy anon key).
4. Edit `supabase-config.js` in this GitHub repository.
5. Replace `YOUR_SUPABASE_PROJECT_URL` and `YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY` with those two values and commit the change.
6. Wait for GitHub Pages to redeploy, then open the site.

Only the browser-safe publishable/anon key belongs in `supabase-config.js`. Never place a service-role key, secret key, or database password in frontend code or GitHub.

## 4. Make your account the administrator (optional)
First create your own NovaBank account through the website. Then run this query in the Supabase SQL Editor, replacing the email address with the email you registered:

```sql
update public.profiles p
set is_admin = true
from auth.users u
where p.id = u.id
  and u.email = 'YOUR_EMAIL_ADDRESS';
```

Sign out and sign back in. The Admin tab will show the account directory and demo balances. Only grant this role to a trusted administrator.

## 5. What currently works in the frontend
- Email/password sign-up and sign-in.
- A separate account and ₹1,000 simulated welcome credit for each new user.
- Personal balance and account number.
- Demo deposits and withdrawals.
- Transfers to another NovaBank account number.
- Personal transaction history.
- Admin account directory for the designated admin.
- Live refresh when the signed-in account balance or transaction history changes.

The former ATM cash-note dispenser interface has been replaced by this shared multi-user portal. It is not yet a real-money banking product and has not undergone a production security/compliance audit.
