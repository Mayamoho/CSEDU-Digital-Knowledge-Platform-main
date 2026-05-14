-- Add new fields to student_projects table for web links and downloads
ALTER TABLE student_projects 
ADD COLUMN web_url TEXT,
ADD COLUMN github_repo TEXT,
ADD COLUMN app_download TEXT;

-- Add indexes for the new fields
CREATE INDEX idx_project_web_url ON student_projects (web_url) WHERE web_url IS NOT NULL;
CREATE INDEX idx_project_github ON student_projects (github_repo) WHERE github_repo IS NOT NULL;