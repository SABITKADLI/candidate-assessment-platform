-- 0010_gma_item_bank_50.sql
-- Expand the GMA item bank to 50 active items. The assessment samples from
-- this bank per session, so a larger bank reduces repeat exposure.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS gma_items_prompt_uk ON app.gma_items (prompt);

WITH new_items (category, prompt, choices, correct_index, difficulty) AS (
  VALUES
    -- verbal (12)
    ('verbal', 'Choose the word most similar in meaning to "mitigate".',
      '["lessen","measure","ignore","divide"]'::jsonb, 0, 2),
    ('verbal', 'Choose the word most opposite in meaning to "ambiguous".',
      '["uncertain","clear","complex","brief"]'::jsonb, 1, 2),
    ('verbal', 'Complete the analogy: Blueprint is to Architect as Recipe is to ___.',
      '["chef","meal","kitchen","ingredient"]'::jsonb, 0, 2),
    ('verbal', 'Select the word that does NOT belong with the others.',
      '["rapid","swift","gradual","quick"]'::jsonb, 2, 1),
    ('verbal', 'Choose the word closest in meaning to "prudent".',
      '["careful","reckless","ordinary","public"]'::jsonb, 0, 2),
    ('verbal', 'Complete the analogy: Compass is to Direction as Clock is to ___.',
      '["time","speed","distance","sound"]'::jsonb, 0, 1),
    ('verbal', 'Choose the word most opposite in meaning to "scarce".',
      '["rare","limited","abundant","useful"]'::jsonb, 2, 1),
    ('verbal', 'Which sentence is grammatically correct?',
      '["Each of the reports were reviewed.","Each of the reports was reviewed.","Each reports was reviewed.","Each of reports were reviewed."]'::jsonb, 1, 3),
    ('verbal', 'Choose the word closest in meaning to "infer".',
      '["deduce","announce","copy","delay"]'::jsonb, 0, 2),
    ('verbal', 'Complete the analogy: Seed is to Plant as Idea is to ___.',
      '["plan","soil","question","memory"]'::jsonb, 0, 2),
    ('verbal', 'Choose the word most opposite in meaning to "expand".',
      '["increase","contract","include","explain"]'::jsonb, 1, 1),
    ('verbal', 'Select the pair with the same relationship as "author:book".',
      '["painter:canvas","doctor:hospital","teacher:student","driver:road"]'::jsonb, 0, 3),

    -- numerical (12)
    ('numerical', 'A product costs 80 after a 20% discount. What was the original price?',
      '["96","100","104","120"]'::jsonb, 1, 3),
    ('numerical', 'If 5 notebooks cost 35, how much do 8 notebooks cost at the same rate?',
      '["48","52","56","60"]'::jsonb, 2, 1),
    ('numerical', 'What is the next number in the sequence: 4, 9, 19, 39, __?',
      '["59","69","79","89"]'::jsonb, 2, 3),
    ('numerical', 'A value increases from 50 to 65. What is the percentage increase?',
      '["15%","20%","25%","30%"]'::jsonb, 3, 2),
    ('numerical', 'The average of 6, 8, 10, and x is 9. What is x?',
      '["9","10","11","12"]'::jsonb, 3, 2),
    ('numerical', 'A car travels 150 km at 60 km/h and then 90 km at 45 km/h. How many total hours does it travel?',
      '["3.5","4.0","4.5","5.0"]'::jsonb, 2, 3),
    ('numerical', 'If 2/5 of a number is 18, what is the number?',
      '["36","40","45","50"]'::jsonb, 2, 2),
    ('numerical', 'A team completes 3/8 of a project on Monday and 1/4 on Tuesday. What fraction remains?',
      '["1/8","1/4","3/8","1/2"]'::jsonb, 2, 3),
    ('numerical', 'What is 12.5% of 640?',
      '["64","72","80","96"]'::jsonb, 2, 2),
    ('numerical', 'If y = 4x - 3 and x = 7, what is y?',
      '["21","25","28","31"]'::jsonb, 1, 1),
    ('numerical', 'A ratio of 3:5 totals 64. What is the larger part?',
      '["24","32","40","48"]'::jsonb, 2, 2),
    ('numerical', 'A number is doubled, then 6 is added, giving 34. What was the original number?',
      '["12","14","16","20"]'::jsonb, 1, 1),

    -- abstract (11)
    ('abstract', 'Which number continues the sequence: 1, 4, 9, 16, 25, __?',
      '["30","32","36","49"]'::jsonb, 2, 1),
    ('abstract', 'Which letter comes next: Z, X, U, Q, L, __?',
      '["F","G","H","I"]'::jsonb, 0, 4),
    ('abstract', 'If all Vens are Loms and no Loms are Pirs, which must be true?',
      '["Some Vens are Pirs","No Vens are Pirs","All Pirs are Vens","Some Loms are Vens"]'::jsonb, 1, 3),
    ('abstract', 'Find the odd one out: 16, 25, 36, 49, 60.',
      '["16","25","36","60"]'::jsonb, 3, 2),
    ('abstract', 'Which number completes the pattern: 3, 6, 12, 24, __?',
      '["30","36","42","48"]'::jsonb, 3, 1),
    ('abstract', 'If the code for CAT is DBU, what is the code for DOG?',
      '["EPH","EOF","CNG","FQI"]'::jsonb, 0, 2),
    ('abstract', 'Which pair follows the same rule as 2 -> 5?',
      '["3 -> 6","4 -> 9","5 -> 8","6 -> 10"]'::jsonb, 1, 2),
    ('abstract', 'A pattern alternates circle, square, triangle, circle, square, __. What comes next?',
      '["circle","square","triangle","pentagon"]'::jsonb, 2, 1),
    ('abstract', 'Which number continues the sequence: 81, 27, 9, 3, __?',
      '["0","1","2","6"]'::jsonb, 1, 2),
    ('abstract', 'If A is taller than B and B is taller than C, which statement must be true?',
      '["C is taller than A","A is taller than C","B is shortest","A and C are equal"]'::jsonb, 1, 1),
    ('abstract', 'Which word completes the pattern: north, east, south, west, north, __?',
      '["east","south","west","north"]'::jsonb, 0, 1)
)
INSERT INTO app.gma_items (category, prompt, choices, correct_index, difficulty)
SELECT category, prompt, choices, correct_index, difficulty
FROM new_items
ON CONFLICT (prompt) DO NOTHING;

COMMIT;
