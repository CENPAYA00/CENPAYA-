-- Required before enabling marketplace wallet checkout.
-- The live database already has public.hold_escrow_on_order_insert(),
-- but inspection found no trigger attached to public.orders.
-- This attaches the existing atomic wallet-debit + escrow-ledger function.

DO $migration$
BEGIN
  IF to_regclass('public.orders') IS NULL THEN
    RAISE EXCEPTION 'Required table public.orders is missing';
  END IF;

  IF to_regprocedure('public.hold_escrow_on_order_insert()') IS NULL THEN
    RAISE EXCEPTION 'Required function public.hold_escrow_on_order_insert() is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.orders'::regclass
      AND tgname = 'trg_hold_escrow_on_order_insert'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER trg_hold_escrow_on_order_insert
      BEFORE INSERT ON public.orders
      FOR EACH ROW
      EXECUTE FUNCTION public.hold_escrow_on_order_insert();
  END IF;
END
$migration$;
