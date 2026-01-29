export type CoachFail = {
  name: string;
  state: 'pass' | 'fail' | 'skip' | 'todo' | 'unknown';
  error?: string;
};

export type CoachDoc = { label: string; url: string };

export type CoachLoop = {
  id: string;
  title: string;
  spec: string[];
  docs?: CoachDoc[];
};

export type CoachResponse = {
  nudge: string;
  questions: string[];
  doc: CoachDoc;
  safety: { no_full_solution: true; notes: string };
};

function firstDoc(loop: CoachLoop): CoachDoc {
  return (
    loop.docs?.[0] ?? {
      label: 'MDN JavaScript',
      url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
    }
  );
}

function textFromFails(fails: CoachFail[]) {
  return `${fails.map((t) => t.name).join(' | ')}\n${fails
    .map((t) => t.error ?? '')
    .join('\n')}`.toLowerCase();
}

export function gradeWithRules(args: {
  loop: CoachLoop;
  code: string;
  failingTests: CoachFail[];
}): CoachResponse {
  const { loop, code } = args;
  const fails = (args.failingTests ?? []).filter((t) => t.state === 'fail');
  const failText = textFromFails(fails);

  // sensible default
  let nudge =
    'Use the failing test output to compare what your function returns vs what the spec expects.';
  let questions = [
    'What shape is each item you’re iterating over?',
    'What should your predicate/condition return for the boundary case?',
    'What do you return from the function?',
  ];
  let doc = firstDoc(loop);

  // ---- Loop-specific rules ----
  if (loop.id === 'loop-001') {
    doc =
      loop.docs?.find((d) => d.label.toLowerCase().includes('filter')) ?? doc;

    // Off-by-one boundary
    if (
      failText.includes('exactly 18') ||
      failText.includes('includes users')
    ) {
      nudge =
        'This looks like a boundary case: the spec says “age >= 18”, so 18 must be included.';
      questions = [
        'Are you using `>` or `>=` in your condition?',
        'If age is 18, should your condition return true or false?',
        'Try running your predicate on a single { age: 18 } value—what happens?',
      ];
    }

    // Comparing object to number
    if (/\b(user|u)\s*>\s*\d+/.test(code)) {
      nudge =
        'Your condition is comparing an object to a number — you likely meant a property on the object.';
      questions = [
        'Inside `filter`, what is `user` (object or number)?',
        'Which property holds the age value?',
        'Does your condition return a boolean for each item?',
      ];
    }

    // Missing return
    if (!/\breturn\b/.test(code)) {
      nudge =
        'Make sure your function returns the filtered array (not undefined).';
      questions = [
        'Are you returning the result of `users.filter(...)`?',
        'What does your function return right now?',
      ];
    }
  }

  return {
    nudge,
    questions: questions.slice(0, 3),
    doc,
    safety: { no_full_solution: true, notes: 'rules-engine' },
  };
}
