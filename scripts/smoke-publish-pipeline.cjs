const fs = require('fs')
const path = require('path')
const os = require('os')
const JSZip = require('jszip')
const {
  preparePublishFromZip,
  finalizePublishSession,
  cleanupPublishSession,
} = require('../electron/main/skills/publish-pipeline.cjs')

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pub-test-'))
  const zipPath = path.join(tmp, 'my_skill.zip')
  const zip = new JSZip()
  zip.file('main.py', 'print("hello")\n')
  zip.file('config.json', '{"ok":true}\n')
  zip.file('test.py', 'print("test")\n')
  fs.writeFileSync(zipPath, await zip.generateAsync({ type: 'nodebuffer' }))

  const r1 = await preparePublishFromZip({ zipPath, username: 'alice', existingSkillIds: [] })
  console.log('step1', {
    ok: r1.ok,
    needsEntry: r1.needsEntrySelection,
    candidates: r1.entryCandidates,
    error: r1.error,
  })
  if (!r1.needsEntrySelection) throw new Error('expected entry selection')

  const r2 = await finalizePublishSession({
    sessionDir: r1.sessionDir,
    extractDir: r1.extractDir,
    kind: 'ordinary',
    entry: 'main.py',
    entryCandidates: r1.entryCandidates,
    username: 'alice',
    author: 'Alice',
    name: 'Weather Helper',
    description: 'demo skill',
    version: '1.0.0',
    existingSkillIds: [],
  })
  console.log('step2', {
    ok: r2.ok,
    ready: r2.ready,
    skill_id: r2.manifest && r2.manifest.skill_id,
    entry: r2.entry,
    zipName: r2.zipName,
    files: r2.files,
    error: r2.error,
  })
  if (!r2.ok || !r2.ready) process.exit(1)
  if (r2.manifest.skill_id !== 'com.alice.weather.helper') {
    console.error('unexpected skill_id', r2.manifest.skill_id)
    process.exit(1)
  }
  if (!r2.files.includes('main.py') || !r2.files.includes('manifest.json')) {
    console.error('missing files', r2.files)
    process.exit(1)
  }
  cleanupPublishSession(r2.sessionDir)
  fs.rmSync(tmp, { recursive: true, force: true })
  console.log('PASS ordinary')

  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'pub-std-'))
  const zip2 = path.join(tmp2, 'weather-skill.zip')
  const z2 = new JSZip()
  z2.file(
    'weather/manifest.json',
    JSON.stringify(
      {
        skill_id: 'com.dev.weather',
        name: 'Weather',
        version: '1.2.0',
        source: 'SkillHub',
        description: 'weather skill',
        author: 'dev',
      },
      null,
      2,
    ),
  )
  z2.file('weather/README.md', '# Weather\n')
  z2.file('weather/tools/run.py', 'print(1)\n')
  fs.writeFileSync(zip2, await z2.generateAsync({ type: 'nodebuffer' }))
  const r3 = await preparePublishFromZip({ zipPath: zip2, username: 'bob' })
  console.log('standard', {
    ok: r3.ok,
    ready: r3.ready,
    kind: r3.kind,
    skill_id: r3.manifest && r3.manifest.skill_id,
    zipName: r3.zipName,
    error: r3.error,
  })
  if (!r3.ok || !r3.ready) process.exit(1)
  cleanupPublishSession(r3.sessionDir)
  fs.rmSync(tmp2, { recursive: true, force: true })
  console.log('PASS standard')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
