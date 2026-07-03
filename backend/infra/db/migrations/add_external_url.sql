-- Migration: Add external_url support for archives
-- Date: 2026-07-04

-- Add external_url column to media_items table
ALTER TABLE media_items 
ADD COLUMN IF NOT EXISTS external_url TEXT;

-- Add 'url' format to allowed formats constraint
-- First drop the old constraint
ALTER TABLE media_items 
DROP CONSTRAINT IF EXISTS chk_media_format;

-- Add new constraint with 'url' format
ALTER TABLE media_items
ADD CONSTRAINT chk_media_format CHECK (format IN (
    'pdf','video','image','audio','docx','doc',
    'pptx','ppt','xlsx','xls','mp4','mp3','jpg','jpeg','png','gif',
    'zip','apk','project','url'
));

-- Migration complete
