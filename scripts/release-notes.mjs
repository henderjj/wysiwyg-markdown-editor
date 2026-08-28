#!/usr/bin/env node
// Builds a CHANGELOG section for everything merged since the last version tag,
// splitting Dependabot's bumps out from hand-written work so neither hides the
// other. Optionally inserts it into CHANGELOG.md.
//
//   node scripts/release-notes.mjs 1.9.0                  # print to stdout
//   node scripts/release-notes.mjs 1.9.0 --insert         # write into CHANGELOG.md
//   node scripts/release-notes.mjs 1.9.0 --since v1.8.0   # override the base tag
//
// What this produces is a factual list of merges, not the prose this changelog
// normally carries. It is a starting point: expand it by hand before publishing
// the draft release. It deliberately lists non-Dependabot commits too — a
// dependency-roll release that quietly swallowed a real change would be worse
// than a slightly noisy section.
//
// Requires a full clone (`fetch-depth: 0` in Actions); a shallow one has no tags
// and no history to walk.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const insert = args.includes('--insert')
const sinceIdx = args.indexOf('--since')
const sinceValue = sinceIdx === -1 ? null : args[sinceIdx + 1]
const version = args.find((a) => !a.startsWith('--') && a !== sinceValue)

if (!version) {
  console.error('usage: release-notes.mjs <version> [--since <tag>] [--insert]')
  process.exit(1)
}

const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim()

let since = sinceValue || ''
if (!since) {
  try {
    since = git('describe', '--tags', '--abbrev=0')
  } catch {
    since = '' // no tags yet — take the whole history
  }
}

const range = since ? `${since}..HEAD` : 'HEAD'
const subjects = git('log', '--no-merges', '--format=%s', range).split('\n').filter(Boolean)

// Dependabot's squash-merge subjects are "Bump <x> from <a> to <b> (#n)" or
// "Bump the <group> group with <n> updates (#n)". Matching on the leading verb
// is what GitHub's own release-note grouping does and it holds for both shapes.
const isBump = (s) => /^Bump /.test(s)
const bumps = subjects.filter(isBump)
const others = subjects.filter((s) => !isBump(s))

const lines = [`## [${version}]`, '']

if (bumps.length) {
  lines.push('### Changed', '')
  lines.push(
    `- Merged ${bumps.length} Dependabot dependency update${bumps.length === 1 ? '' : 's'}${since ? ` since ${since}` : ''}:`,
  )
  for (const b of bumps) lines.push(`  - ${b}`)
  lines.push('')
}

if (others.length) {
  lines.push(bumps.length ? '### Other changes' : '### Changed', '')
  for (const o of others) lines.push(`- ${o}`)
  lines.push('')
}

if (!bumps.length && !others.length) {
  lines.push('### Changed', '', `- No changes recorded since ${since || 'the start of history'}.`, '')
}

const section = lines.join('\n')

if (!insert) {
  console.log(section)
  process.exit(0)
}

const path = join(root, 'CHANGELOG.md')
const changelog = readFileSync(path, 'utf8')

// Plain line comparison rather than a regex: the version is full of dots and
// the heading of brackets, and getting either escape wrong turns the guard into
// a character class that quietly matches the wrong thing.
const heading = `## [${version}]`
if (changelog.split('\n').some((line) => line.trimEnd() === heading)) {
  console.log(`CHANGELOG.md already has a [${version}] section; leaving it alone`)
  process.exit(0)
}

// Insert immediately above the first existing release heading, so the file stays
// newest-first and the Keep a Changelog preamble is untouched.
const firstHeading = changelog.search(/^## \[/m)
const updated =
  firstHeading === -1
    ? `${changelog.trimEnd()}\n\n${section}`
    : changelog.slice(0, firstHeading) + section + '\n' + changelog.slice(firstHeading)

writeFileSync(path, updated)
console.log(`inserted [${version}] into CHANGELOG.md (${bumps.length} bumps, ${others.length} other commits)`)
