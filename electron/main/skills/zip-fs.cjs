/**
 * Cross-platform zip helpers using JSZip (no shell zip / Compress-Archive).
 */

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const JSZip = require('jszip')

function listFilesRecursive(dir, prefix = '', acc = []) {
  let entries = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return acc
  }
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) listFilesRecursive(full, rel.replace(/\\/g, '/'), acc)
    else if (entry.isFile()) acc.push(rel.replace(/\\/g, '/'))
  }
  return acc
}

function hashFile(filePath) {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('hex')
}

/**
 * Zip a directory's contents into outZipPath.
 * Entries are relative paths; optional rootName wraps them in a top-level folder.
 * @param {string} dir
 * @param {string} outZipPath
 * @param {{ exclude?: (rel: string) => boolean, rootName?: string }} [options]
 */
async function zipDirectory(dir, outZipPath, options = {}) {
  if (!dir || !fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new Error('打包目录无效')
  }
  const exclude = typeof options.exclude === 'function' ? options.exclude : () => false
  const rootName = String(options.rootName || '')
    .replace(/[<>:"|?*\\/]/g, '_')
    .replace(/^\.+/, '')
    .trim()
  const files = listFilesRecursive(dir).filter((rel) => !exclude(rel))
  if (!files.length) throw new Error('打包目录为空')

  const zip = new JSZip()
  for (const rel of files) {
    const full = path.join(dir, ...rel.split('/'))
    const zipRel = rootName ? `${rootName}/${rel}` : rel
    zip.file(zipRel, fs.readFileSync(full))
  }

  const buf = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  fs.mkdirSync(path.dirname(outZipPath), { recursive: true })
  if (fs.existsSync(outZipPath)) fs.rmSync(outZipPath, { force: true })
  fs.writeFileSync(outZipPath, buf)
  return { ok: true, zipPath: outZipPath, bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') }
}

/**
 * Unzip buffer or file into destDir (created if missing).
 */
async function unzipToDirectory(zipInput, destDir) {
  let buf
  if (Buffer.isBuffer(zipInput)) buf = zipInput
  else if (typeof zipInput === 'string') {
    if (!fs.existsSync(zipInput)) throw new Error('zip 文件不存在')
    buf = fs.readFileSync(zipInput)
  } else {
    throw new Error('无效的 zip 输入')
  }

  const zip = await JSZip.loadAsync(buf)
  fs.mkdirSync(destDir, { recursive: true })

  const entries = Object.keys(zip.files).sort()
  for (const name of entries) {
    const entry = zip.files[name]
    const rel = String(name).replace(/\\/g, '/').replace(/^\/+/, '')
    if (!rel || rel.includes('..')) continue
    const dest = path.join(destDir, ...rel.split('/'))
    if (entry.dir || rel.endsWith('/')) {
      fs.mkdirSync(dest, { recursive: true })
      continue
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    const content = await entry.async('nodebuffer')
    fs.writeFileSync(dest, content)
  }
  return { ok: true, destDir, entryCount: entries.length }
}

/**
 * List zip entry paths as a sorted tree of relative paths (files + dirs).
 * Does not return binary contents.
 */
async function listZipTree(zipInput) {
  let buf
  if (Buffer.isBuffer(zipInput)) buf = zipInput
  else if (typeof zipInput === 'string') {
    if (!fs.existsSync(zipInput)) throw new Error('zip 文件不存在')
    buf = fs.readFileSync(zipInput)
  } else {
    throw new Error('无效的 zip 输入')
  }

  const zip = await JSZip.loadAsync(buf)
  const paths = new Set()
  for (const name of Object.keys(zip.files)) {
    const rel = String(name).replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
    if (!rel || rel.includes('..')) continue
    paths.add(rel)
    const parts = rel.split('/')
    for (let i = 1; i < parts.length; i += 1) {
      paths.add(parts.slice(0, i).join('/'))
    }
  }
  return [...paths].sort((a, b) => a.localeCompare(b))
}

/** Build a nested tree from flat relative paths for UI. */
function pathsToTree(paths) {
  const root = { name: '', path: '', type: 'dir', children: [] }
  const byPath = new Map([['', root]])
  const sorted = [...new Set(paths.map((p) => String(p).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')).filter(Boolean))].sort()
  const hasChild = new Set()
  for (const rel of sorted) {
    const parts = rel.split('/')
    for (let i = 1; i < parts.length; i += 1) hasChild.add(parts.slice(0, i).join('/'))
  }
  for (const rel of sorted) {
    const parts = rel.split('/')
    let parentPath = ''
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i]
      const full = parentPath ? `${parentPath}/${part}` : part
      if (!byPath.has(full)) {
        const node = {
          name: part,
          path: full,
          type: hasChild.has(full) ? 'dir' : 'file',
          children: [],
        }
        byPath.get(parentPath).children.push(node)
        byPath.set(full, node)
      }
      parentPath = full
    }
  }
  return root.children
}

function listDirectoryTree(dir) {
  const paths = new Set()

  function walk(current, prefix = '') {
    let entries = []
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      const normalized = rel.replace(/\\/g, '/')
      paths.add(normalized)
      if (entry.isDirectory()) walk(path.join(current, entry.name), normalized)
    }
  }

  walk(dir)
  return pathsToTree([...paths])
}

module.exports = {
  zipDirectory,
  unzipToDirectory,
  listZipTree,
  pathsToTree,
  listDirectoryTree,
  listFilesRecursive,
  hashFile,
}
