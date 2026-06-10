ALTER TABLE public.development_applications
  DROP COLUMN estimated_total_usd;

ALTER TABLE public.development_applications
  ADD COLUMN estimated_total_usd DECIMAL(10,2) GENERATED ALWAYS AS (
    COALESCE(estimated_tuition_usd, 0)
    + COALESCE(estimated_accommodation_usd, 0)
    + COALESCE(estimated_travel_usd, 0)
    + (COALESCE(estimated_food_per_diem_usd, 0) * COALESCE(course_duration_days, 0))
  ) STORED;

ALTER TABLE public.development_expenses
  ADD COLUMN IF NOT EXISTS actual_food_days INTEGER DEFAULT 0;

ALTER TABLE public.development_expenses
  DROP COLUMN actual_total_usd;

ALTER TABLE public.development_expenses
  ADD COLUMN actual_total_usd DECIMAL(10,2) GENERATED ALWAYS AS (
    COALESCE(actual_tuition_usd, 0)
    + COALESCE(actual_accommodation_usd, 0)
    + COALESCE(actual_travel_usd, 0)
    + (COALESCE(actual_food_per_diem_usd, 0) * COALESCE(actual_food_days, 0))
  ) STORED;