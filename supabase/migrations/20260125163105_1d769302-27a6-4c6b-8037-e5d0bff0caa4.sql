-- Create document categories table
CREATE TABLE public.document_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.document_categories ENABLE ROW LEVEL SECURITY;

-- Categories are readable by all authenticated users
CREATE POLICY "Authenticated users can view categories"
ON public.document_categories
FOR SELECT
TO authenticated
USING (true);

-- Insert default categories
INSERT INTO public.document_categories (name, icon, color, display_order) VALUES
('Policies', 'clipboard-list', '#3B82F6', 1),
('Procedures', 'settings', '#8B5CF6', 2),
('Forms', 'file-text', '#10B981', 3),
('Records', 'bar-chart-3', '#F59E0B', 4),
('Manuals', 'book-open', '#EC4899', 5),
('Certificates', 'award', '#06B6D4', 6);

-- Create documents table
CREATE TABLE public.documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  vessel_id UUID REFERENCES public.vessels(id) ON DELETE SET NULL,
  category_id UUID NOT NULL REFERENCES public.document_categories(id),
  document_number TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  revision TEXT NOT NULL DEFAULT 'Rev 1',
  language TEXT NOT NULL DEFAULT 'EN',
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft',
  author_id UUID NOT NULL REFERENCES public.profiles(user_id),
  reviewer_id UUID REFERENCES public.profiles(user_id),
  approver_id UUID REFERENCES public.profiles(user_id),
  issue_date DATE,
  next_review_date DATE,
  approved_date DATE,
  tags TEXT[] DEFAULT '{}',
  is_mandatory_read BOOLEAN NOT NULL DEFAULT false,
  ism_sections INTEGER[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT documents_document_number_company_unique UNIQUE (document_number, company_id)
);

-- Enable RLS
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Users can view documents in their company
CREATE POLICY "Users can view documents in their company"
ON public.documents
FOR SELECT
USING (user_belongs_to_company(auth.uid(), company_id));

-- Users can insert documents in their company
CREATE POLICY "Users can insert documents in their company"
ON public.documents
FOR INSERT
WITH CHECK (user_belongs_to_company(auth.uid(), company_id));

-- Users can update documents in their company
CREATE POLICY "Users can update documents in their company"
ON public.documents
FOR UPDATE
USING (user_belongs_to_company(auth.uid(), company_id));

-- Users can delete documents in their company
CREATE POLICY "Users can delete documents in their company"
ON public.documents
FOR DELETE
USING (user_belongs_to_company(auth.uid(), company_id));

-- Create document versions table
CREATE TABLE public.document_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  revision TEXT NOT NULL,
  file_url TEXT NOT NULL,
  change_summary TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(user_id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

-- Users can view versions for documents in their company
CREATE POLICY "Users can view document versions in their company"
ON public.document_versions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_id
    AND user_belongs_to_company(auth.uid(), d.company_id)
  )
);

-- Users can insert versions for documents in their company
CREATE POLICY "Users can insert document versions in their company"
ON public.document_versions
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_id
    AND user_belongs_to_company(auth.uid(), d.company_id)
  )
);

-- Create document acknowledgments table
CREATE TABLE public.document_acknowledgments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(user_id),
  acknowledged_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ip_address TEXT,
  CONSTRAINT document_acknowledgments_unique UNIQUE (document_id, user_id)
);

-- Enable RLS
ALTER TABLE public.document_acknowledgments ENABLE ROW LEVEL SECURITY;

-- Users can view acknowledgments for documents in their company
CREATE POLICY "Users can view acknowledgments in their company"
ON public.document_acknowledgments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_id
    AND user_belongs_to_company(auth.uid(), d.company_id)
  )
);

-- Users can insert their own acknowledgments
CREATE POLICY "Users can acknowledge documents"
ON public.document_acknowledgments
FOR INSERT
WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_id
    AND user_belongs_to_company(auth.uid(), d.company_id)
  )
);

-- Add updated_at trigger for documents
CREATE TRIGGER update_documents_updated_at
BEFORE UPDATE ON public.documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  26214400,
  ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'image/png', 'image/jpeg']
);

-- Storage policies for documents bucket
CREATE POLICY "Users can view documents in their company"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'documents' AND
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
    AND (storage.foldername(name))[1] = p.company_id::text
  )
);

CREATE POLICY "Users can upload documents to their company"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'documents' AND
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
    AND (storage.foldername(name))[1] = p.company_id::text
  )
);

CREATE POLICY "Users can update documents in their company"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'documents' AND
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
    AND (storage.foldername(name))[1] = p.company_id::text
  )
);

CREATE POLICY "Users can delete documents in their company"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'documents' AND
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid()
    AND (storage.foldername(name))[1] = p.company_id::text
  )
);