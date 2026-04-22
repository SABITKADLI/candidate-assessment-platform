// Situational Judgement Test — 10 scenarios, 4 options each.
// Each option has a key: 'best' | 'acceptable' | 'poor' | 'worst'.
// Scoring: best=4, acceptable=2, poor=1, worst=0 (additive across all scenarios).

export type SjtOptionKey = 'A' | 'B' | 'C' | 'D';

export interface SjtOption {
  key: SjtOptionKey;
  text: string;
  score: 0 | 1 | 2 | 4;
}

export interface SjtScenario {
  id: string;
  situation: string;
  options: SjtOption[];
}

export const SJT_SCENARIOS: SjtScenario[] = [
  {
    id: 'SJT01',
    situation: 'You are working on an important project and notice a colleague has made a significant error in their portion of the work. The deadline is tomorrow. Your colleague has already left for the day.',
    options: [
      { key: 'A', score: 4, text: 'Fix the error yourself, document what you changed, then message your colleague explaining what you found and corrected so they are informed.' },
      { key: 'B', score: 2, text: 'Leave a message for your colleague to explain the issue and ask them to fix it first thing in the morning.' },
      { key: 'C', score: 1, text: 'Submit the project as-is and mention in your submission note that there may be an issue in your colleague\'s section.' },
      { key: 'D', score: 0, text: 'Do nothing and hope the error goes unnoticed by the reviewer.' },
    ],
  },
  {
    id: 'SJT02',
    situation: 'You disagree with a technical decision your team lead has made. You believe a different approach would result in better performance and maintainability.',
    options: [
      { key: 'A', score: 4, text: 'Request a brief meeting with your team lead to present your analysis and reasoning, including trade-offs for both approaches.' },
      { key: 'B', score: 2, text: 'Raise the concern in the next team meeting without preparation, stating you think there is a better way.' },
      { key: 'C', score: 1, text: 'Implement the alternative approach in your own work without discussing it, hoping the team notices the improvement.' },
      { key: 'D', score: 0, text: 'Say nothing and follow the original approach, even though you believe it is suboptimal.' },
    ],
  },
  {
    id: 'SJT03',
    situation: 'You are mid-sprint and a manager from another team asks you to urgently help debug a production issue on their service. This will likely take 3–4 hours.',
    options: [
      { key: 'A', score: 4, text: 'Tell the manager you are happy to help but need to first check with your own team lead to reprioritise — then get clearance before committing.' },
      { key: 'B', score: 2, text: 'Help immediately, planning to catch up on your sprint work after hours.' },
      { key: 'C', score: 1, text: 'Decline, explaining you are in a sprint and cannot be interrupted.' },
      { key: 'D', score: 0, text: 'Agree to help but spend most of the time on your own tasks, providing minimal assistance.' },
    ],
  },
  {
    id: 'SJT04',
    situation: 'You discover a potential security vulnerability in the production codebase that was introduced by a recent deploy. You are not sure how serious it is.',
    options: [
      { key: 'A', score: 4, text: 'Immediately escalate to your security lead or on-call engineer, document your findings, and do not disclose details publicly until it is assessed.' },
      { key: 'B', score: 2, text: 'Investigate further on your own to understand the severity before raising it with anyone.' },
      { key: 'C', score: 1, text: 'Post about it in the team Slack channel so everyone is aware.' },
      { key: 'D', score: 0, text: 'Log a ticket for the next sprint and continue with your current work.' },
    ],
  },
  {
    id: 'SJT05',
    situation: 'You are reviewing a pull request from a junior developer. The code works correctly but is unnecessarily complex and will be difficult to maintain.',
    options: [
      { key: 'A', score: 4, text: 'Leave constructive, specific comments explaining the complexity concerns and suggest cleaner alternatives, then schedule a short pairing session to walk through them.' },
      { key: 'B', score: 2, text: 'Approve the PR with a comment that the code could be simplified, leaving improvement for a future refactor.' },
      { key: 'C', score: 1, text: 'Reject the PR without detailed feedback, just commenting that it needs improvement.' },
      { key: 'D', score: 0, text: 'Approve the PR without comment to avoid discouraging the junior developer.' },
    ],
  },
  {
    id: 'SJT06',
    situation: 'You have accidentally pushed a commit directly to the main branch, bypassing the code review process. The change was minor and appears to be working.',
    options: [
      { key: 'A', score: 4, text: 'Inform your team immediately, create a retroactive review, and ask a colleague to review the change. Suggest a process improvement to prevent this.' },
      { key: 'B', score: 2, text: 'Create a pull request after the fact to document the change, but do not mention the bypass.' },
      { key: 'C', score: 1, text: 'Since the change is working and minor, leave it without any additional action.' },
      { key: 'D', score: 0, text: 'Say nothing and hope no one notices.' },
    ],
  },
  {
    id: 'SJT07',
    situation: 'You are three days from a release deadline. Your testing reveals a bug that is not critical for the feature being shipped but would require one additional day to fix.',
    options: [
      { key: 'A', score: 4, text: 'Immediately inform your team lead with a clear summary of the bug, its impact, and the estimated fix time, then jointly decide whether to delay the release or ship with a known issue log.' },
      { key: 'B', score: 2, text: 'Fix the bug yourself and push back the release by a day without informing the team until it is done.' },
      { key: 'C', score: 1, text: 'Skip the bug fix and ship on time, not mentioning the issue.' },
      { key: 'D', score: 0, text: 'Mark the bug as a "won\'t fix" in the tracker to avoid delaying the release.' },
    ],
  },
  {
    id: 'SJT08',
    situation: 'You overhear two colleagues saying unfair and inaccurate things about another teammate\'s technical abilities during a break.',
    options: [
      { key: 'A', score: 4, text: 'Politely but firmly challenge the inaccurate statements in the moment, then check in privately with the colleague who was spoken about.' },
      { key: 'B', score: 2, text: 'Say nothing now but privately let the affected colleague know what was said so they can decide how to respond.' },
      { key: 'C', score: 1, text: 'Report the conversation to your manager without speaking to anyone involved first.' },
      { key: 'D', score: 0, text: 'Ignore it — you do not want to get involved in interpersonal issues.' },
    ],
  },
  {
    id: 'SJT09',
    situation: 'You are assigned to estimate the effort required for a new project. You are fairly confident the work will take 6 weeks, but your manager is hoping to hear 4 weeks.',
    options: [
      { key: 'A', score: 4, text: 'Provide your honest 6-week estimate, clearly explaining your reasoning and the risks of compressing the timeline.' },
      { key: 'B', score: 2, text: 'Give a 5-week estimate as a compromise, planning to work harder to meet it.' },
      { key: 'C', score: 1, text: 'Provide the 4-week estimate your manager wants, intending to renegotiate scope later.' },
      { key: 'D', score: 0, text: 'Give the 4-week estimate to keep things simple and figure out the consequences when they arise.' },
    ],
  },
  {
    id: 'SJT10',
    situation: 'You are onboarding at a new company. You notice the team uses a coding pattern that you know from research to cause performance problems at scale.',
    options: [
      { key: 'A', score: 4, text: 'First spend time understanding whether the pattern is actually a problem in this codebase and context, then bring your observations and relevant data to a team discussion.' },
      { key: 'B', score: 2, text: 'Raise it immediately in your first week as a potential improvement area, based on your prior experience.' },
      { key: 'C', score: 1, text: 'Silently refactor parts of the codebase to use the better pattern as you encounter them.' },
      { key: 'D', score: 0, text: 'Say nothing and follow the existing patterns to avoid conflict during your onboarding period.' },
    ],
  },
];

export function scoreSjt(answers: Record<string, SjtOptionKey>): number {
  let total = 0;
  const maxPossible = SJT_SCENARIOS.length * 4;
  for (const scenario of SJT_SCENARIOS) {
    const chosen = answers[scenario.id];
    if (!chosen) continue;
    const opt = scenario.options.find((o) => o.key === chosen);
    total += opt?.score ?? 0;
  }
  return Math.round((total / maxPossible) * 100);
}
