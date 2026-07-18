-- Resource reviews & ratings (research / project / archive items).
CREATE TABLE IF NOT EXISTS resource_reviews (
    review_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id    UUID NOT NULL,
    user_id    UUID NOT NULL,
    rating     INT  NOT NULL CHECK (rating BETWEEN 1 AND 5),
    body       TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (item_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_resource_reviews_item ON resource_reviews(item_id);
