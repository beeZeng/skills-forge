import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const vite = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', '5173', '--strictPort'], {
  cwd: root,
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

const wait = spawn('npx', ['wait-on', 'tcp:127.0.0.1:5173'], {
  cwd: root,
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

wait.on('exit', (code) => {
  if (code !== 0) {
    vite.kill()
    process.exit(code ?? 1)
  }
  const electron = spawn('npx', ['electron', '.'], {
    cwd: root,
    env: { ...env, VITE_DEV_SERVER_URL: 'http://127.0.0.1:5173' },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  electron.on('exit', (electronCode) => {
    vite.kill()
    process.exit(electronCode ?? 0)
  })
})

process.on('SIGINT', () => {
  vite.kill()
  process.exit(0)
})
