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
  tier: 1 | 2 | 3;
  nudge: string;
  questions: string[];
  doc: CoachDoc;
  microExample?: string; // tier 3 only (never a full solution)
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

function clampTier(tier?: number): 1 | 2 | 3 {
  if (tier === 2) return 2;
  if (tier === 3) return 3;
  return 1;
}

export function gradeWithRules(args: {
  loop: CoachLoop;
  code: string;
  failingTests: CoachFail[];
  tier?: number; // 1..3
}): CoachResponse {
  const { loop, code } = args;
  const tier = clampTier(args.tier);

  const fails = (args.failingTests ?? []).filter((t) => t.state === 'fail');
  const failText = textFromFails(fails);

  // defaults (tier 1 baseline)
  let nudge =
    'Check what your function returns vs what the spec expects, then adjust one small thing.';
  let questions = [
    'What is each item inside your callback (number or object)?',
    'What condition should be true for an “adult”?',
    'Are you returning the filtered array?',
  ];
  let doc = firstDoc(loop);
  let microExample: string | undefined = undefined;

  if (loop.id === 'loop-001') {
    doc =
      loop.docs?.find((d) => d.label.toLowerCase().includes('filter')) ?? doc;

    const comparingObjectToNumber = /\b(user|u)\s*>\s*\d+/.test(code);
    const boundary18 =
      failText.includes('exactly 18') || failText.includes('includes users');
    const missingReturn = !/\breturn\b/.test(code);

    if (tier === 1) {
      if (comparingObjectToNumber) {
        nudge =
          'Your filter predicate is comparing an object to a number — you likely meant a property on the object.';
        questions = [
          'Inside `filter`, what is `user` (object or number)?',
          'Which property holds the age value?',
        ];
      } else if (boundary18) {
        nudge =
          'This looks like a boundary case: the spec says “age >= 18”, so 18 must be included.';
        questions = ['Are you using `>` or `>=` in your condition?'];
      } else if (missingReturn) {
        nudge = 'Make sure your function returns the filtered array.';
        questions = ['What does your function return right now?'];
      }
    }

    if (tier === 2) {
      if (comparingObjectToNumber) {
        nudge =
          'You’re filtering, but your predicate is using the whole object instead of its age. Compare the age property.';
        questions = [
          'What is the shape of a user object in this loop?',
          'Which expression should your predicate evaluate (something like `<age> >= 18`)?',
          'If you log `user` inside the callback, what do you expect to see?',
        ];
      } else if (boundary18) {
        nudge =
          'Your predicate is probably excluding 18. Re-check the comparison operator.';
        questions = [
          'If age is 18, should the predicate return true or false?',
          'Which operator includes 18: `>` or `>=`?',
          'Try a tiny mental test with `{ age: 18 }` — what should happen?',
        ];
      } else if (missingReturn) {
        nudge =
          'You may be filtering correctly, but not returning the result from the function.';
        questions = [
          'Are you returning the result of `users.filter(...)`?',
          'What value does your function return on the first test?',
          'Does your function ever return undefined?',
        ];
      }
    }

    if (tier === 3) {
      // Still NOT a full solution — just a micro-example focused on the bug shape
      if (comparingObjectToNumber) {
        nudge =
          'Fix the predicate shape: compare a number (age) to 18, not the entire object.';
        questions = [
          'Which property should the predicate read?',
          'Does the predicate return a boolean?',
          'Does your output contain the original user objects (not ages)?',
        ];
        microExample =
          `Micro-example (predicate only):\n` +
          `// user is an object, so read a property\n` +
          `users.filter((user) => user.age >= 18)`;
      } else if (boundary18) {
        nudge =
          'Make sure 18 is included. This is the classic off-by-one boundary.';
        questions = [
          'What’s the exact condition from the spec?',
          'Which operator matches that condition?',
        ];
        microExample =
          `Micro-example (comparison only):\n` +
          `// to include 18, use >=\n` +
          `age >= 18`;
      } else if (missingReturn) {
        nudge =
          'Return the filtered array from your function. Filtering alone isn’t enough if you don’t return it.';
        questions = [
          'Where does your function return the filtered result?',
          'If you add `console.log`, what does it show for the return value?',
        ];
        microExample =
          `Micro-example (return shape only):\n` +
          `return users.filter(/* predicate */)`;
      } else {
        nudge =
          'Focus on the predicate and boundary. The tests are telling you exactly which users should remain.';
        questions = [
          'Does your predicate keep users with age 18?',
          'Are you reading `user.age` (not `user`)?',
          'Are you returning the filtered array?',
        ];
        microExample =
          `Micro-example (debug step):\n` +
          `// quick sanity check\n` +
          `// does your predicate return true for { age: 18 }?`;
      }
    }
  }

  // Final tier shaping: keep it “training wheels”
  const maxQuestions = tier === 1 ? 2 : tier === 2 ? 3 : 3;
  const final: CoachResponse = {
    tier,
    nudge,
    questions: questions.slice(0, maxQuestions),
    doc,
    ...(tier === 3 && microExample ? { microExample } : {}),
    safety: { no_full_solution: true, notes: 'rules-engine:tiered' },
  };

  return final;
}
