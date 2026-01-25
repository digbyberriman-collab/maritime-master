-- Add branding columns to companies table
ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS client_display_name text,
ADD COLUMN IF NOT EXISTS brand_color text,
ADD COLUMN IF NOT EXISTS client_logo_url text;

-- Create storage bucket for client logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-logos', 'client-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for client logos
CREATE POLICY "Users can view logos from their company"
ON storage.objects FOR SELECT
USING (bucket_id = 'client-logos');

CREATE POLICY "Authenticated users can upload logos for their company"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'client-logos' 
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Users can update logos for their company"
ON storage.objects FOR UPDATE
USING (bucket_id = 'client-logos' AND auth.role() = 'authenticated');

CREATE POLICY "Users can delete logos for their company"
ON storage.objects FOR DELETE
USING (bucket_id = 'client-logos' AND auth.role() = 'authenticated');