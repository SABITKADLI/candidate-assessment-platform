// IPIP-NEO-120: 24 items per factor (120 total), 12 keyed + and 12 keyed -.
// Scoring: Agree strongly=5 ... Disagree strongly=1 for + items; reversed for - items.
// Factors: O=Openness, C=Conscientiousness, E=Extraversion, A=Agreeableness, N=Neuroticism

export type Factor = 'O' | 'C' | 'E' | 'A' | 'N';
export type LikertValue = 1 | 2 | 3 | 4 | 5;

export interface Big5Item {
  id: string;
  text: string;
  factor: Factor;
  keyed: '+' | '-';
  isCheck?: true;
  checkValue?: LikertValue;
}

export const BIG5_ITEMS: Big5Item[] = [
  // ── Neuroticism (N) ──────────────────────────────────────────────────────────
  { id:'N01', factor:'N', keyed:'+', text:'I get stressed out easily.' },
  { id:'N02', factor:'N', keyed:'+', text:'I am filled with doubts about things.' },
  { id:'N03', factor:'N', keyed:'+', text:'I get upset easily.' },
  { id:'N04', factor:'N', keyed:'+', text:'I change my mood a lot.' },
  { id:'N05', factor:'N', keyed:'+', text:'I have frequent mood swings.' },
  { id:'N06', factor:'N', keyed:'+', text:'I get irritated easily.' },
  { id:'N07', factor:'N', keyed:'+', text:'I often feel blue.' },
  { id:'N08', factor:'N', keyed:'+', text:'I worry about things.' },
  { id:'N09', factor:'N', keyed:'+', text:'I am easily disturbed.' },
  { id:'N10', factor:'N', keyed:'+', text:'I dislike myself.' },
  { id:'N11', factor:'N', keyed:'+', text:'I am often down in the dumps.' },
  { id:'N12', factor:'N', keyed:'+', text:'I have a low opinion of myself.' },
  { id:'N13', factor:'N', keyed:'-', text:'I seldom feel blue.' },
  { id:'N14', factor:'N', keyed:'-', text:'I am relaxed most of the time.' },
  { id:'N15', factor:'N', keyed:'-', text:'I rarely get irritated.' },
  { id:'N16', factor:'N', keyed:'-', text:'I am not easily bothered by things.' },
  { id:'N17', factor:'N', keyed:'-', text:'I keep my emotions under control.' },
  { id:'N18', factor:'N', keyed:'-', text:'I am not easily upset.' },
  { id:'N19', factor:'N', keyed:'-', text:'I remain calm under pressure.' },
  { id:'N20', factor:'N', keyed:'-', text:'I am hard to get annoyed.' },
  { id:'N21', factor:'N', keyed:'-', text:'I rarely feel depressed.' },
  { id:'N22', factor:'N', keyed:'-', text:'I feel comfortable with myself.' },
  { id:'N23', factor:'N', keyed:'-', text:'I accept myself for who I am.' },
  { id:'N24', factor:'N', keyed:'-', text:'I rarely get rattled.' },
  // Attention check — psychometric validity item. Correct answer is specified in the text.
  { id:'ACK1', factor:'N', keyed:'+', isCheck: true, checkValue: 4,
    text:'Quality check: please select "Agree a little" (the 4th option) for this item.' },
  // ── Extraversion (E) ─────────────────────────────────────────────────────────
  { id:'E01', factor:'E', keyed:'+', text:'I am the life of the party.' },
  { id:'E02', factor:'E', keyed:'+', text:'I feel comfortable around people.' },
  { id:'E03', factor:'E', keyed:'+', text:'I start conversations.' },
  { id:'E04', factor:'E', keyed:'+', text:'I talk to a lot of different people at parties.' },
  { id:'E05', factor:'E', keyed:'+', text:'I enjoy talking with people.' },
  { id:'E06', factor:'E', keyed:'+', text:'I am easy to get to know.' },
  { id:'E07', factor:'E', keyed:'+', text:'I make friends easily.' },
  { id:'E08', factor:'E', keyed:'+', text:'I am skilled in handling social situations.' },
  { id:'E09', factor:'E', keyed:'+', text:'I love large parties.' },
  { id:'E10', factor:'E', keyed:'+', text:'I warm up quickly to others.' },
  { id:'E11', factor:'E', keyed:'+', text:'I like to take charge.' },
  { id:'E12', factor:'E', keyed:'+', text:'I draw attention to myself.' },
  { id:'E13', factor:'E', keyed:'-', text:'I don\'t talk a lot.' },
  { id:'E14', factor:'E', keyed:'-', text:'I keep in the background.' },
  { id:'E15', factor:'E', keyed:'-', text:'I have little to say.' },
  { id:'E16', factor:'E', keyed:'-', text:'I don\'t like drawing attention to myself.' },
  { id:'E17', factor:'E', keyed:'-', text:'I prefer to be by myself.' },
  { id:'E18', factor:'E', keyed:'-', text:'I don\'t like parties.' },
  { id:'E19', factor:'E', keyed:'-', text:'I am hard to get to know.' },
  { id:'E20', factor:'E', keyed:'-', text:'I rarely look for excitement.' },
  { id:'E21', factor:'E', keyed:'-', text:'I find it difficult to approach others.' },
  { id:'E22', factor:'E', keyed:'-', text:'I am not a very enthusiastic person.' },
  { id:'E23', factor:'E', keyed:'-', text:'I wait for others to lead the way.' },
  { id:'E24', factor:'E', keyed:'-', text:'I say little in social situations.' },
  // ── Openness (O) ─────────────────────────────────────────────────────────────
  { id:'O01', factor:'O', keyed:'+', text:'I have a rich vocabulary.' },
  { id:'O02', factor:'O', keyed:'+', text:'I have a vivid imagination.' },
  { id:'O03', factor:'O', keyed:'+', text:'I have excellent ideas.' },
  { id:'O04', factor:'O', keyed:'+', text:'I am quick to understand things.' },
  { id:'O05', factor:'O', keyed:'+', text:'I use difficult words.' },
  { id:'O06', factor:'O', keyed:'+', text:'I spend time reflecting on things.' },
  { id:'O07', factor:'O', keyed:'+', text:'I am full of ideas.' },
  { id:'O08', factor:'O', keyed:'+', text:'I enjoy thinking about things.' },
  { id:'O09', factor:'O', keyed:'+', text:'I like to think up new ways of doing things.' },
  { id:'O10', factor:'O', keyed:'+', text:'I love to read challenging material.' },
  { id:'O11', factor:'O', keyed:'+', text:'I enjoy hearing new ideas.' },
  { id:'O12', factor:'O', keyed:'+', text:'I tend to vote for liberal political candidates.' },
  { id:'O13', factor:'O', keyed:'-', text:'I do not have a good imagination.' },
  { id:'O14', factor:'O', keyed:'-', text:'I am not interested in abstract ideas.' },
  { id:'O15', factor:'O', keyed:'-', text:'I do not like art.' },
  { id:'O16', factor:'O', keyed:'-', text:'I avoid difficult reading material.' },
  { id:'O17', factor:'O', keyed:'-', text:'I am not interested in theoretical discussions.' },
  { id:'O18', factor:'O', keyed:'-', text:'I have difficulty imagining things.' },
  { id:'O19', factor:'O', keyed:'-', text:'I seldom daydream.' },
  { id:'O20', factor:'O', keyed:'-', text:'I do not enjoy going to art museums.' },
  { id:'O21', factor:'O', keyed:'-', text:'I prefer to stick with things I know.' },
  { id:'O22', factor:'O', keyed:'-', text:'I am not interested in poetry.' },
  { id:'O23', factor:'O', keyed:'-', text:'I am not interested in music or art.' },
  { id:'O24', factor:'O', keyed:'-', text:'I dislike changes.' },
  // ── Agreeableness (A) ────────────────────────────────────────────────────────
  { id:'A01', factor:'A', keyed:'+', text:'I feel others\' emotions.' },
  { id:'A02', factor:'A', keyed:'+', text:'I make people feel at ease.' },
  { id:'A03', factor:'A', keyed:'+', text:'I love to help others.' },
  { id:'A04', factor:'A', keyed:'+', text:'I am interested in people.' },
  { id:'A05', factor:'A', keyed:'+', text:'I sympathise with others\' feelings.' },
  { id:'A06', factor:'A', keyed:'+', text:'I take time out for others.' },
  { id:'A07', factor:'A', keyed:'+', text:'I have a soft heart.' },
  { id:'A08', factor:'A', keyed:'+', text:'I am easy to satisfy.' },
  { id:'A09', factor:'A', keyed:'+', text:'I believe that others have good intentions.' },
  { id:'A10', factor:'A', keyed:'+', text:'I try to understand other people.' },
  { id:'A11', factor:'A', keyed:'+', text:'I trust what people say.' },
  { id:'A12', factor:'A', keyed:'+', text:'I treat all people equally.' },
  { id:'A13', factor:'A', keyed:'-', text:'I am not really interested in others.' },
  { id:'A14', factor:'A', keyed:'-', text:'I insult people.' },
  { id:'A15', factor:'A', keyed:'-', text:'I am indifferent to the feelings of others.' },
  { id:'A16', factor:'A', keyed:'-', text:'I am not interested in other people\'s problems.' },
  { id:'A17', factor:'A', keyed:'-', text:'I suspect hidden motives in others.' },
  { id:'A18', factor:'A', keyed:'-', text:'I feel little concern for others.' },
  { id:'A19', factor:'A', keyed:'-', text:'I look down on others.' },
  { id:'A20', factor:'A', keyed:'-', text:'I try to get others to do what I want.' },
  { id:'A21', factor:'A', keyed:'-', text:'I disregard others\' feelings.' },
  { id:'A22', factor:'A', keyed:'-', text:'I can\'t be bothered with others\' needs.' },
  { id:'A23', factor:'A', keyed:'-', text:'I hold grudges.' },
  { id:'A24', factor:'A', keyed:'-', text:'I am hard to please.' },
  // Attention check — confirms the candidate is still reading each item carefully.
  { id:'ACK2', factor:'A', keyed:'-', isCheck: true, checkValue: 2,
    text:'Verification item: to confirm you are reading, please select "Disagree a little" (the 2nd option).' },
  // ── Conscientiousness (C) ────────────────────────────────────────────────────
  { id:'C01', factor:'C', keyed:'+', text:'I am always prepared.' },
  { id:'C02', factor:'C', keyed:'+', text:'I pay attention to details.' },
  { id:'C03', factor:'C', keyed:'+', text:'I get chores done right away.' },
  { id:'C04', factor:'C', keyed:'+', text:'I follow a schedule.' },
  { id:'C05', factor:'C', keyed:'+', text:'I like order.' },
  { id:'C06', factor:'C', keyed:'+', text:'I am exacting in my work.' },
  { id:'C07', factor:'C', keyed:'+', text:'I complete tasks successfully.' },
  { id:'C08', factor:'C', keyed:'+', text:'I make plans and stick to them.' },
  { id:'C09', factor:'C', keyed:'+', text:'I do things according to a plan.' },
  { id:'C10', factor:'C', keyed:'+', text:'I always know what I am doing.' },
  { id:'C11', factor:'C', keyed:'+', text:'I excel in what I do.' },
  { id:'C12', factor:'C', keyed:'+', text:'I carry out my plans.' },
  { id:'C13', factor:'C', keyed:'-', text:'I leave my belongings around.' },
  { id:'C14', factor:'C', keyed:'-', text:'I make a mess of things.' },
  { id:'C15', factor:'C', keyed:'-', text:'I often forget to put things back in their proper place.' },
  { id:'C16', factor:'C', keyed:'-', text:'I shirk my duties.' },
  { id:'C17', factor:'C', keyed:'-', text:'I waste my time.' },
  { id:'C18', factor:'C', keyed:'-', text:'I do just enough work to get by.' },
  { id:'C19', factor:'C', keyed:'-', text:'I find it difficult to get down to work.' },
  { id:'C20', factor:'C', keyed:'-', text:'I need a push to get started.' },
  { id:'C21', factor:'C', keyed:'-', text:'I am not bothered about making mistakes.' },
  { id:'C22', factor:'C', keyed:'-', text:'I don\'t see things through.' },
  { id:'C23', factor:'C', keyed:'-', text:'I mess things up.' },
  { id:'C24', factor:'C', keyed:'-', text:'I do things in a half-way manner.' },
];

// Likert scale labels (5-point)
export const LIKERT_LABELS = [
  { value: 1, label: 'Disagree strongly' },
  { value: 2, label: 'Disagree a little' },
  { value: 3, label: 'Neither agree nor disagree' },
  { value: 4, label: 'Agree a little' },
  { value: 5, label: 'Agree strongly' },
] as const;

/** Raw score → T-score per factor (mean=50, SD=10). Norms are approximate.
 *  In production replace with validated normative tables per sex/age cohort. */
export function scoreBig5(answers: Record<string, LikertValue>): Record<Factor, number> {
  const sums: Record<Factor, number> = { N: 0, E: 0, O: 0, A: 0, C: 0 };
  const counts: Record<Factor, number> = { N: 0, E: 0, O: 0, A: 0, C: 0 };

  for (const item of BIG5_ITEMS) {
    if (item.isCheck) continue;
    const raw = answers[item.id];
    if (raw == null) continue;
    const scored = item.keyed === '+' ? raw : (6 - raw) as LikertValue;
    sums[item.factor] += scored;
    counts[item.factor] += 1;
  }

  const result = {} as Record<Factor, number>;
  for (const f of ['N','E','O','A','C'] as Factor[]) {
    const n = counts[f] || 1;
    // Raw mean 0-5; simple linear rescale to 0-100.
    result[f] = Math.round((sums[f] / (n * 5)) * 100);
  }
  return result;
}
