-- 005_book_topics.sql
-- Add a `topic` column to the library catalog so books can be browsed by
-- subject (Algorithms, AI, Machine Learning, ...). Existing rows are
-- back-filled by keyword-matching the title; the CASE arms are ordered
-- specific-first (e.g. "deep learning" before "machine learning" before "ai")
-- so the most precise topic wins. Anything unmatched falls back to 'General'.
-- The Go deriveTopic() helper mirrors this ordering for newly-inserted books.

ALTER TABLE library_catalog
    ADD COLUMN IF NOT EXISTS topic TEXT NOT NULL DEFAULT 'General';

UPDATE library_catalog SET topic = CASE
    WHEN lower(title) ~ 'deep learning'                                              THEN 'Deep Learning'
    WHEN lower(title) ~ 'machine learning'                                           THEN 'Machine Learning'
    WHEN lower(title) ~ 'artificial intelligence' OR lower(title) ~ '\yai\y'         THEN 'Artificial Intelligence'
    WHEN lower(title) ~ 'data structure'                                             THEN 'Data Structures'
    WHEN lower(title) ~ 'algorithm'                                                  THEN 'Algorithms'
    WHEN lower(title) ~ 'database|\ysql\y'                                           THEN 'Databases'
    WHEN lower(title) ~ 'operating system'                                           THEN 'Operating Systems'
    WHEN lower(title) ~ 'network'                                                    THEN 'Networking'
    WHEN lower(title) ~ 'compiler'                                                   THEN 'Compilers'
    WHEN lower(title) ~ 'architecture|organization'                                  THEN 'Computer Architecture'
    WHEN lower(title) ~ 'software engineering'                                       THEN 'Software Engineering'
    WHEN lower(title) ~ 'data science|data mining|big data'                          THEN 'Data Science'
    WHEN lower(title) ~ 'security|cryptograph|cyber'                                 THEN 'Security'
    WHEN lower(title) ~ 'web|html|javascript|react'                                  THEN 'Web Development'
    WHEN lower(title) ~ 'discrete|calculus|algebra|mathematic|probabilit|statistic'  THEN 'Mathematics'
    WHEN lower(title) ~ 'python|java|c\+\+|programming|coding'                        THEN 'Programming'
    WHEN lower(title) ~ 'computation|automata'                                       THEN 'Theory of Computation'
    ELSE 'General'
END
WHERE topic = 'General';

CREATE INDEX IF NOT EXISTS idx_catalog_topic ON library_catalog (topic);
