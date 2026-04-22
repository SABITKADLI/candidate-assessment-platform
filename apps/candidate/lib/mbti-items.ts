// MBTI-style 4-dimension questionnaire (inspired by the Form M).
// Each item presents two phrases; candidate picks the one that fits better.
// Dimensions: EI=Extraversion/Introversion, SN=Sensing/iNtuition,
//             TF=Thinking/Feeling, JP=Judging/Perceiving.

export type Dimension = 'EI' | 'SN' | 'TF' | 'JP';
// Which pole does option A score towards?
export type PoleA = 'E' | 'S' | 'T' | 'J';
export type PoleB = 'I' | 'N' | 'F' | 'P';

export interface MbtiItem {
  id: string;
  dimension: Dimension;
  a: string;  // option scoring towards poleA
  b: string;  // option scoring towards poleB
}

export const MBTI_ITEMS: MbtiItem[] = [
  // ── E / I ────────────────────────────────────────────────────────────────────
  { id:'EI01', dimension:'EI', a:'Wide social circle', b:'Small circle of close friends' },
  { id:'EI02', dimension:'EI', a:'Talk things through', b:'Think things through' },
  { id:'EI03', dimension:'EI', a:'Approachable', b:'Reserved' },
  { id:'EI04', dimension:'EI', a:'Energised by socialising', b:'Energised by solitude' },
  { id:'EI05', dimension:'EI', a:'Action-oriented', b:'Reflective' },
  { id:'EI06', dimension:'EI', a:'Share thoughts freely', b:'Guard your thoughts' },
  { id:'EI07', dimension:'EI', a:'Outgoing', b:'Introspective' },
  { id:'EI08', dimension:'EI', a:'Learn by doing', b:'Learn by thinking' },
  { id:'EI09', dimension:'EI', a:'Speak first, think later', b:'Think first, speak later' },
  { id:'EI10', dimension:'EI', a:'Prefer working in groups', b:'Prefer working alone' },
  { id:'EI11', dimension:'EI', a:'Easy to read', b:'Hard to read' },
  { id:'EI12', dimension:'EI', a:'Expressive', b:'Contained' },
  { id:'EI13', dimension:'EI', a:'Enjoy meeting new people', b:'Prefer familiar company' },
  { id:'EI14', dimension:'EI', a:'Many acquaintances', b:'Few deep friendships' },
  { id:'EI15', dimension:'EI', a:'Network broadly', b:'Network selectively' },
  { id:'EI16', dimension:'EI', a:'Like variety and activity', b:'Like quiet and focus' },
  { id:'EI17', dimension:'EI', a:'Start conversations easily', b:'Wait to be approached' },
  { id:'EI18', dimension:'EI', a:'Comfortable in the spotlight', b:'Prefer behind-the-scenes' },
  { id:'EI19', dimension:'EI', a:'Think out loud', b:'Process internally' },
  { id:'EI20', dimension:'EI', a:'Communicate readily', b:'Communicate selectively' },
  { id:'EI21', dimension:'EI', a:'Sociable', b:'Solitary' },
  { id:'EI22', dimension:'EI', a:'Parties recharge you', b:'Parties drain you' },
  { id:'EI23', dimension:'EI', a:'Join groups readily', b:'Join groups cautiously' },
  // ── S / N ────────────────────────────────────────────────────────────────────
  { id:'SN01', dimension:'SN', a:'Focus on what is', b:'Focus on what could be' },
  { id:'SN02', dimension:'SN', a:'Concrete facts', b:'Abstract concepts' },
  { id:'SN03', dimension:'SN', a:'Practical', b:'Imaginative' },
  { id:'SN04', dimension:'SN', a:'Trust experience', b:'Trust instinct' },
  { id:'SN05', dimension:'SN', a:'Present-focused', b:'Future-focused' },
  { id:'SN06', dimension:'SN', a:'Step-by-step', b:'Big-picture' },
  { id:'SN07', dimension:'SN', a:'Detail-oriented', b:'Pattern-oriented' },
  { id:'SN08', dimension:'SN', a:'Realistic', b:'Idealistic' },
  { id:'SN09', dimension:'SN', a:'Literal', b:'Metaphorical' },
  { id:'SN10', dimension:'SN', a:'Proven methods', b:'New approaches' },
  { id:'SN11', dimension:'SN', a:'Common sense', b:'Innovative thinking' },
  { id:'SN12', dimension:'SN', a:'Observe carefully', b:'Read between the lines' },
  { id:'SN13', dimension:'SN', a:'Hands-on learner', b:'Conceptual learner' },
  { id:'SN14', dimension:'SN', a:'Sensible', b:'Inventive' },
  { id:'SN15', dimension:'SN', a:'Down-to-earth', b:'Head in the clouds' },
  { id:'SN16', dimension:'SN', a:'Sequential', b:'Random' },
  { id:'SN17', dimension:'SN', a:'Work steadily', b:'Work in bursts' },
  { id:'SN18', dimension:'SN', a:'Prefer doing', b:'Prefer dreaming' },
  { id:'SN19', dimension:'SN', a:'Attend to details', b:'Attend to themes' },
  { id:'SN20', dimension:'SN', a:'Factual', b:'Speculative' },
  { id:'SN21', dimension:'SN', a:'Conventional', b:'Original' },
  { id:'SN22', dimension:'SN', a:'Trust the tangible', b:'Trust the possible' },
  { id:'SN23', dimension:'SN', a:'Grounded', b:'Visionary' },
  // ── T / F ────────────────────────────────────────────────────────────────────
  { id:'TF01', dimension:'TF', a:'Logic first', b:'Feelings first' },
  { id:'TF02', dimension:'TF', a:'Impartial analysis', b:'Personal values' },
  { id:'TF03', dimension:'TF', a:'Frank', b:'Tactful' },
  { id:'TF04', dimension:'TF', a:'Head', b:'Heart' },
  { id:'TF05', dimension:'TF', a:'Objective', b:'Empathetic' },
  { id:'TF06', dimension:'TF', a:'Critique the idea', b:'Consider the person' },
  { id:'TF07', dimension:'TF', a:'Firm', b:'Gentle' },
  { id:'TF08', dimension:'TF', a:'Detached', b:'Involved' },
  { id:'TF09', dimension:'TF', a:'Principled', b:'Compassionate' },
  { id:'TF10', dimension:'TF', a:'Prefer truth over comfort', b:'Prefer harmony over truth' },
  { id:'TF11', dimension:'TF', a:'Analytical', b:'Appreciative' },
  { id:'TF12', dimension:'TF', a:'Competence-focused', b:'Relationship-focused' },
  { id:'TF13', dimension:'TF', a:'Convinced by logic', b:'Convinced by emotion' },
  { id:'TF14', dimension:'TF', a:'Tough-minded', b:'Tender-hearted' },
  { id:'TF15', dimension:'TF', a:'Decide by reasoning', b:'Decide by values' },
  { id:'TF16', dimension:'TF', a:'Task-focused', b:'People-focused' },
  { id:'TF17', dimension:'TF', a:'Justice', b:'Mercy' },
  { id:'TF18', dimension:'TF', a:'Impersonal criteria', b:'Personal criteria' },
  { id:'TF19', dimension:'TF', a:'Concise and direct', b:'Warm and personal' },
  { id:'TF20', dimension:'TF', a:'Question assumptions', b:'Accept harmony' },
  { id:'TF21', dimension:'TF', a:'Matter-of-fact', b:'Sympathetic' },
  { id:'TF22', dimension:'TF', a:'Honest over diplomatic', b:'Diplomatic over honest' },
  { id:'TF23', dimension:'TF', a:'Cool-headed', b:'Warm-hearted' },
  { id:'TF24', dimension:'TF', a:'Independent', b:'Accommodating' },
  // ── J / P ────────────────────────────────────────────────────────────────────
  { id:'JP01', dimension:'JP', a:'Planned', b:'Spontaneous' },
  { id:'JP02', dimension:'JP', a:'Organised', b:'Flexible' },
  { id:'JP03', dimension:'JP', a:'Decisive', b:'Open-minded' },
  { id:'JP04', dimension:'JP', a:'Like things settled', b:'Like things open' },
  { id:'JP05', dimension:'JP', a:'Make lists', b:'Adapt as you go' },
  { id:'JP06', dimension:'JP', a:'Punctual', b:'Relaxed about time' },
  { id:'JP07', dimension:'JP', a:'Closure-seeking', b:'Exploration-seeking' },
  { id:'JP08', dimension:'JP', a:'Structured', b:'Unstructured' },
  { id:'JP09', dimension:'JP', a:'Scheduled', b:'Unscheduled' },
  { id:'JP10', dimension:'JP', a:'Deliberate', b:'Go with the flow' },
  { id:'JP11', dimension:'JP', a:'Prefer routine', b:'Prefer variety' },
  { id:'JP12', dimension:'JP', a:'Like knowing the plan', b:'Like surprises' },
  { id:'JP13', dimension:'JP', a:'Work before play', b:'Mix work and play' },
  { id:'JP14', dimension:'JP', a:'Early starter', b:'Deadline-driven' },
  { id:'JP15', dimension:'JP', a:'Tidy', b:'Casual about clutter' },
  { id:'JP16', dimension:'JP', a:'Definite', b:'Tentative' },
  { id:'JP17', dimension:'JP', a:'Stick to the plan', b:'Revise the plan' },
  { id:'JP18', dimension:'JP', a:'Finish before moving on', b:'Start many things' },
  { id:'JP19', dimension:'JP', a:'Like clear expectations', b:'Like freedom to improvise' },
  { id:'JP20', dimension:'JP', a:'Methodical', b:'Ad hoc' },
  { id:'JP21', dimension:'JP', a:'Systematic', b:'Casual' },
  { id:'JP22', dimension:'JP', a:'Prefer deadlines', b:'Dislike deadlines' },
  { id:'JP23', dimension:'JP', a:'Settled and decided', b:'Pending and open' },
];

/** Compute MBTI type string and pole-preference percentages. */
export function scoreMbti(answers: Record<string, 'a' | 'b'>): {
  type: string;
  scores: Record<Dimension, { a: number; b: number }>;
} {
  const counts: Record<Dimension, { a: number; b: number }> = {
    EI: { a: 0, b: 0 }, SN: { a: 0, b: 0 },
    TF: { a: 0, b: 0 }, JP: { a: 0, b: 0 },
  };

  for (const item of MBTI_ITEMS) {
    const ans = answers[item.id];
    if (!ans) continue;
    counts[item.dimension][ans] += 1;
  }

  function pole(dim: Dimension): string {
    const { a, b } = counts[dim];
    const total = a + b || 1;
    return a / total >= 0.5
      ? (dim[0] ?? dim)   // first letter = A pole (E, S, T, J)
      : (dim[1] ?? dim);  // second letter = B pole (I, N, F, P)
  }

  const type = pole('EI') + pole('SN') + pole('TF') + pole('JP');
  return { type, scores: counts };
}
