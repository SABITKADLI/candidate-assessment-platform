-- 0006_gma_items.sql
-- Item bank for the GMA stage. MVP: 15 items across 3 categories; the server
-- samples N per session. Production swaps this for a larger calibrated bank
-- with item-response-theory difficulty estimates.

BEGIN;

CREATE TABLE IF NOT EXISTS app.gma_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category       text NOT NULL CHECK (category IN ('verbal','numerical','abstract')),
  prompt         text NOT NULL,
  choices        jsonb NOT NULL,            -- array of 4-5 strings
  correct_index  smallint NOT NULL CHECK (correct_index >= 0),
  difficulty     smallint NOT NULL DEFAULT 3 CHECK (difficulty BETWEEN 1 AND 5),
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gma_items_cat_idx ON app.gma_items (category) WHERE active;

-- ---- seed (idempotent via name uniqueness in app.roles pattern) ----
-- We don't have a stable key; use NOT EXISTS on count to avoid re-seeding.
DO $$
BEGIN
  IF (SELECT count(*) FROM app.gma_items) = 0 THEN
    INSERT INTO app.gma_items (category, prompt, choices, correct_index, difficulty) VALUES
    -- verbal (5)
    ('verbal', 'Choose the word most similar in meaning to "concise".',
      '["brief","ornate","lengthy","uncertain"]'::jsonb, 0, 2),
    ('verbal', 'Choose the word most opposite in meaning to "ephemeral".',
      '["transient","fleeting","permanent","brief"]'::jsonb, 2, 3),
    ('verbal', 'Complete the analogy: Novice is to Expert as Sapling is to ___.',
      '["seed","tree","forest","branch"]'::jsonb, 1, 2),
    ('verbal', 'Which sentence is grammatically correct?',
      '["Neither of the proposals are acceptable.","Neither of the proposals is acceptable.","Neither proposals are acceptable.","Neither of the proposal is acceptable."]'::jsonb, 1, 3),
    ('verbal', 'Select the word that does NOT belong with the others.',
      '["diligent","assiduous","indolent","industrious"]'::jsonb, 2, 2),

    -- numerical (5)
    ('numerical', 'If 3x + 7 = 22, what is the value of x?',
      '["3","5","7","15"]'::jsonb, 1, 2),
    ('numerical', 'A team of 6 completes a task in 8 days. How many days will 4 workers of equal productivity take?',
      '["10","12","14","16"]'::jsonb, 1, 3),
    ('numerical', 'What is 15% of 240?',
      '["24","30","36","42"]'::jsonb, 2, 1),
    ('numerical', 'A train travels 180 km in 2.5 hours. What is its average speed in km/h?',
      '["60","66","72","80"]'::jsonb, 2, 2),
    ('numerical', 'If the ratio of A:B is 2:3 and A:C is 4:5, what is B:C?',
      '["5:6","6:5","3:5","2:5"]'::jsonb, 1, 4),

    -- abstract (5)
    ('abstract', 'Which number continues the sequence: 2, 6, 12, 20, 30, __?',
      '["36","40","42","48"]'::jsonb, 2, 2),
    ('abstract', 'Which letter comes next: A, C, F, J, O, __?',
      '["T","U","V","W"]'::jsonb, 1, 3),
    ('abstract', 'If all Bloops are Razzles and some Razzles are Tazzles, which must be true?',
      '["All Bloops are Tazzles","Some Bloops may be Tazzles","No Bloops are Tazzles","All Tazzles are Bloops"]'::jsonb, 1, 3),
    ('abstract', 'A cube has sides of length 3. What is the ratio of its surface area to its volume?',
      '["1:1","2:1","2:3","3:2"]'::jsonb, 1, 4),
    ('abstract', 'Which shape does not share the property the others have? (square, circle, triangle, pentagon)',
      '["square","circle","triangle","pentagon"]'::jsonb, 1, 2);
  END IF;
END $$;

COMMIT;
