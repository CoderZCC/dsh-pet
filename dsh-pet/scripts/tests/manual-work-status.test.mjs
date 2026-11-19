import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function sprite() {
  const played = [];
  function PetSprite() {}
  const context = vm.createContext({
    PetSprite,
    console: { log() {}, error() {} },
    Date,
    window: { __dshPetDebug: {}, setTimeout: () => 1, clearTimeout() {} },
    BUBBLE_DURATION_MS: 10000,
    S: {
      WORK_STATUS_INDEX: { thinking: 0, working: 1, success: 2, error: 3 },
      isEventAnim: () => false,
      isNoMirrorAnimation: () => false,
      pickSlot: (slot) => slot,
      poolIncludes: (pool, anim) => pool.includes(anim),
    },
  });
  for (const file of ['sprite/playback.js', 'sprite/menu.js', 'events.js']) {
    vm.runInContext(readFileSync(new URL('../../runtime/electron-helper/' + file, import.meta.url), 'utf8'), context);
  }
  const s = new PetSprite();
  Object.assign(s, {
    pet: { id: 'main', workStatusEnabled: true },
    animations: {
      moves: { actions: [] },
      categories: [],
      events: { workStatus: ['think', 'work', 'success', 'error'] },
      idle: ['idle'],
      turn: [],
      drag: [],
      clicks: [],
    },
    anim: 'manual',
    manualAnimation: true,
    prevWorkTick: 1,
    prevWorkState: 'thinking',
    workState: 'thinking',
    workTimer: null,
    dragState: { active: false },
    closeMenu() {},
    stopMove() {
      played.push('stopMove');
    },
    renderBubble() {},
    playOnce(name) {
      this.manualAnimation = false;
      this.anim = name;
      played.push(name);
    },
    switchTo(name) {
      this.manualAnimation = false;
      this.anim = name;
      played.push(name);
    },
    playIdle() {
      played.push('idle');
    },
  });
  return { s, played };
}

test('manual animation survives hook bursts and resumes only the latest work state', () => {
  const { s, played } = sprite();
  for (const [i, state] of ['working', 'thinking', 'working'].entries()) {
    s.onWorkTick({ state, task: state }, i + 2);
  }
  assert.deepEqual(played, []);
  assert.equal(s.anim, 'manual');
  s.handleEnded();
  assert.deepEqual(played, ['stopMove', 'work']);
  assert.equal(s.workText, 'working');
  assert.equal(s.manualAnimation, false);
  s.onWorkTick({ state: 'thinking' }, 5);
  assert.equal(s.anim, 'think', 'automatic animation still follows subsequent hooks');
});

test('terminal hook is deferred until manual animation ends', () => {
  const { s, played } = sprite();
  s.onWorkTick({ state: 'success', task: 'done' }, 2);
  assert.deepEqual(played, []);
  s.handleEnded();
  assert.equal(s.anim, 'success');
  assert.equal(s.workText, 'done');
});

test('session end during manual playback clears work state without cancelling the animation', () => {
  const { s, played } = sprite();
  s.onWorkTick({ state: 'working' }, 2);
  s.onWorkTick({ state: null }, 3);
  assert.deepEqual(played, []);
  s.handleEnded();
  assert.deepEqual(played, ['idle']);
  assert.equal(s.workState, null);
  assert.equal(s.workText, null);
  assert.equal(s.deferredWork, null);
});

test('manual animation resumes an unchanged active work state on completion', () => {
  const { s, played } = sprite();
  s.handleEnded();
  assert.deepEqual(played, ['think']);
});

test('menu and URL playback both protect manual animation from hooks', () => {
  for (const start of [
    (s) => s.onMenuAction({ anim: 'dance', label: 'Dance' }),
    (s) => s.playUrlOnce('http://localhost/dance.webm', 'playback-1'),
  ]) {
    const { s, played } = sprite();
    s.manualAnimation = false;
    start(s);
    assert.equal(s.manualAnimation, true);
    const count = played.length;
    s.onWorkTick({ state: 'working' }, 2);
    assert.equal(played.length, count);
    s.handleEnded();
    assert.equal(s.anim, 'work');
  }
});

test('repeated hook state updates text without restarting the animation', () => {
  const { s, played } = sprite();
  s.manualAnimation = false;
  s.anim = 'work';
  s.prevWorkState = 'working';
  for (let tick = 2; tick < 8; tick++) s.onWorkTick({ state: 'working', task: 'task-' + tick }, tick);
  assert.deepEqual(played, []);
  assert.equal(s.workText, 'task-7');
});

test('rapid working/thinking changes finish the current video and apply only the latest state', () => {
  const { s, played } = sprite();
  s.manualAnimation = false;
  s.anim = 'think';
  s.front = 0;
  s.videoA = { loop: true };
  s.onWorkTick({ state: 'working' }, 2);
  s.onWorkTick({ state: 'thinking' }, 3);
  s.onWorkTick({ state: 'success' }, 4);
  assert.deepEqual(played, []);
  assert.equal(s.videoA.loop, false);
  s.videoA.onended();
  assert.deepEqual(played, ['stopMove', 'success']);
  s.onWorkTick({ state: 'success' }, 5);
  assert.deepEqual(played, ['stopMove', 'success']);
});
