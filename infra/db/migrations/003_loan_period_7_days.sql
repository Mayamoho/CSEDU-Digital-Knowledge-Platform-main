-- Shorten the loan period from 14 to 7 days and retroactively apply it to all
-- existing loans so overdue/fine behavior is consistent across old and new
-- borrows. New borrows already use 7 days via the API (library + loan handlers).
--
-- due_date is recomputed from checkout_date so the constraint chk_loan_dates
-- (due_date > checkout_date) always holds.

UPDATE loans
SET due_date = checkout_date + interval '7 days';
