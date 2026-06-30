-- Rename session status values to match new state model
UPDATE sessions SET status = 'games' WHERE status = 'in_progress';
UPDATE sessions SET status = 'games' WHERE status = 'boxes_assigned';
