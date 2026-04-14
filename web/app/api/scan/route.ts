import { NextRequest } from 'next/server';
import { runScan } from '../../../lib/scan-engine';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const targetUrl = body.targetUrl as string;
  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'targetUrl is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    new URL(targetUrl);
  } catch {
    return new Response(JSON.stringify({ error: 'targetUrl must be a valid URL' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!process.env.GITHUB_TOKEN) {
    return new Response(JSON.stringify({
      error: 'GITHUB_TOKEN environment variable not set. Set it as a system env var with models:read scope.',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // stream may have been closed by client
        }
      };

      try {
        const result = await runScan(
          {
            targetUrl,
            docPath: body.docPath as string | undefined,
            exampleData: body.exampleData as Record<string, string> | undefined,
            headed: body.headed as boolean | undefined,
            auth: body.auth as {
              type: 'form-login' | 'idp-login' | 'cookie' | 'bearer' | 'basic' | 'none';
              loginUrl?: string;
              username?: string;
              password?: string;
              token?: string;
            } | undefined,
          },
          {
            onProgress: (phase, message) => {
              send({ type: 'progress', phase, message });
            },
            onFinding: (finding) => {
              send({
                type: 'finding',
                data: {
                  id: finding.attack.id,
                  category: finding.attack.category,
                  name: finding.attack.name,
                  severity: finding.attack.severity,
                  evidence: finding.evidence,
                  pageUrl: finding.pageUrl,
                  reproductionSteps: finding.reproductionSteps,
                  remediation: finding.remediation,
                  cwe: finding.cwe,
                },
              });
            },
          },
        );

        send({ type: 'results', data: result });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Scan failed unexpectedly';
        send({ type: 'error', message });
      } finally {
        try {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
