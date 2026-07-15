#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const C15_GATE_ID = 'c15-live-learning-closeout';

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    handoffFile: null,
    writerResultFile: null,
    metricWindow: '',
    output: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} requires a value`);
      }
      index += 1;
      return value;
    };

    if (arg === '--handoff-file') {
      options.handoffFile = path.resolve(nextValue());
    } else if (arg === '--writer-result-file') {
      options.writerResultFile = path.resolve(nextValue());
    } else if (arg === '--metric-window') {
      options.metricWindow = nextValue();
    } else if (arg === '--output') {
      options.output = path.resolve(nextValue());
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.help && !options.handoffFile) {
    throw new Error('--handoff-file is required');
  }
  if (!options.help && !options.writerResultFile) {
    throw new Error('--writer-result-file is required');
  }

  return options;
}

export async function checkC15WriterResult({
  handoffFile,
  writerResultFile,
  metricWindow = '',
  now = new Date(),
} = {}) {
  if (!handoffFile) throw new Error('handoffFile is required');
  if (!writerResultFile) throw new Error('writerResultFile is required');

  const [handoff, writerResult] = await Promise.all([
    readJson(handoffFile),
    readJson(writerResultFile),
  ]);
  const c15 = handoff.gates?.[C15_GATE_ID] ?? {};
  const metadata = {
    environment: normalizeText(c15.live?.environmentOwner),
    companyId: normalizeText(c15.targets?.companyId),
    projectId: normalizeText(c15.targets?.projectId),
    candidateId: normalizeText(c15.targets?.candidateId),
    sampleCohortRef: normalizeText(c15.targets?.sampleCohortRef),
    metricWindow: normalizeText(metricWindow),
    approvalRef: normalizeText(c15.approvals?.manualApprovalRef),
    rollbackRef: normalizeText(c15.owners?.rollbackOwner),
  };
  const failures = [];
  const warnings = [];

  requireText(failures, 'live.environmentOwner', metadata.environment);
  requireText(failures, 'targets.companyId', metadata.companyId);
  requireText(failures, 'targets.projectId', metadata.projectId);
  requireText(failures, 'targets.candidateId', metadata.candidateId);
  requireText(failures, 'targets.sampleCohortRef', metadata.sampleCohortRef);
  requireText(failures, 'metricWindow', metadata.metricWindow);
  requireText(failures, 'approvals.manualApprovalRef', metadata.approvalRef);
  requireText(failures, 'owners.rollbackOwner', metadata.rollbackRef);

  if (writerResult?.status !== 'pass') {
    failures.push(fieldFailure('writerResult.status', 'writer result status must be pass'));
  }

  const checks = {
    sampleCohortReadback: evidenceReady(
      writerResult?.sampleCohortReadback,
      writerResult?.sampleCohort,
      writerResult?.sample_cohort_readback,
    ),
    rewardMaeQualityReadback: evidenceReady(
      writerResult?.rewardMaeQualityReadback,
      writerResult?.rewardMaeReadback,
      writerResult?.reward_mae_quality_readback,
    ),
    pendingPredictionClosure: evidenceReady(
      writerResult?.pendingPredictionClosure,
      writerResult?.pending_prediction_closure,
    ),
    policyVersionUniqueness: evidenceReady(
      writerResult?.policyVersionUniqueness,
      writerResult?.policyVersionUnique,
      writerResult?.policy_version_uniqueness,
    ),
    tenantIsolationReadback: evidenceReady(
      writerResult?.tenantIsolationReadback,
      writerResult?.tenantIsolation,
      writerResult?.tenant_isolation_readback,
    ),
    canaryApprovalMonitoring: evidenceReady(
      writerResult?.canaryApprovalMonitoring,
      writerResult?.canaryMonitoring,
      writerResult?.canary_approval_monitoring,
    ),
    rollbackOrSupersede: evidenceReady(
      writerResult?.rollbackOrSupersede,
      writerResult?.rollback,
      writerResult?.supersede,
      writerResult?.rollback_or_supersede,
    ),
  };

  for (const [field, ready] of Object.entries(checks)) {
    if (!ready) {
      failures.push(fieldFailure(`writerResult.${field}`, 'pass/readback evidence is required'));
    }
  }

  const tenantReadback = firstEvidence(
    writerResult?.tenantIsolationReadback,
    writerResult?.tenantIsolation,
    writerResult?.tenant_isolation_readback,
  );
  const crossTenantRows = Number(tenantReadback?.crossTenantRows ?? tenantReadback?.cross_tenant_rows ?? 0);
  if (Number.isFinite(crossTenantRows) && crossTenantRows > 0) {
    failures.push(fieldFailure('writerResult.tenantIsolationReadback.crossTenantRows', 'cross-tenant rows must be 0'));
  }

  const sampleReadback = firstEvidence(
    writerResult?.sampleCohortReadback,
    writerResult?.sampleCohort,
    writerResult?.sample_cohort_readback,
  );
  const sampleCount = Number(sampleReadback?.sampleCount ?? sampleReadback?.sample_count ?? 0);
  if (Number.isFinite(sampleCount) && sampleCount < 1) {
    failures.push(fieldFailure('writerResult.sampleCohortReadback.sampleCount', 'sample count must be positive'));
  }

  const rewardMaeReadback = firstEvidence(
    writerResult?.rewardMaeQualityReadback,
    writerResult?.rewardMaeReadback,
    writerResult?.reward_mae_quality_readback,
  );
  const maeBefore = Number(rewardMaeReadback?.maeBefore);
  const maeAfter = Number(rewardMaeReadback?.maeAfter);
  const evaluatedDecisionCount = Number(rewardMaeReadback?.evaluatedDecisionCount);
  if (!Number.isFinite(maeBefore) || !Number.isFinite(maeAfter)) {
    failures.push(fieldFailure('writerResult.rewardMaeQualityReadback.maeReadback', 'numeric maeBefore and maeAfter are required'));
  }
  if (!Number.isFinite(evaluatedDecisionCount) || evaluatedDecisionCount <= 0) {
    failures.push(fieldFailure('writerResult.rewardMaeQualityReadback.evaluatedDecisionCount', 'evaluated decision count must be positive'));
  }
  if (Number.isFinite(maeBefore) && Number.isFinite(maeAfter) && maeAfter >= maeBefore) {
    failures.push(fieldFailure('writerResult.rewardMaeQualityReadback.maeImprovement', 'maeAfter must be strictly lower than maeBefore'));
  }

  if (Array.isArray(writerResult?.manualAssistedEvidenceRefs) && writerResult.manualAssistedEvidenceRefs.length > 0) {
    warnings.push(fieldFailure('writerResult.manualAssistedEvidenceRefs', 'manual-assisted evidence is supporting only and does not replace pass readbacks'));
  }

  return {
    schemaVersion: 'workbuddy-c15-writer-result-check/v1',
    checkedAt: now.toISOString(),
    handoffFile,
    writerResultFile,
    status: failures.length === 0 ? 'pass' : 'fail',
    metadata,
    checks,
    counts: {
      failures: failures.length,
      warnings: warnings.length,
    },
    failures,
    warnings,
    boundary: {
      liveMutation: false,
      dbMutation: false,
      note: 'This checker validates the controlled C15 writer-result shape only. It does not create candidates, approve canaries, or mutate live/DB state.',
    },
  };
}

function requireText(failures, field, value) {
  if (!normalizeText(value)) failures.push(fieldFailure(field, 'required text is missing'));
}

function fieldFailure(field, message) {
  return {
    code: 'c15-writer-result-field-invalid',
    field,
    message,
  };
}

function evidenceReady(...values) {
  return Boolean(firstEvidence(...values));
}

function firstEvidence(...values) {
  return values.find((value) => {
    if (value === true) return true;
    if (!value || typeof value !== 'object') return false;
    return value.status === 'pass' || value.ready === true;
  }) ?? null;
}

async function readJson(filePath) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function renderHelp() {
  return `
Usage:
  node project-testing/tools/check-c15-writer-result.mjs --handoff-file <handoff.json> --writer-result-file <c15-writer-result.json> --metric-window <window> --output <check.json>

This checker is read-only. It validates the controlled C15 writer-result before evidence archival.
`.trim();
}

async function main() {
  try {
    const options = parseArgs();
    if (options.help) {
      console.log(renderHelp());
      return;
    }

    const report = await checkC15WriterResult(options);
    if (options.output) {
      await writeJson(options.output, report);
    }

    console.log(`C15 writer result check: ${report.status}`);
    console.log(`Failures: ${report.counts.failures}`);
    process.exitCode = report.status === 'pass' ? 0 : 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] === __filename) {
  await main();
}
