export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { gradeWithRules, type CoachFail } from '@/lib/coach/rules';

type GradeBody = {
  loopId: string;
  code: string;
  failingTests: CoachFail[];
};

type LoopJson = {
  id: string;
  title: string;
  spec: string[];
  docs?: { label: string; url: string }[];
};

export async function POST(req: Request) {
  let body: GradeBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { loopId, code, failingTests } = body;

  if (!loopId || typeof loopId !== 'string') {
    return NextResponse.json({ error: 'loopId is required' }, { status: 400 });
  }
  if (!code || typeof code !== 'string') {
    return NextResponse.json({ error: 'code is required' }, { status: 400 });
  }
  if (!Array.isArray(failingTests)) {
    return NextResponse.json(
      { error: 'failingTests must be an array' },
      { status: 400 },
    );
  }

  const loopPath = path.join(process.cwd(), 'loops', loopId, 'loop.json');

  let loop: LoopJson;
  try {
    loop = JSON.parse(await readFile(loopPath, 'utf8'));
  } catch {
    return NextResponse.json({ error: 'Loop not found' }, { status: 404 });
  }

  const coach = gradeWithRules({ loop, code, failingTests });

  return NextResponse.json(coach);
}
