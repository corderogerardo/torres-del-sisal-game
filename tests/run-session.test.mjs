import assert from 'node:assert/strict';
import test from 'node:test';

const runRecords = await import('../public/run-records.mjs').catch(() => null);

test('run session measures a terminal rescue with a monotonic clock and submits it once', () => {
  assert.equal(typeof runRecords?.createRunSession, 'function', 'run session recorder must be exported');
  let now = 120;
  let idCalls = 0;
  const session = runRecords.createRunSession({
    now: () => now,
    createClientRunId: () => { idCalls += 1; return 'c6b7d9c0-f04c-4e65-8d86-14119608d2f1'; },
  });

  const started = session.start('Normal');
  now = 183576;
  const finished = session.finish({ outcome: 'rescued', floorReached: 7, mementos: 4 });

  assert.deepEqual(started, {
    clientRunId: 'c6b7d9c0-f04c-4e65-8d86-14119608d2f1',
    difficulty: 'Normal',
  });
  assert.deepEqual(finished, {
    clientRunId: 'c6b7d9c0-f04c-4e65-8d86-14119608d2f1',
    difficulty: 'Normal',
    outcome: 'rescued',
    durationMs: 183456,
    floorReached: 7,
    mementos: 4,
  });
  assert.equal(session.finish({ outcome: 'rescued', floorReached: 7, mementos: 4 }), null);
  assert.equal(idCalls, 1);
});

test('forced ascension stays in progress and is not submitted as a terminal loss', () => {
  assert.equal(typeof runRecords?.createRunSession, 'function', 'run session recorder must be exported');
  let now = 0;
  const session = runRecords.createRunSession({
    now: () => now,
    createClientRunId: () => 'c6b7d9c0-f04c-4e65-8d86-14119608d2f1',
  });
  session?.start('Pesadilla');

  now = 2500;
  assert.equal(session?.finish({ outcome: 'forced_ascension', floorReached: 3, mementos: 2 }), null);
  const jumped = session?.finish({ outcome: 'jumped', floorReached: 4, mementos: 2 });
  assert.equal(jumped?.outcome, 'jumped');
  assert.equal(jumped?.durationMs, 2500);
});

test('run session rejects invalid difficulty, duration, floor, and memento ranges', () => {
  assert.equal(typeof runRecords?.createRunSession, 'function', 'run session recorder must be exported');
  let now = 0;
  const session = runRecords.createRunSession({
    now: () => now,
    createClientRunId: () => 'c6b7d9c0-f04c-4e65-8d86-14119608d2f1',
  });

  assert.equal(session?.start('Unknown'), null);
  assert.deepEqual(session?.start('Piadoso'), {
    clientRunId: 'c6b7d9c0-f04c-4e65-8d86-14119608d2f1', difficulty: 'Piadoso',
  });
  assert.equal(session?.finish({ outcome: 'rescued', floorReached: 1, mementos: 0 }), null);

  now = 1500;
  assert.equal(session?.finish({ outcome: 'rescued', floorReached: 8, mementos: 0 }), null);
});
