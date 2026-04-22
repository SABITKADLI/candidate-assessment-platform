// Overt integrity questionnaire — 32 items.
// Measures: honesty/ethics, reliability, conscientiousness, anti-theft/anti-fraud attitudes.
// Scoring: 5-point Likert. Keyed '+' items score as-is; '-' items are reversed.
// High score = high integrity.

export interface IntegrityItem {
  id: string;
  text: string;
  keyed: '+' | '-';
}

export const INTEGRITY_ITEMS: IntegrityItem[] = [
  { id:'INT01', keyed:'+', text:'People should always be honest, even when the truth is uncomfortable.' },
  { id:'INT02', keyed:'+', text:'I believe stealing is always wrong, regardless of the circumstances.' },
  { id:'INT03', keyed:'+', text:'I would report a colleague I saw taking company property.' },
  { id:'INT04', keyed:'+', text:'I always try to do my job to the best of my ability.' },
  { id:'INT05', keyed:'+', text:'Following rules is important even when no one is watching.' },
  { id:'INT06', keyed:'+', text:'I keep my commitments, even when it is inconvenient.' },
  { id:'INT07', keyed:'+', text:'Being trusted by others is very important to me.' },
  { id:'INT08', keyed:'+', text:'I would never falsify records or reports at work.' },
  { id:'INT09', keyed:'+', text:'I think people who steal from employers deserve serious consequences.' },
  { id:'INT10', keyed:'+', text:'Honesty should not be compromised for personal gain.' },
  { id:'INT11', keyed:'+', text:'I take responsibility for my mistakes.' },
  { id:'INT12', keyed:'+', text:'I would feel guilty if I used company time for personal matters without permission.' },
  { id:'INT13', keyed:'+', text:'I believe that rules exist for good reasons and should be followed.' },
  { id:'INT14', keyed:'+', text:'I try to treat everyone fairly, regardless of my personal feelings.' },
  { id:'INT15', keyed:'+', text:'I would rather lose a sale than deceive a customer.' },
  { id:'INT16', keyed:'+', text:'I feel it is important to be consistent between what I say and what I do.' },
  { id:'INT17', keyed:'-', text:'It is acceptable to take small items from an employer — they won\'t miss them.' },
  { id:'INT18', keyed:'-', text:'Bending the rules slightly is fine if it helps get the job done.' },
  { id:'INT19', keyed:'-', text:'People who never cheat are just afraid of getting caught.' },
  { id:'INT20', keyed:'-', text:'Sometimes a small lie is better than an uncomfortable truth at work.' },
  { id:'INT21', keyed:'-', text:'Padding an expense report by a small amount is not really wrong.' },
  { id:'INT22', keyed:'-', text:'It is acceptable to call in sick when you just want a day off.' },
  { id:'INT23', keyed:'-', text:'Most people steal from employers given the chance.' },
  { id:'INT24', keyed:'-', text:'Workplace rules are often unnecessary bureaucracy.' },
  { id:'INT25', keyed:'-', text:'Personal loyalty sometimes justifies bending company policy.' },
  { id:'INT26', keyed:'-', text:'There are situations where it is okay to falsify documents.' },
  { id:'INT27', keyed:'-', text:'Borrowing work equipment for personal use without asking is generally fine.' },
  { id:'INT28', keyed:'-', text:'People should not be held responsible for mistakes caused by bad systems.' },
  { id:'INT29', keyed:'-', text:'A little exaggeration on a resume is harmless.' },
  { id:'INT30', keyed:'-', text:'I sometimes let colleagues take credit for work I did to keep the peace.' },
  { id:'INT31', keyed:'-', text:'Avoiding blame is more important than being transparent about errors.' },
  { id:'INT32', keyed:'-', text:'Rules should be interpreted loosely when the outcome benefits everyone.' },
];

export const LIKERT = [
  { value: 1, label: 'Strongly disagree' },
  { value: 2, label: 'Disagree' },
  { value: 3, label: 'Neutral' },
  { value: 4, label: 'Agree' },
  { value: 5, label: 'Strongly agree' },
] as const;

export type LikertVal = 1 | 2 | 3 | 4 | 5;

export function scoreIntegrity(answers: Record<string, LikertVal>): number {
  let total = 0;
  let count = 0;
  for (const item of INTEGRITY_ITEMS) {
    const raw = answers[item.id];
    if (raw == null) continue;
    total += item.keyed === '+' ? raw : (6 - raw);
    count++;
  }
  return count === 0 ? 0 : Math.round((total / (count * 5)) * 100);
}
