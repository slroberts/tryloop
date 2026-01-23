export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ loopId: string }> },
) {
  const { loopId } = await params;

  const filePath = path.join(process.cwd(), 'loops', loopId, 'loop.json');

  try {
    const raw = await readFile(filePath, 'utf8');
    const loop = JSON.parse(raw);

    if (loop.id && loop.id !== loopId) {
      return NextResponse.json(
        { error: 'Loop id mismatch', expected: loopId, got: loop.id },
        { status: 400 },
      );
    }

    return NextResponse.json({ loop });
  } catch {
    return NextResponse.json({ error: 'Loop not found' }, { status: 404 });
  }
}
