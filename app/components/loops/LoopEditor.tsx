/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Props = {
  loopId: string;
  initialCode: string;
  expectedExports?: string[];
  hintBudget?: number;
};

type UiTest = {
  name: string;
  state: 'pass' | 'fail' | 'skip' | 'todo' | 'unknown';
  file?: string;
  error?: string;
};

type RunResponse = {
  passed: boolean;
  stdout?: string;
  stderr?: string;
  tests?: UiTest[];
};

type CoachResponse = {
  nudge: string;
  questions: string[];
  doc: { label: string; url: string };
  safety: { no_full_solution: true; notes: string };
};

function countLines(s: string) {
  return s.split('\n').length;
}

function storageKey(loopId: string) {
  return `tryloop:hintsLeft:${loopId}`;
}

function isCoachResponse(x: unknown): x is CoachResponse {
  if (!x || typeof x !== 'object') return false;

  const o = x as any;
  return (
    typeof o.nudge === 'string' &&
    Array.isArray(o.questions) &&
    o.doc &&
    typeof o.doc.label === 'string' &&
    typeof o.doc.url === 'string' &&
    o.safety &&
    o.safety.no_full_solution === true
  );
}

export default function LoopEditor({
  loopId,
  initialCode,
  expectedExports = [],
  hintBudget = 0,
}: Props) {
  const [code, setCode] = useState(initialCode);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResponse | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const [coach, setCoach] = useState<CoachResponse | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);
  const [coachError, setCoachError] = useState<string | null>(null);

  const [hintsLeft, setHintsLeft] = useState<number>(hintBudget);

  const isDev = process.env.NODE_ENV !== 'production';

  const coachRef = useRef<HTMLDivElement | null>(null);

  // Sync editor and per-loop state on navigation
  useEffect(() => {
    setCode(initialCode);
    setResult(null);
    setRunError(null);
    setCoach(null);
    setCoachError(null);
    setCoachLoading(false);

    // Load per-loop hint state
    const key = storageKey(loopId);
    const raw =
      typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;

    if (raw != null) {
      const n = Number(raw);
      setHintsLeft(Number.isFinite(n) ? n : hintBudget);
    } else {
      setHintsLeft(hintBudget);
    }
  }, [initialCode, loopId, hintBudget]);

  // Persist hintsLeft
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(storageKey(loopId), String(hintsLeft));
  }, [loopId, hintsLeft]);

  const stats = useMemo(() => {
    const lines = countLines(code);
    const chars = code.length;
    return { lines, chars };
  }, [code]);

  const missingExports = useMemo(() => {
    if (!expectedExports.length) return [];
    return expectedExports.filter(
      (name) => !code.includes(`export function ${name}`),
    );
  }, [code, expectedExports]);

  const tests = useMemo(() => result?.tests ?? [], [result]);

  const failedCount = useMemo(() => {
    return tests.filter((t) => t.state === 'fail').length;
  }, [tests]);

  const failingTests = useMemo(() => {
    return tests.filter((t) => t.state === 'fail');
  }, [tests]);

  const showCoachControls =
    hintBudget > 0 && !!result && !result.passed && failingTests.length > 0;

  const resetHintDisabled = coachLoading || hintsLeft === hintBudget;
  const hintDisabled = coachLoading || hintsLeft <= 0;

  const handleRunTests = async () => {
    setRunning(true);
    setRunError(null);

    // Reset coach output per run (do NOT refund hints)
    setCoach(null);
    setCoachError(null);
    setCoachLoading(false);

    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loopId, code }),
      });

      const data = (await res.json()) as RunResponse & { error?: string };

      if (!res.ok) {
        setResult(null);
        setRunError(data?.error ?? 'Run failed');
        return;
      }

      setResult(data);
    } catch (e: any) {
      setResult(null);
      setRunError(e?.message ?? '[TryLoop] Failed to run tests');
    } finally {
      setRunning(false);
    }
  };

  // Spend hint ONLY on success
  const handleGetHint = async () => {
    if (!result || result.passed) return;
    if (!failingTests.length) return;
    if (hintsLeft <= 0) return;

    setCoachLoading(true);
    setCoach(null);
    setCoachError(null);

    coachRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
      const gradeRes = await fetch('/api/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loopId,
          code,
          failingTests,
        }),
      });

      const payload = await gradeRes.json();

      if (!gradeRes.ok) {
        setCoach(null);
        setCoachError(payload?.error ?? 'Coach mode failed');
        return;
      }

      if (!isCoachResponse(payload)) {
        setCoach(null);
        setCoachError('Coach response was not in the expected format.');
        return;
      }

      // Success: set coach + spend hint
      setCoach(payload);
      setHintsLeft((h) => Math.max(0, h - 1));

      // scroll again so the nudge lands nicely (optional but feels great)
      requestAnimationFrame(() => {
        coachRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      });
    } catch (e: any) {
      setCoach(null);
      setCoachError(e?.message ?? 'Coach mode failed');
    } finally {
      setCoachLoading(false);
    }
  };

  const handleResetHintsDev = () => {
    // Reset hints for this loop (dev-only)
    setHintsLeft(hintBudget);
    setCoach(null);
    setCoachError(null);

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey(loopId), String(hintBudget));
    }
  };

  return (
    <div className='mt-3'>
      <div className='mb-2 flex flex-wrap items-center justify-between gap-2'>
        <div className='text-xs opacity-60'>
          {stats.lines} lines · {stats.chars} chars
          <span className='mx-2'>•</span>
          Loop: <span className='font-mono'>{loopId}</span>
          {result ? (
            <>
              <span className='mx-2'>•</span>
              <span className='opacity-80'>
                {result.passed
                  ? '✅ Passed'
                  : `❌ Failed${tests.length ? ` (${failedCount})` : ''}`}
              </span>
            </>
          ) : null}
        </div>

        <div className='flex items-center gap-2'>
          <button
            type='button'
            className='rounded-lg border px-3 py-1.5 text-sm opacity-80 hover:opacity-100 disabled:opacity-60'
            onClick={() => setCode(initialCode)}
            disabled={running}
            title='Reset to starter'
          >
            Reset
          </button>

          <button
            type='button'
            className='rounded-lg border bg-black px-3 py-1.5 text-sm text-white disabled:opacity-60'
            onClick={handleRunTests}
            disabled={running}
          >
            {running ? 'Running…' : 'Run tests'}
          </button>
        </div>
      </div>

      {missingExports.length ? (
        <div className='mb-3 rounded-lg border bg-black/5 p-3 text-sm'>
          <div className='font-medium'>Heads up</div>
          <div className='mt-1 opacity-80'>
            Keep the export signature:
            <span className='ml-2 font-mono'>
              {missingExports
                .map((n) => `export function ${n}(...)`)
                .join(', ')}
            </span>
          </div>
        </div>
      ) : null}

      {runError ? (
        <div className='mb-3 rounded-lg border p-3 text-sm'>
          <div className='font-medium'>Runner error</div>
          <pre className='mt-2 overflow-x-auto whitespace-pre-wrap text-xs opacity-80'>
            {runError}
          </pre>
        </div>
      ) : null}

      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        spellCheck={false}
        className='min-h-56 w-full resize-y rounded-lg border bg-black/5 p-3 font-mono text-sm leading-relaxed outline-none whitespace-pre'
      />

      {/* Coach Mode (opt-in) */}
      {showCoachControls ? (
        <div ref={coachRef} className='mt-4 rounded-xl border p-4'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div className='text-sm font-medium uppercase tracking-wide opacity-70'>
              Coach Mode
            </div>

            <div className='flex items-center gap-2'>
              <div className='text-xs opacity-60'>
                Hints left: <span className='font-mono'>{hintsLeft}</span>
                {hintBudget ? (
                  <span className='opacity-60'>/{hintBudget}</span>
                ) : null}
              </div>

              {isDev ? (
                <button
                  type='button'
                  onClick={handleResetHintsDev}
                  disabled={resetHintDisabled}
                  className='rounded-lg border px-3 py-1.5 text-sm opacity-70 hover:opacity-100 disabled:opacity-60'
                  title='Dev only: reset hint budget for this loop'
                >
                  Reset hints
                </button>
              ) : null}

              <button
                type='button'
                onClick={handleGetHint}
                disabled={hintDisabled}
                className='rounded-lg border bg-black px-3 py-1.5 text-sm text-white disabled:opacity-60'
                title={hintsLeft <= 0 ? 'No hints left' : 'Spend 1 hint'}
              >
                {coachLoading ? 'Thinking…' : 'Get hint (costs 1)'}
              </button>
            </div>
          </div>

          {hintsLeft <= 0 ? (
            <div className='mt-2 text-sm opacity-70'>
              You’re out of hints for this loop. Try reading the failing test
              and adjusting one small thing at a time.
            </div>
          ) : null}

          {coachError ? (
            <div className='mt-3 text-sm'>
              <div className='font-medium'>Coach error</div>
              <pre className='mt-2 overflow-x-auto whitespace-pre-wrap text-xs opacity-80'>
                {coachError}
              </pre>
            </div>
          ) : null}

          {coach ? (
            <div className='mt-3 space-y-3'>
              <div className='text-sm'>{coach.nudge}</div>

              <ul className='list-disc space-y-1 pl-5 text-sm'>
                {coach.questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>

              <a
                href={coach.doc.url}
                target='_blank'
                rel='noreferrer'
                className='inline-flex items-center rounded-full border px-3 py-1 text-sm opacity-80 hover:opacity-100'
              >
                {coach.doc.label}
              </a>
            </div>
          ) : (
            <div className='mt-3 text-sm opacity-70'>
              Click <span className='font-medium'>Get hint</span> to spend one
              hint and get a nudge.
            </div>
          )}
        </div>
      ) : null}

      {result ? (
        <div className='mt-4 space-y-3'>
          <div className='rounded-xl border p-4'>
            <div className='flex items-center justify-between'>
              <div className='text-sm font-medium uppercase tracking-wide opacity-70'>
                Test Results
              </div>
              <div className='text-sm opacity-70'>
                {result.passed ? '✅ Passed' : '❌ Failed'}
              </div>
            </div>

            {tests.length ? (
              <ul className='mt-3 space-y-2'>
                {tests.map((t, idx) => (
                  <li
                    key={`${t.name}-${idx}`}
                    className='rounded-lg border p-3'
                  >
                    <div className='flex items-start justify-between gap-3'>
                      <div className='font-mono text-sm'>{t.name}</div>
                      <div className='text-xs opacity-70'>
                        {t.state.toUpperCase()}
                      </div>
                    </div>

                    {t.file ? (
                      <div className='mt-1 text-xs opacity-60'>{t.file}</div>
                    ) : null}

                    {t.error ? (
                      <pre className='mt-2 overflow-x-auto whitespace-pre-wrap text-xs opacity-80'>
                        {t.error}
                      </pre>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <div className='mt-3 text-sm opacity-70'>
                No structured test list returned. (Stdout/Stderr below.)
              </div>
            )}
          </div>

          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='rounded-xl border p-4'>
              <div className='text-sm font-medium uppercase tracking-wide opacity-70'>
                Stdout
              </div>
              <pre className='mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs opacity-80'>
                {result.stdout?.trim() ? result.stdout : '(empty)'}
              </pre>
            </div>

            <div className='rounded-xl border p-4'>
              <div className='text-sm font-medium uppercase tracking-wide opacity-70'>
                Stderr
              </div>
              <pre className='mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs opacity-80'>
                {result.stderr?.trim() ? result.stderr : '(empty)'}
              </pre>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
