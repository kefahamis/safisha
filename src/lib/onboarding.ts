/*
 * The getting-started checklist. A few steps suited to each kind of account,
 * each ticked off by what the person has actually done, not by clicking "done".
 * It sits quietly on their own dashboard, can be hidden in one click, and goes
 * away by itself once everything is done.
 */

export interface OnboardingStep {
  key: string;
  label: string;
  detail: string;
  /** Where to go to do it. */
  href: string;
  done: boolean;
}

export interface OnboardingView {
  steps: OnboardingStep[];
  /** Hidden by the person; the Profile page can bring it back. */
  hidden: boolean;
}

export const doneCount = (v: OnboardingView) => v.steps.filter((s) => s.done).length;
export const allDone = (v: OnboardingView) => v.steps.length > 0 && v.steps.every((s) => s.done);
