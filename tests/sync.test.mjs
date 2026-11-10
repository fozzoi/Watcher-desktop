import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks, createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const utilsDir = path.resolve(__dirname, '../src/utils');
const require = createRequire(import.meta.url);
const ts = require('../node_modules/typescript/lib/typescript.js');

// --- Window, localStorage, and EventTarget shims ---
const storageMap = new Map();
const eventListeners = new Map();
let setItemHook = null;
let dispatchEventHook = null;

class ShimCustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
}

globalThis.CustomEvent = ShimCustomEvent;
globalThis.window = {
  localStorage: {
    getItem(key) {
      return storageMap.has(key) ? storageMap.get(key) : null;
    },
    setItem(key, value) {
      storageMap.set(key, String(value));
      setItemHook?.(key, String(value));
    },
    removeItem(key) {
      storageMap.delete(key);
    },
    clear() {
      storageMap.clear();
    },
  },
  addEventListener(type, fn) {
    if (!eventListeners.has(type)) eventListeners.set(type, new Set());
    eventListeners.get(type).add(fn);
  },
  removeEventListener(type, fn) {
    eventListeners.get(type)?.delete(fn);
  },
  dispatchEvent(event) {
    dispatchEventHook?.(event);
    const listeners = eventListeners.get(event.type);
    if (listeners) {
      for (const fn of [...listeners]) {
        fn(event);
      }
    }
    return true;
  },
};

// --- Axios stub via ESM module hook + TS compiler ---
const axiosState = {
  calls: [],
  postImpl: async () => ({ status: 200, data: { success: true, revision: 0 } }),
  getImpl: async () => ({ status: 200, data: { revision: 0, changes: [], hasMore: false } }),
  deleteImpl: async () => ({ status: 200, data: { success: true, revision: 0 } }),
};

globalThis.__WATCHER_TAURI_TEST_AXIOS__ = {
  interceptors: {
    request: { use() {} },
    response: { use() {} },
  },
  create() {
    return this;
  },
  async post(url, data, config) {
    axiosState.calls.push({ method: 'POST', url, data, config });
    return axiosState.postImpl(url, data, config);
  },
  async get(url, config) {
    axiosState.calls.push({ method: 'GET', url, config });
    return axiosState.getImpl(url, config);
  },
  async delete(url, config) {
    axiosState.calls.push({ method: 'DELETE', url, config });
    return axiosState.deleteImpl(url, config);
  },
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'axios') {
      return { shortCircuit: true, url: 'mock:axios' };
    }
    if (specifier.startsWith('./') && context.parentURL?.startsWith(pathToFileURL(utilsDir).href)) {
      const target = path.resolve(path.dirname(fileURLToPath(context.parentURL)), `${specifier}.ts`);
      if (fs.existsSync(target)) {
        return { shortCircuit: true, url: pathToFileURL(target).href };
      }
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === 'mock:axios') {
      return {
        shortCircuit: true,
        format: 'module',
        source: 'export default globalThis.__WATCHER_TAURI_TEST_AXIOS__;',
      };
    }
    if (url.endsWith('.ts') && url.startsWith(pathToFileURL(utilsDir).href)) {
      const filePath = fileURLToPath(url);
      const sourceText = fs.readFileSync(filePath, 'utf8');
      const transpiled = ts.transpileModule(sourceText, {
        fileName: filePath,
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      });
      return {
        shortCircuit: true,
        format: 'module',
        source: transpiled.outputText,
      };
    }
    return nextLoad(url, context);
  },
});

const { AsyncStorage, setCloudOnlyStorage } = await import(pathToFileURL(path.join(utilsDir, 'storage.ts')).href);
const { syncManager, isApplyingCloudState } = await import(pathToFileURL(path.join(utilsDir, 'syncManager.ts')).href);
const {
  saveProgress,
  removeProgress,
  flushPendingCloudProgressSync,
} = await import(pathToFileURL(path.join(utilsDir, 'progress.ts')).href);

function resetTestState() {
  storageMap.clear();
  eventListeners.clear();
  setItemHook = null;
  dispatchEventHook = null;
  setCloudOnlyStorage(false);
  axiosState.calls = [];
  axiosState.postImpl = async () => ({ status: 200, data: { success: true, revision: 0 } });
  axiosState.getImpl = async () => ({ status: 200, data: { revision: 0, changes: [], hasMore: false } });
  axiosState.deleteImpl = async () => ({ status: 200, data: { success: true, revision: 0 } });
}

describe('Watcher-tauri sync manager and storage regressions', () => {
  beforeEach(() => {
    resetTestState();
  });

  test('non-list writes (progress/chat) do not emit watcher_local_library_changed or trigger performSync', async () => {
    const libraryEvents = [];
    window.addEventListener('watcher_local_library_changed', (e) => libraryEvents.push(e.detail));

    await AsyncStorage.setItem('watcher_auth_token', 'tok-1');
    await AsyncStorage.setItem('watcher_auth_user', JSON.stringify({ userId: 'u1' }));

    await saveProgress({
      tmdbId: 438631,
      mediaType: 'movie',
      title: 'Dune',
      position: 120,
      duration: 600,
      percentage: 20,
      updatedAt: 1000,
    });
    await new Promise((r) => setTimeout(r, 15));
    // Initial saveProgress pushes only an atomic watchProgress mutation (never performSync or library list diff)
    assert.equal(axiosState.calls.length, 1);
    assert.equal(axiosState.calls[0].method, 'POST');
    assert.equal(axiosState.calls[0].data.action, 'mutate');
    assert.equal(axiosState.calls[0].data.mutation.type, 'watchProgress');

    const callsAfterProgress = axiosState.calls.length;
    await AsyncStorage.setItem('watcher.chat.history', JSON.stringify([{ role: 'user', text: 'hi' }]));
    await AsyncStorage.setItem('watcher_cloud_revision', '3');

    // Also calling queueLocalChange directly with non-list keys must be a no-op
    syncManager.queueLocalChange('tok-1', { key: '@watch_progress', previousValue: null, value: '{}' }, 'u1');
    syncManager.queueLocalChange('tok-1', { key: 'watcher.chat.history', previousValue: '[]', value: '[{"a":1}]' }, 'u1');
    await new Promise((r) => setTimeout(r, 15));

    assert.equal(libraryEvents.length, 0);
    assert.equal(axiosState.calls.length, callsAfterProgress);

    // Synced list writes DO emit watcher_local_library_changed with accurate previousValue even in cloudOnly mode
    setCloudOnlyStorage(true);
    await AsyncStorage.setItem('watchlist', JSON.stringify([{ id: 10, media_type: 'movie', title: 'First' }]));
    await AsyncStorage.setItem('watchlist', JSON.stringify([
      { id: 10, media_type: 'movie', title: 'First' },
      { id: 20, media_type: 'tv', title: 'Second' },
    ]));

    assert.equal(libraryEvents.length, 2);
    assert.equal(libraryEvents[1].key, 'watchlist');
    assert.equal(JSON.parse(libraryEvents[1].previousValue).length, 1);
    assert.equal(JSON.parse(libraryEvents[1].value).length, 2);
  });

  test('pullIfChanged keeps applyingCloudState=true across watchProgress writes, merges by updatedAt, and handles watchProgress remove', async () => {
    const userId = 'u-pull';
    await AsyncStorage.setItem('watcher_auth_token', 'tok-pull');
    await AsyncStorage.setItem('watcher_auth_user', JSON.stringify({ userId }));
    await AsyncStorage.setItem('watcher_cloud_revision', '1');
    await AsyncStorage.setItem('@watch_progress', JSON.stringify({
      '101': { tmdbId: 101, mediaType: 'movie', position: 250, duration: 500, updatedAt: 5000 },
      '102': { tmdbId: 102, mediaType: 'movie', position: 10, duration: 500, updatedAt: 1000 },
      '99': { tmdbId: 99, mediaType: 'tv', position: 40, duration: 500, updatedAt: 1500 },
      'tv:99:1:2': { tmdbId: 99, mediaType: 'tv', season: 1, episode: 2, position: 80, duration: 500, updatedAt: 1500 },
    }));

    const applyingDuringStorageWrites = [];
    setItemHook = (key) => {
      if (key === '@watch_progress' || key === 'watch_progress_v1' || key === 'watchlist') {
        applyingDuringStorageWrites.push({ key, applying: isApplyingCloudState() });
      }
    };

    let progressDispatches = 0;
    dispatchEventHook = (event) => {
      if (event.type === 'watcher_watch_progress_changed') {
        progressDispatches += 1;
      }
    };

    axiosState.getImpl = async () => ({
      status: 200,
      data: {
        status: 'delta',
        revision: 3,
        hasMore: false,
        changes: [
          {
            revision: 2,
            type: 'watchProgress',
            action: 'set',
            value: {
              '101': { tmdbId: 101, mediaType: 'movie', position: 50, duration: 500, updatedAt: 2000 },
              '102': { tmdbId: 102, mediaType: 'movie', position: 320, duration: 500, updatedAt: 3000 },
            },
          },
          {
            revision: 3,
            type: 'watchProgress',
            action: 'remove',
            mediaId: 99,
          },
        ],
      },
    });

    const changed = await syncManager.pullIfChanged('tok-pull', userId);
    assert.equal(changed, true);
    assert.equal(isApplyingCloudState(), false);
    assert.ok(applyingDuringStorageWrites.some((entry) => entry.key === '@watch_progress'));
    assert.ok(applyingDuringStorageWrites.every((entry) => entry.applying === true));
    assert.equal(progressDispatches, 1);

    const merged = JSON.parse(await AsyncStorage.getItem('@watch_progress'));
    assert.equal(merged['101'].position, 250); // kept newer local progress
    assert.equal(merged['102'].position, 320); // accepted newer remote progress
    assert.equal(merged['99'], undefined);
    assert.equal(merged['tv:99:1:2'], undefined);
    assert.equal(await AsyncStorage.getItem('watcher_cloud_revision'), '3');
  });

  test('flushOutbox preserves concurrent mutations, drops HTTP 400, clears session on 401, and blocks pullFromCloud on flush error', async () => {
    const userId = 'u-outbox';
    await AsyncStorage.setItem('watcher_auth_token', 'tok-out');
    await AsyncStorage.setItem('watcher_auth_user', JSON.stringify({ userId }));
    await AsyncStorage.setItem('watcher_cloud_revision', '1');

    // Enqueue first mutation while offline so it stays queued in the outbox
    axiosState.postImpl = async () => {
      throw new Error('Offline before flush');
    };
    await syncManager.enqueueMutations('tok-out', userId, [
      { type: 'watchlist', action: 'add', mediaId: 11, mediaType: 'movie', value: { id: 11, media_type: 'movie', title: 'Movie 11' } },
    ]);

    let resolveFirstPost = () => {};
    const firstPostBarrier = new Promise((r) => {
      resolveFirstPost = r;
    });
    let postAttempt = 0;
    axiosState.postImpl = async () => {
      postAttempt += 1;
      if (postAttempt === 1) {
        await firstPostBarrier;
        return { status: 200, data: { success: true, revision: 2 } };
      }
      if (postAttempt === 2) {
        const err = new Error('Bad Request');
        err.response = { status: 400, data: { error: 'invalid mutation' } };
        throw err;
      }
      return { status: 200, data: { success: true, revision: 3 } };
    };

    const flush1Promise = syncManager.flushOutbox('tok-out', userId, { ignoreBackoff: true });
    let enqueue2Promise = Promise.resolve();
    try {
      await new Promise((r) => setTimeout(r, 15));

      // Concurrent invalid mutation appended while first POST is in flight
      enqueue2Promise = syncManager.enqueueMutations('tok-out', userId, [
        { type: 'history', action: 'add', mediaId: 22, mediaType: 'movie', value: { id: 22, media_type: 'movie' } },
      ]);
      await new Promise((r) => setTimeout(r, 15));
      const queuedMidFlight = JSON.parse((await AsyncStorage.getItem(`watcher_sync_outbox_v1:${userId}`)) || '[]');
      assert.equal(queuedMidFlight.length, 2);
    } finally {
      resolveFirstPost();
    }

    const [flush1Result] = await Promise.all([flush1Promise, enqueue2Promise]);
    // Both op 1 (200 -> rev 2) and op 2 (400 -> dropped) are processed; outbox is now empty
    assert.equal(flush1Result.flushed, true);
    assert.equal(flush1Result.remaining, 0);
    assert.equal(await AsyncStorage.getItem('watcher_cloud_revision'), '2');

    // Verify pullFromCloud flushes pending outbox first and returns false without calling GET if flush fails
    axiosState.postImpl = async () => {
      throw new Error('Network offline');
    };
    await syncManager.enqueueMutations('tok-out', userId, [
      { type: 'watchlist', action: 'add', mediaId: 33, mediaType: 'tv', value: { id: 33, media_type: 'tv', title: 'Show 33' } },
    ]);
    const callsBeforePull = axiosState.calls.length;
    const pullFailed = await syncManager.pullFromCloud('tok-out', userId, { ignoreBackoff: true });
    assert.equal(pullFailed, false);
    const getCallsAfterFailedFlush = axiosState.calls.slice(callsBeforePull).filter((c) => c.method === 'GET');
    assert.equal(getCallsAfterFailedFlush.length, 0);

    // Next attempt succeeds POST (rev 2 -> 3) and then GET ?since_revision=3 returns true
    axiosState.postImpl = async () => ({ status: 200, data: { success: true, revision: 3 } });
    axiosState.getImpl = async () => ({ status: 200, data: { revision: 3, changes: [], hasMore: false } });
    const pullOk = await syncManager.pullFromCloud('tok-out', userId, { ignoreBackoff: true });
    assert.equal(pullOk, true);
    assert.equal(await AsyncStorage.getItem('watcher_cloud_revision'), '3');

    // HTTP 401 clears session and dispatches watcher_auth_expired
    let expiredCount = 0;
    window.addEventListener('watcher_auth_expired', () => {
      expiredCount += 1;
    });
    axiosState.postImpl = async () => {
      throw new Error('Offline before auth test');
    };
    await syncManager.enqueueMutations('tok-out', userId, [
      { type: 'watchlist', action: 'add', mediaId: 44, mediaType: 'movie', value: { id: 44, media_type: 'movie' } },
    ]);
    axiosState.postImpl = async () => {
      const err = new Error('Unauthorized');
      err.response = { status: 401, data: { error: 'Invalid token' } };
      throw err;
    };
    const authFailRes = await syncManager.flushOutbox('tok-out', userId, { ignoreBackoff: true });
    assert.equal(authFailRes.flushed, false);
    assert.equal(expiredCount, 1);
    assert.equal(await AsyncStorage.getItem('watcher_auth_token'), null);
  });

  test('queueLocalChange preserves collection mediaType, emits remove (not clear) for single-item delete, and throttled progress flushes', async () => {
    const userId = 'u-coll';
    await AsyncStorage.setItem('watcher_auth_token', 'tok-coll');
    await AsyncStorage.setItem('watcher_auth_user', JSON.stringify({ userId }));
    await AsyncStorage.setItem('watcher_cloud_revision', '0');

    const sentMutations = [];
    axiosState.postImpl = async (_url, body) => {
      sentMutations.push(body.mutation);
      return { status: 200, data: { success: true, revision: sentMutations.length } };
    };

    const collectionItem = { id: 555, media_type: 'collection', title: 'Toy Story Collection' };
    syncManager.queueLocalChange('tok-coll', {
      key: 'watchlist',
      previousValue: '[]',
      value: JSON.stringify([collectionItem]),
    }, userId);

    // Wait for microtasks inside queueLocalChange / enqueueMutations -> flushOutbox
    await new Promise((r) => setTimeout(r, 25));

    assert.equal(sentMutations.length, 1);
    assert.equal(sentMutations[0].action, 'add');
    assert.equal(sentMutations[0].type, 'watchlist');
    assert.equal(sentMutations[0].item.id, 555);
    assert.equal(sentMutations[0].item.media_type, 'collection');

    // Deleting the last remaining single item must emit action: 'remove', NOT 'clear'
    syncManager.queueLocalChange('tok-coll', {
      key: 'watchlist',
      previousValue: JSON.stringify([collectionItem]),
      value: '[]',
    }, userId);
    await new Promise((r) => setTimeout(r, 25));

    assert.equal(sentMutations.length, 2);
    assert.equal(sentMutations[1].action, 'remove');
    assert.equal(sentMutations[1].mediaId, 555);
    assert.equal(sentMutations[1].mediaType, 'collection');

    // Removing when 2+ items existed emits 'clear'
    syncManager.queueLocalChange('tok-coll', {
      key: 'watchlist',
      previousValue: JSON.stringify([collectionItem, { id: 556, media_type: 'movie', title: 'Movie' }]),
      value: '[]',
    }, userId);
    await new Promise((r) => setTimeout(r, 25));
    assert.equal(sentMutations.length, 3);
    assert.equal(sentMutations[2].action, 'clear');

    // Partial progress is throttled and pushed explicitly via flushPendingCloudProgressSync
    await saveProgress({
      tmdbId: 777,
      mediaType: 'movie',
      title: 'Inception',
      position: 300,
      duration: 6000,
      percentage: 5,
      updatedAt: 9000,
    });
    assert.equal(sentMutations.length, 3);
    await flushPendingCloudProgressSync();
    await new Promise((r) => setTimeout(r, 15));
    assert.equal(sentMutations.length, 4);
    assert.equal(sentMutations[3].type, 'watchProgress');
    assert.equal(sentMutations[3].action, 'set');
    assert.equal(sentMutations[3].value['777'].position, 300);

    // removeProgress propagates watchProgress remove to cloud
    await removeProgress(777);
    await new Promise((r) => setTimeout(r, 25));
    assert.equal(sentMutations.length, 5);
    assert.equal(sentMutations[4].type, 'watchProgress');
    assert.equal(sentMutations[4].action, 'remove');
    assert.equal(sentMutations[4].mediaId, 777);
  });
});
