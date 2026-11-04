# Connecting Supabase: step by step

Takes about 20 minutes. You only do this once.

## 1. Create the Supabase project
1. Go to https://supabase.com and click **Start your project**. Sign in with GitHub.
2. Click **New project**. Name: `life-dashboard`. Pick a strong database password and save it in your password manager. Region: **London (eu-west-2)**.
3. Wait about 2 minutes while it sets up.

## 2. Create the tables
1. In the left menu, open **SQL Editor**, then click **New query**.
2. Open `supabase/schema.sql` from this repository, copy all of it, and paste it in.
3. Click **Run**. You should see "Success. No rows returned".
4. Open **Table Editor** in the left menu. You should see `domains`, `tasks`, `routines` and `routine_ticks`.

## 3. Turn off email confirmation
The app signs in with email and password, so Supabase doesn't need to send any emails.
1. Go to **Authentication > Sign In / Providers** and open **Email**.
2. Turn off **Confirm email**, then click **Save**.

## 4. Copy your two keys
1. Click **Connect** at the top of the project page (or go to **Project Settings > API**).
2. Copy the **Project URL**, which looks like `https://abcd1234.supabase.co`.
3. Copy the **publishable** key (`sb_publishable_...`). Older projects call it the **anon public** key.
   Both are safe to put in the app. **Never** use the `service_role` or secret key.

## 5. Put the app online with Vercel
1. Go to https://vercel.com, then **Add New... > Project**, and import `life-dashboard` from GitHub.
2. Before clicking Deploy, open **Environment Variables** and add both values:
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_KEY` = your publishable key
3. Click **Deploy**. You'll get a link like `life-dashboard-xyz.vercel.app`.

## 6. Create your account
1. Open the link on your phone and tap **First time? Create your account**.
2. Enter your email and a password (at least 8 characters). Let your phone save the password.
3. Your five domains and Inbox are created automatically.

## 7. Lock the door
Once you've signed in, stop anyone else from making an account:
**Authentication > Sign In / Providers > turn off "Allow new users to sign up"**, then **Save**.

## 8. Put it on your home screen
- **iPhone (Safari):** Share button, then **Add to Home Screen**.
- **Android (Chrome):** three-dot menu, then **Add to Home screen** (or **Install app**).
- **Desk PC:** open the same link and sign in with the same email.
