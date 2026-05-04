-- 0011_gma_fill_item_bank_to_50.sql
-- Add two replacement GMA items for prompt conflicts skipped by 0010.

BEGIN;

WITH new_items (category, prompt, choices, correct_index, difficulty) AS (
  VALUES
    ('verbal', 'Select the word that does NOT belong with this group: agile, nimble, sluggish, quick.',
      '["agile","nimble","sluggish","quick"]'::jsonb, 2, 1),
    ('verbal', 'Which sentence uses correct subject-verb agreement?',
      '["The list of tasks are complete.","The list of tasks is complete.","The tasks list is complete yesterday.","The list tasks are complete."]'::jsonb, 1, 3)
)
INSERT INTO app.gma_items (category, prompt, choices, correct_index, difficulty)
SELECT category, prompt, choices, correct_index, difficulty
FROM new_items
ON CONFLICT (prompt) DO NOTHING;

COMMIT;
