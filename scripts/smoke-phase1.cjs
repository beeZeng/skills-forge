const fs = require('fs')
const path = require('path')
const os = require('os')
const {
  buildManifest,
  writeManifestFile,
  validateManifest,
  MANIFEST_VERSION,
  buildSkillId,
  buildUserSkillId,
} = require('../electron/main/skills/manifest.cjs')
const {
  writeRegistry,
  readRegistry,
  scanLocalSkills,
  installFromZip,
  getAgentSkillsRoot,
} = require('../electron/main/skills/local-skill-manager.cjs')
const { normalizeSkillPackage } = require('../electron/main/skills/normalize-package.cjs')
const JSZip = require('jszip')

async function main() {
  // 1) manifest schema
  const m = buildManifest({
    name: 'Weather',
    namespace: 'user',
    author: 'alice',
    description: '天气',
    source: 'SkillHub',
    entry: 'main.py',
  })
  console.log('manifest', {
    manifest_version: m.manifest_version,
    skill_id: m.skill_id,
    entry: m.entry,
  })
  if (m.manifest_version !== MANIFEST_VERSION) throw new Error('manifest_version')
  if (m.skill_id !== 'com.user.weather') throw new Error('skill_id ' + m.skill_id)
  const v = validateManifest(m)
  if (!v.ok) throw new Error(v.error)

  // coexistence
  const a = buildSkillId({ name: 'Weather', sourceId: 'cursor' })
  const b = buildSkillId({ name: 'Weather', sourceId: 'skillhub' })
  console.log('coexist', a, b)
  if (a === b) throw new Error('same name must differ by namespace')

  // 2) registry array shape
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'phase1-home-'))
  const skillsRoot = getAgentSkillsRoot(home)
  fs.mkdirSync(skillsRoot, { recursive: true })
  writeRegistry(
    {
      version: 1,
      scannedAt: null,
      skills: {
        'com.user.weather': {
          skill_id: 'com.user.weather',
          name: 'Weather',
          version: '1.0.0',
          source: 'SkillHub',
          install_path: '~/.agent/skills/com.user.weather',
          hash: 'abc',
          status: 'installed',
        },
      },
    },
    home,
  )
  const raw = JSON.parse(fs.readFileSync(path.join(home, '.agent', 'registry.json'), 'utf8'))
  if (!Array.isArray(raw.skills)) throw new Error('registry skills must be array')
  console.log('registry ok', raw.skills[0].skill_id)
  const loaded = readRegistry(home)
  if (!loaded.skills['com.user.weather']) throw new Error('read map failed')

  // 3) legacy scan auto-manifest
  const legacyDir = path.join(skillsRoot, 'old-tool')
  fs.mkdirSync(legacyDir, { recursive: true })
  fs.writeFileSync(path.join(legacyDir, 'main.py'), 'print(1)\n')
  const scan = scanLocalSkills(home, { forceFull: true })
  const legacy = scan.skills.find((s) => s.name === 'old-tool' || s.skill_id.includes('old'))
  console.log('legacy', legacy)
  if (!legacy || legacy.status !== 'installed') throw new Error('legacy not auto-fixed')
  if (!fs.existsSync(path.join(legacyDir, 'manifest.json'))) throw new Error('no manifest written')

  // 4) install version_update conflict
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'phase1-zip-'))
  const zip1 = path.join(tmp, 'w1.zip')
  const z1 = new JSZip()
  z1.file(
    'weather/manifest.json',
    JSON.stringify(
      {
        manifest_version: '1.0',
        skill_id: 'com.demo.weather',
        name: 'Weather',
        version: '1.0.0',
        author: 'demo',
        description: 'v1',
        source: 'SkillHub',
        entry: 'main.py',
        hash: '',
      },
      null,
      2,
    ),
  )
  z1.file('weather/main.py', 'print(1)\n')
  z1.file('weather/skill.md', '# Weather\n')
  z1.file('weather/README.md', '# Weather\n')
  fs.writeFileSync(zip1, await z1.generateAsync({ type: 'nodebuffer' }))
  const i1 = await installFromZip({ zipPath: zip1, homeDir: home, sourceId: 'SkillHub' })
  console.log('install1', i1.ok, i1.installPath)
  if (!i1.ok) throw new Error(i1.error)

  const zip2 = path.join(tmp, 'w2.zip')
  const z2 = new JSZip()
  z2.file(
    'weather/manifest.json',
    JSON.stringify(
      {
        manifest_version: '1.0',
        skill_id: 'com.demo.weather',
        name: 'Weather',
        version: '1.1.0',
        author: 'demo',
        description: 'v2',
        source: 'SkillHub',
        entry: 'main.py',
        hash: '',
      },
      null,
      2,
    ),
  )
  z2.file('weather/main.py', 'print(2)\n')
  z2.file('weather/skill.md', '# Weather v2\n')
  z2.file('weather/README.md', '# Weather\n')
  fs.writeFileSync(zip2, await z2.generateAsync({ type: 'nodebuffer' }))
  const i2 = await installFromZip({ zipPath: zip2, homeDir: home, sourceId: 'SkillHub' })
  console.log('install2 conflict', i2.conflict, i2.error)
  if (i2.conflict !== 'version_update') throw new Error('expected version_update')
  const i3 = await installFromZip({
    zipPath: zip2,
    homeDir: home,
    sourceId: 'SkillHub',
    conflictResolution: 'update',
  })
  console.log('install3 update', i3.ok, i3.installed && i3.installed.version)
  if (!i3.ok || i3.installed.version !== '1.1.0') throw new Error('update failed')

  // 5) normalize includes hash + manifest_version
  const nd = path.join(tmp, 'norm')
  const n = normalizeSkillPackage(
    nd,
    {
      name: 'Demo',
      source: 'SkillHub',
      author: 'u',
      description: 'd',
      origin: 'imported',
      entry: 'main.py',
    },
    { layout: 'flat', allowEmptySkillMd: true },
  )
  console.log('normalize', n.manifest.manifest_version, Boolean(n.manifest.hash))
  if (!n.ok || !n.manifest.hash) throw new Error('hash missing')

  fs.rmSync(home, { recursive: true, force: true })
  fs.rmSync(tmp, { recursive: true, force: true })
  console.log('PASS phase1')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
