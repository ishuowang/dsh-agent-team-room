/** Build the Node host modules and the single-file DSH Web client bundle. */

import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { build } from 'esbuild'

const tsc = 'node_modules/.bin/tsc'

rmSync('lib', { recursive: true, force: true })
execFileSync(tsc, ['-p', 'tsconfig.build.json'], { stdio: 'inherit' })
execFileSync(tsc, ['-p', 'tsconfig.client.json'], { stdio: 'inherit' })

await build({
  entryPoints: ['src/client/index.ts'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['es2022'],
  sourcemap: true,
  external: [
    '@deepseek-ai/cordis',
    '@deepseek-ai/dsh-*',
    'react',
    'react-dom',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
    'scheduler',
  ],
  banner: {
    js: "window.__ModuleLoader__.load({ id: 'dsh-agent-team-room', factory: (require) => { var module = { exports: {} }; var exports = module.exports;",
  },
  footer: {
    js: 'return module.exports; } });',
  },
  logLevel: 'info',
})
