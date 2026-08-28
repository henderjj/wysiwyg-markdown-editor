#!/usr/bin/env node
// Bumps the app version in the five places CLAUDE.md requires to stay in sync,
// and verifies afterwards that all five actually agree.
//
//   node scripts/bump-version.mjs patch        # 1.8.1 -> 1.8.2
//   node scripts/bump-version.mjs minor        # 1.8.1 -> 1.9.0
//   node scripts/bump-version.mjs major        # 1.8.1 -> 2.0.0
//   node scripts/bump-version.mjs 2.0.0-rc.1   # explicit
//   node scripts/bump-version.mjs patch --dry-run
//
// package.json is the source of truth for the current version. The npm pair is
// handled by `npm version --no-git-tag-version`, which rewrites package.json and
// package-lock.json (root `version` *and* `packages[""].version`) together and
// offline — doing it by hand is what leaves the lockfile behind. The three
// Rust/Tauri files are edited with anchored replacements so nothing else in them
// can be caught by accident; in particular Cargo.lock's edit is pinned to the
// `version =` line immediately following `name = "wysiwyg-markdown"`, because
// that file contains a `version =` line for every crate in the tree.
//
// Prints `version=<new>` on stdout as its last line so CI can capture it.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const spec = args.find((a) => !a.startsWith('--'))

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

const PKG = join(root, 'package.json')
const CONF = join(root, 'src-tauri', 'tauri.conf.json')
const CARGO_TOML = join(root, 'src-tauri', 'Cargo.toml')
const CARGO_LOCK = join(root, 'src-tauri', 'Cargo.lock')

function die(message) {
  console.error(`error: ${message}`)
  process.exit(1)
}

if (!spec) die('usage: bump-version.mjs <patch|minor|major|x.y.z> [--dry-run]')

const current = JSON.parse(readFileSync(PKG, 'utf8')).version
if (!SEMVER.test(current)) die(`package.json version "${current}" is not semver`)

let next
if (spec === 'patch' || spec === 'minor' || spec === 'major') {
  // Drop any prerelease/build suffix when stepping — 1.9.0-rc.1 + patch is
  // 1.9.1, not 1.9.0-rc.2. This project has never shipped a prerelease, so the
  // simple reading is the right one.
  const [, maj, min, pat] = current.match(SEMVER).map(Number)
  next =
    spec === 'major' ? `${maj + 1}.0.0` : spec === 'minor' ? `${maj}.${min + 1}.0` : `${maj}.${min}.${pat + 1}`
} else {
  if (!SEMVER.test(spec)) die(`"${spec}" is neither a bump type nor a semver version`)
  next = spec
}

if (next === current) die(`version is already ${next}`)

console.log(`${current} -> ${next}${dryRun ? '  (dry run, nothing written)' : ''}`)

if (dryRun) {
  console.log(`version=${next}`)
  process.exit(0)
}

// --- 1 + 2: package.json and package-lock.json -------------------------------
execFileSync('npm', ['version', next, '--no-git-tag-version', '--allow-same-version'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

// --- 3: src-tauri/tauri.conf.json --------------------------------------------
// Anchored to the top-level key, which sits at exactly two spaces of indent.
replace(CONF, /^(\s{2}"version":\s*")[^"]+(")/m, next, 'tauri.conf.json top-level "version"')

// --- 4: src-tauri/Cargo.toml --------------------------------------------------
// The first `version =` after the `[package]` header. The dependency versions
// further down are all inside `[dependencies]`-style tables, so anchoring to
// the start of the file up to the first blank-line-separated section is enough.
replace(
  CARGO_TOML,
  /^(\[package\][\s\S]*?\nversion\s*=\s*")[^"]+(")/m,
  next,
  'Cargo.toml [package] version',
)

// --- 5: src-tauri/Cargo.lock (this crate's entry only) ------------------------
replace(
  CARGO_LOCK,
  /^(name = "wysiwyg-markdown"\nversion = ")[^"]+(")/m,
  next,
  'Cargo.lock wysiwyg-markdown entry',
)

function replace(file, pattern, value, what) {
  const before = readFileSync(file, 'utf8')
  if (!pattern.test(before)) die(`could not find ${what} in ${file}`)
  const after = before.replace(pattern, `$1${value}$2`)
  if (after === before) die(`${what} in ${file} was not changed`)
  writeFileSync(file, after)
  console.log(`updated ${what}`)
}

// --- verify all five agree ----------------------------------------------------
const found = {
  'package.json': JSON.parse(readFileSync(PKG, 'utf8')).version,
  'package-lock.json (root)': JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')).version,
  'package-lock.json (packages[""])': JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')).packages[''].version,
  'tauri.conf.json': JSON.parse(readFileSync(CONF, 'utf8')).version,
  'Cargo.toml': readFileSync(CARGO_TOML, 'utf8').match(/^\[package\][\s\S]*?\nversion\s*=\s*"([^"]+)"/m)?.[1],
  'Cargo.lock': readFileSync(CARGO_LOCK, 'utf8').match(/^name = "wysiwyg-markdown"\nversion = "([^"]+)"/m)?.[1],
}

const wrong = Object.entries(found).filter(([, v]) => v !== next)
if (wrong.length) {
  for (const [where, v] of wrong) console.error(`  ${where}: ${v}`)
  die(`not every version site reached ${next}`)
}

console.log(`all version sites now at ${next}`)
console.log(`version=${next}`)
