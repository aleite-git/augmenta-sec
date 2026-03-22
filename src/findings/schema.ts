import {randomUUID} from 'node:crypto';
import type {Severity} from './types.js';
export interface NormalizedFinding { id: string; title: string; description: string; severity: Severity; category: string; source: string; file?: string; line?: number; column?: number; cwe?: string; owasp?: string; confidence: number; metadata: Record<string, unknown>; }
export interface SeverityCounts { critical: number; high: number; medium: number; low: number; informational: number; }
export interface ScanMetadata { scanTime: string; target: string; scanners?: string[]; durationMs?: number; }
export interface NormalizedFindingsReport { findings: NormalizedFinding[]; summary: SeverityCounts; metadata: ScanMetadata; }
export interface RawFinding { title?: string; ruleId?: string; description?: string; message?: string; severity?: string; category?: string; type?: string; file?: string; path?: string; line?: number; startLine?: number; column?: number; startColumn?: number; cwe?: string | string[]; cweId?: string; owasp?: string; owaspCategory?: string; confidence?: number | string; metadata?: Record<string, unknown>; [key: string]: unknown; }
const SEV_ALIASES: Record<string, Severity> = {critical:'critical',crit:'critical',high:'high',error:'high',medium:'medium',med:'medium',moderate:'medium',warning:'medium',low:'low',minor:'low',informational:'informational',info:'informational',note:'informational',none:'informational'};
export function normalizeSeverity(raw: string | undefined): Severity { if (!raw) return 'informational'; return SEV_ALIASES[raw.toLowerCase().trim()] ?? 'informational'; }
export function normalizeConfidence(raw: number | string | undefined): number {
  if (raw == null) return 0.5;
  if (typeof raw === 'string') { const l = raw.toLowerCase().trim(); if (l === 'high' || l === 'certain') return 0.9; if (l === 'medium' || l === 'moderate' || l === 'firm') return 0.7; if (l === 'low' || l === 'tentative') return 0.3; const p = parseFloat(l); if (!isNaN(p)) return p > 1 ? Math.min(p/100,1) : Math.max(0,Math.min(1,p)); return 0.5; }
  if (raw > 1) return Math.min(raw/100, 1); return Math.max(0, Math.min(1, raw));
}
export function normalizeFinding(raw: RawFinding, source: string): NormalizedFinding {
  const cweRaw = raw.cweId ?? (Array.isArray(raw.cwe) ? raw.cwe[0] : raw.cwe);
  return { id: randomUUID(), title: raw.title ?? raw.ruleId ?? 'Untitled finding', description: raw.description ?? raw.message ?? '', severity: normalizeSeverity(raw.severity), category: raw.category ?? raw.type ?? 'general', source, file: raw.file ?? raw.path, line: raw.line ?? raw.startLine, column: raw.column ?? raw.startColumn, cwe: cweRaw, owasp: raw.owasp ?? raw.owaspCategory, confidence: normalizeConfidence(raw.confidence), metadata: raw.metadata ?? {} };
}
export interface ValidationError { field: string; message: string; }
export interface ValidationResult { valid: boolean; errors: ValidationError[]; }
const VALID_SEVS = new Set(['critical','high','medium','low','informational']);
const CWE_RE = /^CWE-\d+$/;
export function validateFinding(f: NormalizedFinding): ValidationResult {
  const e: ValidationError[] = [];
  if (!f.id || typeof f.id !== 'string') e.push({field:'id',message:'id is required and must be a non-empty string'});
  if (!f.title || typeof f.title !== 'string') e.push({field:'title',message:'title is required and must be a non-empty string'});
  if (typeof f.description !== 'string') e.push({field:'description',message:'description must be a string'});
  if (!f.source || typeof f.source !== 'string') e.push({field:'source',message:'source is required and must be a non-empty string'});
  if (!f.category || typeof f.category !== 'string') e.push({field:'category',message:'category is required and must be a non-empty string'});
  if (!VALID_SEVS.has(f.severity)) e.push({field:'severity',message:`severity must be one of: ${[...VALID_SEVS].join(', ')}`});
  if (typeof f.confidence !== 'number' || f.confidence < 0 || f.confidence > 1) e.push({field:'confidence',message:'confidence must be a number between 0 and 1'});
  if (f.cwe != null && !CWE_RE.test(f.cwe)) e.push({field:'cwe',message:'cwe must match the pattern CWE-<digits>'});
  if (f.line != null && (!Number.isInteger(f.line) || f.line < 1)) e.push({field:'line',message:'line must be a positive integer'});
  if (f.column != null && (!Number.isInteger(f.column) || f.column < 1)) e.push({field:'column',message:'column must be a positive integer'});
  return {valid: e.length === 0, errors: e};
}
export function buildFindingsReport(findings: NormalizedFinding[], metadata: ScanMetadata): NormalizedFindingsReport {
  const s: SeverityCounts = {critical:0,high:0,medium:0,low:0,informational:0};
  for (const f of findings) { if (f.severity in s) s[f.severity]++; }
  return {findings, summary: s, metadata};
}
