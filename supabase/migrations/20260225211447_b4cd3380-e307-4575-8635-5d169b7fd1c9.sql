
-- Development To-Do / Bug Tracker table
CREATE TABLE public.dev_todos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id),
  title TEXT NOT NULL,
  description TEXT,
  priority INTEGER NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 4),
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'in_progress', 'done', 'cancelled')),
  assigned_to UUID REFERENCES auth.users(id),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  image_urls TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.dev_todos ENABLE ROW LEVEL SECURITY;

-- Users can view todos in their company
CREATE POLICY "Users can view company dev_todos"
  ON public.dev_todos FOR SELECT
  USING (public.user_belongs_to_company(auth.uid(), company_id));

-- Users can insert todos for their company
CREATE POLICY "Users can insert dev_todos"
  ON public.dev_todos FOR INSERT
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id) AND created_by = auth.uid());

-- Users can update todos in their company
CREATE POLICY "Users can update company dev_todos"
  ON public.dev_todos FOR UPDATE
  USING (public.user_belongs_to_company(auth.uid(), company_id));

-- Users can delete their own todos
CREATE POLICY "Users can delete own dev_todos"
  ON public.dev_todos FOR DELETE
  USING (created_by = auth.uid());

-- Index for fast lookups
CREATE INDEX idx_dev_todos_company ON public.dev_todos(company_id);
CREATE INDEX idx_dev_todos_status ON public.dev_todos(status);

-- Storage bucket for todo images
INSERT INTO storage.buckets (id, name, public) VALUES ('dev-todo-images', 'dev-todo-images', true);

-- Storage policies
CREATE POLICY "Users can upload dev todo images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'dev-todo-images' AND auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can view dev todo images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'dev-todo-images');

CREATE POLICY "Users can delete own dev todo images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'dev-todo-images' AND auth.uid() IS NOT NULL);
