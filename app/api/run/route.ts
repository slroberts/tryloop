/* eslint-disable @typescript-eslint/no-explicit-any */
export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import path from 'node:path';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

type RunBody = {
  loopId: string;
  code: string;
  mode?: 'normal' | 'glitch'; // later
  glitchId?: string | null; // later
};

type UiTest = {
  name: string;
  state: 'pass' | 'fail' | 'skip' | 'todo' | 'unknown';
  file?: string;
  error?: string;
};

function toUiState(x: unknown): UiTest['state'] {
  const v = String(x ?? '').toLowerCase();

  if (v === 'pass' || v === 'passed') return 'pass';
  if (v === 'fail' || v === 'failed') return 'fail';
  if (v === 'skip' || v === 'skipped') return 'skip';
  if (v === 'todo') return 'todo';

  return 'unknown';
}

// Normalize different Vitest JSON reporter shapes into a simple list for UI rendering.
function normalizeVitestReport(report: any): UiTest[] {
  const out: UiTest[] = [];
  if (!report) return out;

  // Shape A: Jest-like JSON report (some versions)
  if (Array.isArray(report.testResults)) {
    for (const file of report.testResults) {
      const fileName = file?.name;
      const assertions = file?.assertionResults ?? [];
      for (const a of assertions) {
        // Prefer "state" (newer), fallback to "status" (older)
        const state = a?.state ?? a?.status;

        out.push({
          name: a?.fullName ?? a?.title ?? 'Unnamed test',
          state: toUiState(state),
          file: fileName,
          error: a?.failureMessages?.join('\n') || undefined,
        });
      }
    }
    return out;
  }

  // Shape B: Vitest "files" with nested "tasks"
  if (Array.isArray(report.files)) {
    for (const f of report.files) {
      const fileName = f?.name;
      const roots = f?.tasks ?? [];

      const walk = (node: any) => {
        if (!node) return;

        if (node.type === 'test') {
          // Vitest task state usually lives here:
          // node.result.state OR node.state
          const state = node.result?.state ?? node.state;

          out.push({
            name: node.name ?? 'Unnamed test',
            state: toUiState(state),
            file: fileName,
            error:
              node.result?.error?.message ||
              (Array.isArray(node.result?.errors)
                ? node.result.errors
                    .map((e: any) => e?.message)
                    .filter(Boolean)
                    .join('\n')
                : undefined),
          });
        }

        if (Array.isArray(node.tasks)) node.tasks.forEach(walk);
      };

      roots.forEach(walk);
    }
    return out;
  }

  return out;
}

function runCmd(cmd: string, args: string[], timeoutMs = 8000) {
  return new Promise<{ exitCode: number; stdout: string; stderr: string }>(
    (resolve) => {
      const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });

      let stdout = '';
      let stderr = '';

      const timer = setTimeout(() => {
        stderr += `\n[TryLoop] Timeout after ${timeoutMs}ms`;
        child.kill('SIGKILL');
      }, timeoutMs);

      child.stdout.on('data', (d) => (stdout += d.toString()));
      child.stderr.on('data', (d) => (stderr += d.toString()));

      child.on('close', (code) => {
        clearTimeout(timer);
        resolve({ exitCode: code ?? 1, stdout, stderr });
      });
    },
  );
}

export async function POST(req: Request) {
  let body: RunBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { loopId, code } = body;

  if (!loopId || typeof loopId !== 'string') {
    return NextResponse.json({ error: 'loopId is required' }, { status: 400 });
  }
  if (!code || typeof code !== 'string') {
    return NextResponse.json({ error: 'code is required' }, { status: 400 });
  }

  // Load server-owned tests for that loop
  const testsPath = path.join(process.cwd(), 'loops', loopId, 'tests.spec.ts');

  let tests: string;
  try {
    tests = await readFile(testsPath, 'utf8');
  } catch {
    return NextResponse.json(
      { error: `Loop tests not found for ${loopId}` },
      { status: 404 },
    );
  }

  // Create temp workspace
  const dir = await mkdtemp(path.join(tmpdir(), 'tryloop-'));

  try {
    // Write user code + tests into workspace
    await writeFile(path.join(dir, 'user-code.ts'), code, 'utf8');
    await writeFile(path.join(dir, 'tests.spec.ts'), tests, 'utf8');

    // Vitest JSON reporter output
    await writeFile(
      path.join(dir, 'vitest.config.ts'),
      `export default { test: { reporters: ["json"], outputFile: "report.json" } }`,
      'utf8',
    );

    // Helps some environments treat ESM consistently
    await writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({ type: 'module' }),
      'utf8',
    );

    // Run in Docker (recommended)
    const result = await runCmd(
      'docker',
      [
        'run',
        '--rm',
        '--network=none',
        '--cpus=1',
        '--memory=256m',
        '-v',
        `${dir}:/work`,
        '-w',
        '/work',
        'tryloop-runner',
        'sh',
        '-lc',
        'vitest run --config vitest.config.ts',
      ],
      8000,
    );

    // Parse JSON report if present
    let report: any = null;
    try {
      report = JSON.parse(
        await readFile(path.join(dir, 'report.json'), 'utf8'),
      );
    } catch {
      // report can be missing if vitest crashes early
    }

    const passed = result.exitCode === 0;
    const testsUi = normalizeVitestReport(report);

    return NextResponse.json({
      passed,
      stdout: result.stdout,
      stderr: result.stderr,
      tests: testsUi,
      report, // keep raw while stabilizing
    });
  } finally {
    // Cleanup
    await rm(dir, { recursive: true, force: true });
  }
}
