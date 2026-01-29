import { notFound } from 'next/navigation';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import LoopEditor from '@/app/components/loops/LoopEditor';

type LoopExample = {
  input: Array<{ age: number }>;
  output: Array<{ age: number }>;
};

type LoopDoc = { label: string; url: string };

type Loop = {
  id: string;
  title: string;
  difficulty: number;
  hintBudget: number;
  exports: string[];
  spec: string[];
  examples?: LoopExample[];
  starter: string;
  docs?: LoopDoc[];
  glitches?: string[];
};

async function loadLoop(loopId: string): Promise<Loop> {
  const filePath = path.join(process.cwd(), 'loops', loopId, 'loop.json');
  const raw = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  return parsed.loop ?? parsed; // supports either { loop } or raw JSON
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className='mt-3 overflow-x-auto rounded-lg border bg-black/5 p-3 font-mono text-sm leading-relaxed'>
      <code className='whitespace-pre'>{children}</code>
    </pre>
  );
}

export default async function LoopPage({
  params,
}: {
  params: Promise<{ loopId: string }>;
}) {
  const { loopId } = await params;

  let loop: Loop;
  try {
    loop = await loadLoop(loopId);
  } catch {
    notFound();
  }

  return (
    <div className='mx-auto max-w-3xl px-4 py-10'>
      <header className='mb-6'>
        <div className='flex items-baseline justify-between gap-4'>
          <h1 className='text-2xl font-semibold'>{loop.title}</h1>
          <div className='text-sm opacity-70'>
            Difficulty {loop.difficulty} · {loop.hintBudget} hints
          </div>
        </div>
        <div className='mt-1 flex flex-wrap items-center gap-2 text-xs opacity-60'>
          <span>Loop: {loop.id}</span>
          {loop.exports?.length ? (
            <>
              <span>•</span>
              <span>Exports: {loop.exports.join(', ')}</span>
            </>
          ) : null}
          {loop.glitches?.length ? (
            <>
              <span>•</span>
              <span>Glitches: {loop.glitches.join(', ')}</span>
            </>
          ) : null}
        </div>
      </header>

      {/* Spec */}
      <section className='rounded-xl border p-5'>
        <h2 className='text-sm font-medium uppercase tracking-wide opacity-70'>
          Spec
        </h2>
        <ul className='mt-3 list-disc space-y-2 pl-5'>
          {loop.spec.map((line) => (
            <li key={line} className='leading-relaxed'>
              {line}
            </li>
          ))}
        </ul>

        {/* Docs */}
        {loop.docs?.length ? (
          <div className='mt-5'>
            <div className='text-sm font-medium uppercase tracking-wide opacity-70'>
              Docs
            </div>
            <div className='mt-2 flex flex-wrap gap-2'>
              {loop.docs.map((d) => (
                <a
                  key={d.url}
                  href={d.url}
                  target='_blank'
                  rel='noreferrer'
                  className='rounded-full border px-3 py-1 text-sm opacity-80 hover:opacity-100'
                >
                  {d.label}
                </a>
              ))}
            </div>
          </div>
        ) : null}

        {/* Examples */}
        {loop.examples?.length ? (
          <div className='mt-6'>
            <div className='text-sm font-medium uppercase tracking-wide opacity-70'>
              Examples
            </div>

            <div className='mt-3 space-y-4'>
              {loop.examples.map((ex, idx) => (
                <div
                  key={idx}
                  className='grid gap-4 rounded-lg border p-4 md:grid-cols-2'
                >
                  <div>
                    <div className='text-xs font-medium opacity-70'>Input</div>
                    <CodeBlock>{JSON.stringify(ex.input, null, 2)}</CodeBlock>
                  </div>
                  <div>
                    <div className='text-xs font-medium opacity-70'>Output</div>
                    <CodeBlock>{JSON.stringify(ex.output, null, 2)}</CodeBlock>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {/* Starter */}
      <section className='mt-6 rounded-xl border p-5'>
        <div className='flex items-center justify-between gap-4'>
          <h2 className='text-sm font-medium uppercase tracking-wide opacity-70'>
            Starter
          </h2>
          <div className='text-xs opacity-60'>
            Keep the export name the same.
          </div>
        </div>

        <LoopEditor
          loopId={loop.id}
          initialCode={loop.starter}
          expectedExports={loop.exports}
          hintBudget={loop.hintBudget}
        />
      </section>
    </div>
  );
}
