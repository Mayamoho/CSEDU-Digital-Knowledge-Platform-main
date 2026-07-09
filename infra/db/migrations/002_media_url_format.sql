-- Allow 'url' format for external-link-only media items and make sure the
-- external_url column exists. A previous migration (migrate_project_fixes.sql)
-- recreated chk_media_format without 'url', which made URL-only archive
-- uploads fail with "could not save media item".

ALTER TABLE media_items
    ADD COLUMN IF NOT EXISTS external_url TEXT;

ALTER TABLE media_items DROP CONSTRAINT IF EXISTS chk_media_format;
ALTER TABLE media_items
    ADD CONSTRAINT chk_media_format CHECK (format IN (
        'pdf','video','image','audio','docx','doc',
        'pptx','ppt','xlsx','xls','mp4','mp3','jpg','jpeg','png','gif',
        'zip','apk','project','url','link'
    ));
