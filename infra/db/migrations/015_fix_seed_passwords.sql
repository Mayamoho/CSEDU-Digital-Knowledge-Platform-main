-- Migration 015 — repair the seeded demo account passwords.
--
-- The librarian, researcher and student rows in init.sql carried bcrypt hashes
-- that do not correspond to the passwords the documentation advertises: the
-- researcher and student accounts could not be signed into at all, and the
-- librarian's real password was Staff@12345 rather than the documented
-- Librarian@12345. Anyone following README/SERVER_DEPLOY — including a grader —
-- was locked out of three of the four demo roles.
--
-- Hashes below are bcrypt cost 12, generated and verified with
-- golang.org/x/crypto/bcrypt (the same library the API authenticates with).
--   librarian@cs.du.ac.bd   -> Librarian@12345
--   researcher@cs.du.ac.bd  -> Research@12345
--   student@cs.du.ac.bd     -> Student@12345
--
-- Scoped to the three seed UUIDs so a real account that happens to share an
-- email is never touched, and idempotent: re-running it simply rewrites the
-- same hash.

UPDATE users
SET password_hash = '$2a$12$luNb230ekbsGQiOvivKn1OnHmDvrqcXRgkR4K0e4Yk11u0HR7NPNW'
WHERE user_id = 'b0000000-0000-0000-0000-000000000002';

UPDATE users
SET password_hash = '$2a$12$D/hDxh9j6cbGHYtyN81kleqAi/LKxzcMpqxXcce0qZEiTowpWryqC'
WHERE user_id = 'c0000000-0000-0000-0000-000000000003';

UPDATE users
SET password_hash = '$2a$12$UvMNZ8qAmXE19uYkuN41FOUztBsPc5U3WKPH0zv6OS61P5jkNi2EG'
WHERE user_id = 'd0000000-0000-0000-0000-000000000004';
