// `npm version <patch|minor|major|x.y.z>` runs this (package.json's "version" script): the new
// version goes into manifest.json, and versions.json records the Obsidian version it needs.
import { readFileSync, writeFileSync } from 'node:fs'

const version = process.env.npm_package_version
if (!version) throw new Error('Run through `npm version`.')

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'))
manifest.version = version
writeFileSync('manifest.json', `${JSON.stringify(manifest, null, 2)}\n`)

const versions = JSON.parse(readFileSync('versions.json', 'utf8'))
versions[version] = manifest.minAppVersion
writeFileSync('versions.json', `${JSON.stringify(versions, null, 2)}\n`)
