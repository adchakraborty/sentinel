#!/usr/bin/env node

import * as path from 'path';
import { fileURLToPath } from 'url';
import { launchDemoApp, findFreePort } from './launcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  const mcpPath = path.resolve(__dirname, '..', 'dist', 'index.js').replace(/\\/g, '/');
  const docsPath = path.resolve(__dirname, '..', 'demo-app', 'DOCS.md').replace(/\\/g, '/');

  console.log(`
╔══════════════════════════════════════════════════════════╗
║                     NEMESIS v3.0                         ║
║        AI Red Team + QA — LLM-Powered Testing            ║
╚══════════════════════════════════════════════════════════╝

DEMO INSTRUCTIONS
═════════════════

Step 1: Launch the demo app
  npx tsx src/cli.ts --demo

Step 2: In Cursor/VSCode chat, run the scan with docs:
  "Call nemesis_scan with:
   - targetUrl: http://localhost:<port shown above>
   - docPath: ${docsPath}
   - exampleData: {"searchQuery": "Widget", "feedbackName": "Tester", "feedbackMessage": "Hello world"}
   - headed: true
   Then generate security attacks, functional tests, and exploratory tests.
   Call nemesis_attack with your plans."

Step 3: View reports in ./nemesis-results/

SCANNING YOUR OWN APP
═════════════════════

  "Call nemesis_scan with:
   - targetUrl: http://localhost:3000
   - docPath: ./path/to/your/DOCS.md
   - auth: {type: 'form-login', loginUrl: 'http://localhost:3000/login', username: 'admin', password: 'secret'}
   - exampleData: {"searchQuery": "test item", "formField": "sample value"}
   Then generate tests and call nemesis_attack."

MCP SETUP
═════════

Add to your mcp.json (user-level or workspace):

  {
    "servers": {
      "nemesis": {
        "type": "stdio",
        "command": "node",
        "args": ["${mcpPath}"]
      }
    }
  }

MCP TOOLS
═════════

  nemesis_scan       Full pipeline: crawl + read docs + load knowledge (recommended)
  nemesis_recon      Crawl only (if you want manual control)
  nemesis_attack     Execute LLM-generated test plans
  nemesis_learn      Store app knowledge from documentation
  nemesis_knowledge  Query what NEMESIS has learned

AUTH TYPES
══════════

  form-login   Browser logs in via a form (provide loginUrl, username, password)
  cookie       Set cookies directly (provide cookies: {"name": "value"})
  bearer       Authorization: Bearer <token> header
  basic        HTTP Basic Auth (username + password)
  none         No authentication (default)
`);
  process.exit(0);
}

const demo = args.includes('--demo');

if (!demo) {
  console.error('Error: Use --demo to launch the demo app, or use NEMESIS via MCP in Cursor/VSCode.');
  process.exit(1);
}

async function main() {
  const port = findFreePort();
  const demoPath = path.resolve(__dirname, '..', 'demo-app');
  const docsPath = path.resolve(__dirname, '..', 'demo-app', 'DOCS.md').replace(/\\/g, '/');

  const url = await launchDemoApp(demoPath, port);
  console.log(`
╔══════════════════════════════════════════════════════════╗
║                  DEMO APP RUNNING                        ║
╚══════════════════════════════════════════════════════════╝

  App URL:    ${url}
  Docs:       ${docsPath}

NOW IN CURSOR/VSCODE CHAT, SAY:

  "Call nemesis_scan with targetUrl '${url}',
   docPath '${docsPath}',
   exampleData {"searchQuery": "Widget", "feedbackName": "Tester", "feedbackMessage": "Great product"},
   headed true.
   Then generate security + functional + exploratory tests and call nemesis_attack."

Press Ctrl+C to stop.
`);
}

main().catch((e) => {
  console.error('Error:', e.message || e);
  process.exit(1);
});
