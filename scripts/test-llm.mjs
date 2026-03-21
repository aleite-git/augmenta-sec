#!/usr/bin/env node

/**
 * Quick smoke test for LLM providers.
 * Usage: node scripts/test-llm.mjs [mistral|gemini|all]
 */

import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Load .env manually (no dotenv dependency)
function loadEnv() {
  try {
    const content = readFileSync(resolve(ROOT, '.env'), 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    console.error('No .env file found. Copy .env.example to .env and add your keys.');
    process.exit(1);
  }
}

const PROMPT = 'You are a security engineer. In one sentence, what is the single most important thing to check when reviewing a pull request for security issues?';

// ── Mistral ──

async function testMistral() {
  const key = process.env.MISTRAL_API_KEY;
  if (!key) {
    console.log('[mistral] MISTRAL_API_KEY not set — skipping');
    return;
  }

  console.log('[mistral] Testing Mistral Large...');
  const start = performance.now();

  const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'mistral-large-latest',
      messages: [{role: 'user', content: PROMPT}],
      max_tokens: 150,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[mistral] ERROR ${res.status}: ${body}`);
    return;
  }

  const data = await res.json();
  const ms = Math.round(performance.now() - start);
  const msg = data.choices?.[0]?.message?.content;
  const usage = data.usage;

  console.log(`[mistral] Model: ${data.model}`);
  console.log(`[mistral] Response (${ms}ms): ${msg}`);
  console.log(`[mistral] Tokens: ${usage?.prompt_tokens} in / ${usage?.completion_tokens} out`);
  console.log('[mistral] OK');
}

// ── Gemini ──

async function testGemini() {
  const key = process.env.GOOGLE_AI_API_KEY;
  if (!key) {
    console.log('[gemini] GOOGLE_AI_API_KEY not set — skipping');
    return;
  }

  console.log('[gemini] Testing Gemini Flash...');
  const start = performance.now();

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        contents: [{role: 'user', parts: [{text: PROMPT}]}],
        generationConfig: {maxOutputTokens: 500},
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    console.error(`[gemini] ERROR ${res.status}: ${body}`);
    return;
  }

  const data = await res.json();
  const ms = Math.round(performance.now() - start);
  const msg = data.candidates?.[0]?.content?.parts?.[0]?.text;
  const usage = data.usageMetadata;

  console.log(`[gemini] Model: gemini-2.5-flash`);
  console.log(`[gemini] Response (${ms}ms): ${msg}`);
  console.log(`[gemini] Tokens: ${usage?.promptTokenCount} in / ${usage?.candidatesTokenCount} out`);
  console.log('[gemini] OK');
}

// ── Main ──

loadEnv();

const target = process.argv[2] ?? 'all';

console.log('AugmentaSec — LLM Provider Smoke Test');
console.log('─'.repeat(50));
console.log();

if (target === 'mistral' || target === 'all') await testMistral();
if (target === 'all') console.log();
if (target === 'gemini' || target === 'all') await testGemini();

console.log();
console.log('─'.repeat(50));
console.log('Done.');
