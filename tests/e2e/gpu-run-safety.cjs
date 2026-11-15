'use strict';
/**
 * Safety orchestration for short GPU QA sequences.
 * Host inspection is read-only and happens before and after EVERY run.
 * Any unavailable health signal must stop the remaining hardware workload.
 */
function normalizeSafety(value) {
  if (value && value.safe === true && Array.isArray(value.problems) && value.problems.length === 0) {
    return value;
  }
  if (value && value.safe === false && Array.isArray(value.problems) && value.problems.length > 0) {
    return value;
  }
  return { safe: false, problems: ['Invalid or incomplete host safety inspection'] };
}

async function runGuardedGpuSequence({ runs, inspectHost, runOnce, onCheck = () => {} }) {
  if (!Number.isInteger(runs) || runs < 1 || runs > 3) {
    throw new RangeError('GPU run count must be an integer between 1 and 3');
  }
  if (typeof inspectHost !== 'function' || typeof runOnce !== 'function' || typeof onCheck !== 'function') {
    throw new TypeError('GPU safety orchestration requires inspection, run and evidence callbacks');
  }
  let completedRuns = 0;
  async function check(stage, run) {
    let safety;
    try {
      safety = normalizeSafety(await inspectHost());
    } catch (error) {
      safety = { safe: false, problems: ['Host safety inspection failed: ' +
        String(error?.message || error).slice(0, 240)] };
    }
    await onCheck({ stage, run, safety });
    return safety;
  }
  for (let run = 1; run <= runs; run++) {
    const before = await check('before', run);
    if (!before.safe) return {
      success: false, blocked: true, stage: 'before', run,
      problems: before.problems, completedRuns,
    };
    let passed = false;
    try {
      passed = (await runOnce(run)) === true;
    } catch (error) {
      // Stop further GPU runs if the runner itself unexpectedly throws.
      passed = false;
    }
    completedRuns++;
    const after = await check('after', run);
    if (!after.safe) return {
      success: false, blocked: true, stage: 'after', run,
      problems: after.problems, completedRuns,
    };
    if (!passed) return { success: false, blocked: false, completedRuns };
  }
  return { success: true, blocked: false, completedRuns };
}

module.exports = { runGuardedGpuSequence };
