/**
 * Can this be deployed by somebody who reads nothing?
 *
 * The deploy config is the one part of the project that is never exercised by
 * playing the game: it is read once, by a build machine, in an environment
 * nobody can see, and when it is wrong the failure is a blank page or — worse
 * — a server that works but has quietly allowed every origin on the internet
 * to open sockets against it. None of that shows up in a playthrough.
 *
 * So these are the deploy's unit tests. They set the environment variables a
 * host actually sets and read back what the server would do with them, and
 * they check that the two config files agree with the code they configure.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { config, originAllowed } from '../server/config';

/** Run `fn` with exactly these env vars set, and put the environment back. */
function withEnv(vars: Record<string, string | undefined>, fn: () => void): void {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) {
    saved[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try {
    fn();
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

test('a hosted deployment is production even if NODE_ENV was lost', () => {
  withEnv({ NODE_ENV: undefined, RAILWAY_ENVIRONMENT: 'production' }, () => {
    assert.equal(config.production, true);
  });
  withEnv({ NODE_ENV: 'production', RAILWAY_ENVIRONMENT: undefined }, () => {
    assert.equal(config.production, true);
  });
  withEnv({ NODE_ENV: undefined, RAILWAY_ENVIRONMENT: undefined }, () => {
    assert.equal(config.production, false, 'a dev machine is not production');
  });
});

test('production refuses an origin nobody listed, and allows the ones listed', () => {
  withEnv({ NODE_ENV: 'production', ALLOWED_ORIGINS: undefined }, () => {
    // The client is served by this process, so a browser on the same origin
    // sends no Origin header on the handshake and needs no permission.
    assert.equal(originAllowed(undefined), true, 'same-origin and native clients');
    assert.equal(originAllowed('https://evil.example'), false, 'nothing is listed');
  });
  withEnv({ NODE_ENV: 'production', ALLOWED_ORIGINS: 'https://play.example, https://beta.example' }, () => {
    assert.equal(originAllowed('https://play.example'), true);
    assert.equal(originAllowed('https://beta.example'), true);
    assert.equal(originAllowed('https://evil.example'), false);
  });
  withEnv({ NODE_ENV: 'production', ALLOWED_ORIGINS: '*' }, () => {
    assert.equal(originAllowed('https://anywhere.example'), true, 'an operator may opt in');
  });
  withEnv({ NODE_ENV: undefined, RAILWAY_ENVIRONMENT: undefined, ALLOWED_ORIGINS: undefined }, () => {
    assert.equal(originAllowed('http://localhost:5173'), true, 'the Vite dev client');
  });
});

test('the snapshot follows an attached volume, and an operator still wins', () => {
  withEnv({ PERSIST_FILE: undefined, RAILWAY_VOLUME_MOUNT_PATH: undefined }, () => {
    assert.equal(config.persistence.file, 'hexhold.db');
  });
  withEnv({ PERSIST_FILE: undefined, RAILWAY_VOLUME_MOUNT_PATH: '/data' }, () => {
    assert.equal(config.persistence.file, '/data/hexhold.db');
  });
  withEnv({ PERSIST_FILE: undefined, RAILWAY_VOLUME_MOUNT_PATH: '/data/' }, () => {
    assert.equal(config.persistence.file, '/data/hexhold.db', 'a trailing slash is not two');
  });
  withEnv({ PERSIST_FILE: '/elsewhere/hexhold.db', RAILWAY_VOLUME_MOUNT_PATH: '/data' }, () => {
    assert.equal(config.persistence.file, '/elsewhere/hexhold.db');
  });
});

test('the port and the interface are the host\'s to choose', () => {
  // Both are read when this module is imported, which is after the host has
  // set them and before anything listens — so these assert the defaults a
  // deploy falls back to, not a late change. Binding localhost instead of
  // every interface is the version of this that passes every local test and
  // then fails its health check from outside the container.
  assert.equal(config.host, process.env.HOST ?? '0.0.0.0');
  assert.equal(config.port, process.env.PORT ? Number(process.env.PORT) : 3001);
});

test('railway.json configures the game that is actually in this repository', () => {
  const rw = JSON.parse(readFileSync('railway.json', 'utf8')) as {
    build: { builder: string; dockerfilePath: string };
    deploy: { healthcheckPath: string; numReplicas: number; startCommand?: string };
  };

  // Nixpacks would install with NODE_ENV=production and fail on `vite`, which
  // is a devDependency. The Dockerfile says what it installs, in the repo.
  assert.equal(rw.build.builder, 'DOCKERFILE');
  const dockerfile = readFileSync(rw.build.dockerfilePath, 'utf8');

  // A health check pointed at a route the server does not serve reports a
  // perfectly healthy deployment as dead, forever.
  const server = readFileSync('server/index.ts', 'utf8');
  assert.match(server, new RegExp(`app\\.get\\('${rw.deploy.healthcheckPath}'`));

  // Tables live in this process's memory: a second replica is a second game.
  assert.equal(rw.deploy.numReplicas, 1);

  // The image's CMD must be the one that works inside the image; a
  // startCommand here would silently replace it with a path that is only
  // right in a source checkout.
  assert.equal(rw.deploy.startCommand, undefined);
  assert.match(dockerfile, /CMD \["node", "server\/index\.mjs"\]/);
  // ...and that bundle needs to be told where the client went, because the
  // runtime stage does not keep the repository's layout.
  assert.match(dockerfile, /CLIENT_DIR=\/app\/client/);
  assert.match(dockerfile, /COPY --from=build .* \/app\/dist \.\/client/);
});

test('the image build does not carry the host node_modules into itself', () => {
  const ignore = readFileSync('.dockerignore', 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  assert.ok(ignore.includes('node_modules'), 'another platform\'s binaries, over the npm ci');
  assert.ok(ignore.includes('.git'));
  // tsconfig.json includes test/, so `tsc -b` in the build stage reads it.
  assert.ok(!ignore.includes('test'), 'excluding test/ breaks `tsc -b`');
});
