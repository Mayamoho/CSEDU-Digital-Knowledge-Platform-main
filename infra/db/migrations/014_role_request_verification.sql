-- Stronger, more trustworthy role-upgrade requests.
-- Applicants must now supply a verifiable university/registration ID and a
-- public evidence link (university profile, ORCID, department page, etc.) so an
-- administrator can confirm the person's affiliation before granting access.
-- Idempotent for re-runnable deploys.

ALTER TABLE role_requests
    ADD COLUMN IF NOT EXISTS university_id TEXT NOT NULL DEFAULT '';

ALTER TABLE role_requests
    ADD COLUMN IF NOT EXISTS evidence_url TEXT NOT NULL DEFAULT '';
