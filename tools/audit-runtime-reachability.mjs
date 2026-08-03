#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const jsonOnly = args.has('--json');
const failOnMissing = !args.has('--allow-missing');
const validateReview = args.has('--validate-review');

const manifestPath = path.join(root, 'src/app/bundle-order.json');
const releasePath = path.join(root, 'releases/latest.user.js');
const manualReviewPath = path.join(root, 'data/audit/runtime-reachability-review-v1.json');

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function countMatches(text, regex) {
  return [...text.matchAll(regex)].length;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function unique(values) {
  return [...new Set(values)];
}

if (!fs.existsSync(manifestPath)) {
  throw new Error(`Missing bundle manifest: ${path.relative(root, manifestPath)}`);
}
if (!fs.existsSync(releasePath)) {
  throw new Error(`Missing release bundle: ${path.relative(root, releasePath)}`);
}
if (!fs.existsSync(manualReviewPath)) {
  throw new Error(`Missing manual review: ${path.relative(root, manualReviewPath)}`);
}

const manifest = JSON.parse(readText(manifestPath));
const manualReview = JSON.parse(readText(manualReviewPath));
const files = Array.isArray(manifest.files) ? manifest.files : [];
const dependencyModules = Array.isArray(manifest.dependencyAudit?.modules)
  ? manifest.dependencyAudit.modules
  : [];
const dependencyByFile = new Map(dependencyModules.map(item => [item.file, item]));
const manualModuleReviews = Array.isArray(manualReview.moduleReviews)
  ? manualReview.moduleReviews
  : [];
const manualReviewByFile = new Map(manualModuleReviews.map(item => [item.file, item]));
const release = readText(releasePath);
const sourceByFile = new Map();
const missingFiles = [];

for (const file of files) {
  const absolute = path.join(root, file);
  if (!fs.existsSync(absolute)) {
    missingFiles.push(file);
    continue;
  }
  sourceByFile.set(file, readText(absolute));
}

const incoming = new Map(files.map(file => [file, []]));
for (const owner of dependencyModules) {
  for (const requirement of owner.requires || []) {
    if (!incoming.has(requirement.file)) incoming.set(requirement.file, []);
    incoming.get(requirement.file).push({
      from: owner.file,
      symbols: requirement.symbols || [],
      phase: requirement.phase || 'runtime'
    });
  }
}

const hookPatterns = {
  domListener: /addEventListener\s*\(/g,
  mutationObserver: /\bMutationObserver\b/g,
  interval: /\bsetInterval\s*\(/g,
  timeout: /\bsetTimeout\s*\(/g,
  menuCommand: /\bGM_registerMenuCommand\s*\(/g,
  onclickAssignment: /\.onclick\s*=/g,
  immediateInvocation: /\}\)\s*\(\)\s*;?/g,
  globalExport: /\b(?:window|unsafeWindow|SLF_RUNTIME_TARGET)\s*\./g
};

const legacyPatterns = {
  liveParserNaming: /\bliveParser[A-Za-z0-9_]*\b|\bLIVE_PARSER_[A-Z0-9_]+\b/g,
  autoResume: /\bautoResume[A-Za-z0-9_]*\b/g,
  automaticLoop: /\bstartLive\b|\bstopLive\b|\blastSavedBucket\b|\bliveWaitStatus\b/g,
  legacyCollection: /\bLEGACY_COLLECTIONS\b|\blegacyCollectionNames\b/g,
  deprecatedNaming: /\bdeprecated\b|\blegacy\b/gi
};

const candidateStatuses = new Set([
  'ACTIVE_WITH_LEGACY_MARKERS',
  'LEGACY_CANDIDATE',
  'UNREFERENCED_CANDIDATE'
]);

const allSource = [...sourceByFile.values()].join('\n');
const modules = files.map((file, bundleIndex) => {
  const source = sourceByFile.get(file) || '';
  const metadata = dependencyByFile.get(file) || {};
  const declared = metadata.declares || [];
  const publicSymbols = metadata.public || [];
  const incomingDependencies = incoming.get(file) || [];
  const hooks = Object.fromEntries(
    Object.entries(hookPatterns).map(([name, regex]) => [name, countMatches(source, new RegExp(regex.source, regex.flags))])
  );
  const legacyMarkers = Object.fromEntries(
    Object.entries(legacyPatterns).map(([name, regex]) => [name, countMatches(source, new RegExp(regex.source, regex.flags))])
  );
  const symbolEvidence = publicSymbols.map(symbol => {
    const regex = new RegExp(`\\b${escapeRegex(symbol)}\\b`, 'g');
    const totalOccurrences = countMatches(allSource, regex);
    const ownOccurrences = countMatches(source, regex);
    return {
      symbol,
      totalOccurrences,
      externalOccurrences: Math.max(0, totalOccurrences - ownOccurrences)
    };
  });
  const hookCount = Object.values(hooks).reduce((sum, value) => sum + value, 0);
  const legacyMarkerCount = Object.values(legacyMarkers).reduce((sum, value) => sum + value, 0);
  const releaseMarker = `// >>> ${file}`;
  const includedInRelease = release.includes(releaseMarker);
  const activeEvidence = [];
  if (incomingDependencies.length) activeEvidence.push('incoming_dependency');
  if (hookCount) activeEvidence.push('host_or_timer_hook');
  if (file === 'src/app/bootstrap.js') activeEvidence.push('bundle_entrypoint');
  if (symbolEvidence.some(item => item.externalOccurrences > 0)) activeEvidence.push('external_symbol_reference');

  let reviewStatus = 'REVIEW_REQUIRED';
  if (!source) reviewStatus = 'MISSING_SOURCE';
  else if (!includedInRelease) reviewStatus = 'BUNDLE_CONTRACT_MISMATCH';
  else if (activeEvidence.length && legacyMarkerCount) reviewStatus = 'ACTIVE_WITH_LEGACY_MARKERS';
  else if (activeEvidence.length) reviewStatus = 'ACTIVE_EVIDENCE';
  else if (legacyMarkerCount) reviewStatus = 'LEGACY_CANDIDATE';
  else reviewStatus = 'UNREFERENCED_CANDIDATE';

  const manual = manualReviewByFile.get(file) || null;

  return {
    file,
    bundleIndex,
    bytes: Buffer.byteLength(source),
    lines: source ? source.split(/\r?\n/).length : 0,
    includedInRelease,
    declared,
    publicSymbols,
    incomingDependencies,
    symbolEvidence,
    hooks,
    legacyMarkers,
    activeEvidence: unique(activeEvidence),
    reviewStatus,
    manualReview: manual
      ? {
          classification: manual.classification || null,
          evidenceCount: Array.isArray(manual.evidence) ? manual.evidence.length : 0
        }
      : null
  };
});

const statusCounts = Object.fromEntries(
  unique(modules.map(item => item.reviewStatus)).sort().map(status => [
    status,
    modules.filter(item => item.reviewStatus === status).length
  ])
);

const reviewCandidates = modules.filter(item => candidateStatuses.has(item.reviewStatus));
const unreviewedCandidates = reviewCandidates
  .filter(item => !item.manualReview?.classification || item.manualReview.evidenceCount < 1)
  .map(item => item.file);
const staleManualReviews = manualModuleReviews
  .map(item => item.file)
  .filter(file => !files.includes(file));

const report = {
  schema: 'slf_runtime_reachability_audit_v1',
  generatedAt: new Date().toISOString(),
  inputs: {
    manifest: path.relative(root, manifestPath),
    release: path.relative(root, releasePath),
    manualReview: path.relative(root, manualReviewPath),
    manifestSchema: manifest.schema || null,
    manualReviewSchema: manualReview.schema || null,
    expectedModuleCount: manifest.dependencyAudit?.expectedModuleCount ?? null
  },
  summary: {
    bundleModules: files.length,
    dependencyAuditModules: dependencyModules.length,
    sourceFilesRead: sourceByFile.size,
    missingFiles,
    releaseMarkerMismatches: modules.filter(item => !item.includedInRelease).map(item => item.file),
    statusCounts,
    reviewCandidateCount: reviewCandidates.length,
    reviewedCandidateCount: reviewCandidates.length - unreviewedCandidates.length,
    unreviewedCandidates,
    staleManualReviews
  },
  limitations: [
    'Static evidence does not prove runtime reachability.',
    'String-based callbacks, browser globals and data-driven dispatch require manual review.',
    'Legacy markers identify review targets, not safe deletion candidates.',
    'A module may contain both active and obsolete code and must be reviewed at symbol level.'
  ],
  modules
};

if (jsonOnly) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  console.log('[runtime-reachability-audit]');
  console.log(`bundle modules: ${report.summary.bundleModules}`);
  console.log(`dependency audit modules: ${report.summary.dependencyAuditModules}`);
  console.log(`source files read: ${report.summary.sourceFilesRead}`);
  console.log(`missing files: ${missingFiles.length}`);
  console.log(`release marker mismatches: ${report.summary.releaseMarkerMismatches.length}`);
  for (const [status, count] of Object.entries(statusCounts)) {
    console.log(`${status}: ${count}`);
  }
  console.log(`review candidates: ${report.summary.reviewCandidateCount}`);
  console.log(`reviewed candidates: ${report.summary.reviewedCandidateCount}`);
  console.log(`unreviewed candidates: ${unreviewedCandidates.length}`);
  for (const item of reviewCandidates) {
    const classification = item.manualReview?.classification || 'UNREVIEWED';
    console.log(`candidate ${item.reviewStatus} ${classification} ${item.file}`);
  }
}

if (failOnMissing && (missingFiles.length || report.summary.releaseMarkerMismatches.length)) {
  process.exitCode = 1;
}
if (validateReview && (unreviewedCandidates.length || staleManualReviews.length)) {
  process.exitCode = 1;
}
