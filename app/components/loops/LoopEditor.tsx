'use client';

import { useEffect, useMemo, useState } from 'react';

type Props = {
  loopId: string;
  initialCode: string;
  expectedExports?: string[];
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
  // report?: unknown; // optional, if you keep returning it
};

function countLines(s: string) {
  return s.split('\n').length;
}

export default function LoopEditor({
  loopId,
  initialCode,
  expectedExports = [],
}: Props) {
  const [code, setCode] = useState(initialCode);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResponse | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  // If you navigate between loop pages, keep editor synced.
  useEffect(() => {
    setCode(initialCode);
    setResult(null);
    setRunError(null);
  }, [initialCode]);

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

  const failedCount = useMemo(() => {
    const tests = result?.tests ?? [];
    return tests.filter((t) => t.state === 'fail').length;
  }, [result]);

  const handleRunTests = async () => {
    setRunning(true);
    setRunError(null);

    try {
      const res = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loopId, code }),
      });

      const data = await res.json();

      if (!res.ok) {
        setResult(null);
        setRunError(data?.error ?? 'Run failed');
      } else {
        setResult(data as RunResponse);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      setResult(null);
      setRunError(e?.message ?? '[TryLoop] Failed to run tests');
    } finally {
      setRunning(false);
    }
  };

  const tests = result?.tests ?? [];

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
