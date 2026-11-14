create sequence if not exists public.account_number_seq start with 100104;

create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null check (char_length(full_name) between 2 and 60),
 account_number bigint not null unique default nextval('public.account_number_seq'),
 is_admin boolean not null default false,
 created_at timestamptz not null default now()
);
create table if not exists public.accounts (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 balance numeric(14,2) not null default 1000.00 check (balance >= 0),
 currency text not null default 'INR' check (currency = 'INR'),
 updated_at timestamptz not null default now()
);
create table if not exists public.transactions (
 id bigint generated always as identity primary key,
 user_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null check (kind in ('welcome_credit','deposit','withdrawal','transfer_in','transfer_out')),
 amount numeric(14,2) not null check (amount > 0),
 balance_after numeric(14,2) not null check (balance_after >= 0),
 description text not null default '',
 related_account bigint,
 created_at timestamptz not null default now()
);
create index if not exists transactions_user_created_idx on public.transactions(user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.transactions enable row level security;

drop policy if exists "Users read own profile" on public.profiles;
create policy "Users read own profile" on public.profiles for select to authenticated
 using (id = (select auth.uid()) or exists (select 1 from public.profiles me where me.id = (select auth.uid()) and me.is_admin));
drop policy if exists "Users read own account" on public.accounts;
create policy "Users read own account" on public.accounts for select to authenticated
 using (user_id = (select auth.uid()) or exists (select 1 from public.profiles me where me.id = (select auth.uid()) and me.is_admin));
drop policy if exists "Users read own transactions" on public.transactions;
create policy "Users read own transactions" on public.transactions for select to authenticated
 using (user_id = (select auth.uid()) or exists (select 1 from public.profiles me where me.id = (select auth.uid()) and me.is_admin));

create or replace function public.create_novabank_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_name text;
begin
 v_name := coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'NovaBank User');
 insert into public.profiles(id, full_name) values (new.id, left(v_name, 60));
 insert into public.accounts(user_id, balance) values (new.id, 1000.00);
 insert into public.transactions(user_id, kind, amount, balance_after, description)
 values (new.id, 'welcome_credit', 1000.00, 1000.00, 'Demo welcome credit');
 return new;
end;
$$;
drop trigger if exists on_novabank_user_created on auth.users;
create trigger on_novabank_user_created after insert on auth.users
 for each row execute procedure public.create_novabank_user();

create or replace function public.novabank_deposit(p_amount numeric)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_user uuid := auth.uid(); v_balance numeric(14,2);
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if p_amount is null or p_amount <= 0 or p_amount > 100000 or round(p_amount,2) <> p_amount then
  raise exception 'Enter an amount between ₹0.01 and ₹100,000 with at most two decimals';
 end if;
 update public.accounts set balance = balance + p_amount, updated_at = now()
 where user_id = v_user returning balance into v_balance;
 if not found then raise exception 'Account not found'; end if;
 insert into public.transactions(user_id,kind,amount,balance_after,description)
 values(v_user,'deposit',p_amount,v_balance,'Simulated cash deposit');
 return jsonb_build_object('balance',v_balance);
end;
$$;

create or replace function public.novabank_withdraw(p_amount numeric)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_user uuid := auth.uid(); v_balance numeric(14,2);
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if p_amount is null or p_amount <= 0 or p_amount > 100000 or round(p_amount,2) <> p_amount then
  raise exception 'Enter an amount between ₹0.01 and ₹100,000 with at most two decimals';
 end if;
 update public.accounts set balance = balance - p_amount, updated_at = now()
 where user_id = v_user and balance >= p_amount returning balance into v_balance;
 if not found then raise exception 'Insufficient balance or account not found'; end if;
 insert into public.transactions(user_id,kind,amount,balance_after,description)
 values(v_user,'withdrawal',p_amount,v_balance,'Simulated cash withdrawal');
 return jsonb_build_object('balance',v_balance);
end;
$$;

create or replace function public.novabank_transfer(p_to_account bigint,p_amount numeric)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
 v_user uuid := auth.uid(); v_to_user uuid; v_from_balance numeric(14,2);
 v_to_balance numeric(14,2); v_from_account bigint;
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if p_amount is null or p_amount <= 0 or p_amount > 100000 or round(p_amount,2) <> p_amount then
  raise exception 'Enter an amount between ₹0.01 and ₹100,000 with at most two decimals';
 end if;
 select account_number into v_from_account from public.profiles where id=v_user;
 select id into v_to_user from public.profiles where account_number=p_to_account;
 if v_to_user is null then raise exception 'Recipient account not found'; end if;
 if v_to_user=v_user then raise exception 'Cannot transfer to your own account'; end if;
 perform 1 from public.accounts where user_id in (v_user,v_to_user) order by user_id for update;
 update public.accounts set balance=balance-p_amount,updated_at=now()
 where user_id=v_user and balance>=p_amount returning balance into v_from_balance;
 if not found then raise exception 'Insufficient balance'; end if;
 update public.accounts set balance=balance+p_amount,updated_at=now()
 where user_id=v_to_user returning balance into v_to_balance;
 if not found then raise exception 'Recipient account not found'; end if;
 insert into public.transactions(user_id,kind,amount,balance_after,description,related_account)
 values(v_user,'transfer_out',p_amount,v_from_balance,'Transfer sent',p_to_account);
 insert into public.transactions(user_id,kind,amount,balance_after,description,related_account)
 values(v_to_user,'transfer_in',p_amount,v_to_balance,'Transfer received',v_from_account);
 return jsonb_build_object('balance',v_from_balance,'recipient_account',p_to_account);
end;
$$;

revoke all on function public.novabank_deposit(numeric) from public;
revoke all on function public.novabank_withdraw(numeric) from public;
revoke all on function public.novabank_transfer(bigint,numeric) from public;
grant execute on function public.novabank_deposit(numeric) to authenticated;
grant execute on function public.novabank_withdraw(numeric) to authenticated;
grant execute on function public.novabank_transfer(bigint,numeric) to authenticated;
