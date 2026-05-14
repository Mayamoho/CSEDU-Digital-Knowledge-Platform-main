-- Migration to fix project submission issues
-- Run this to update existing database

-- 1. Drop the existing format constraint
ALTER TABLE media_items DROP CONSTRAINT IF EXISTS chk_media_format;

-- 2. Add the updated format constraint with zip, apk, and project formats
ALTER TABLE media_items
    ADD CONSTRAINT chk_media_format CHECK (format IN (
        'pdf','video','image','audio','docx','doc',
        'pptx','ppt','xlsx','xls','mp4','mp3','jpg','jpeg','png','gif',
        'zip','apk','project'
    ));

-- 3. Add missing columns to student_projects table
ALTER TABLE student_projects 
    ADD COLUMN IF NOT EXISTS web_url TEXT,
    ADD COLUMN IF NOT EXISTS github_repo TEXT,
    ADD COLUMN IF NOT EXISTS app_download TEXT;

-- 4. Change team_members from UUID[] to TEXT[] if needed
-- First check if the column exists and its type
DO $$
BEGIN
    -- Check if team_members column is UUID[] and change to TEXT[]
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'student_projects' 
        AND column_name = 'team_members' 
        AND data_type = 'ARRAY'
        AND udt_name = '_uuid'
    ) THEN
        -- Convert existing UUID[] data to TEXT[] if any exists
        UPDATE student_projects 
        SET team_members = ARRAY(SELECT team_members[i]::text FROM generate_subscripts(team_members, 1) i)
        WHERE team_members IS NOT NULL;
        
        -- Change column type
        ALTER TABLE student_projects 
        ALTER COLUMN team_members TYPE TEXT[] USING team_members::TEXT[];
    END IF;
END $$;