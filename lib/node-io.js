import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export function createNodeIo() {
  return {
    async readFile(file) {
      return fs.readFile(file, 'utf8')
    },
    async writeFile(file, content) {
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, content)
    },
    async copyFile(from, to) {
      await fs.copyFile(from, to)
    },
    async exists(file) {
      try {
        await fs.access(file)
        return true
      } catch {
        return false
      }
    },
    async listDir(dir) {
      try {
        return await fs.readdir(dir)
      } catch {
        return []
      }
    },
    async makeTempDir() {
      return fs.mkdtemp(path.join(os.tmpdir(), 'dsh-plugin-update-'))
    },
    async removeDir(dir) {
      await fs.rm(dir, { recursive: true, force: true })
    },
    async removeFile(file) {
      await fs.rm(file, { force: true })
    },
    spawn(command, args, { cwd }) {
      return new Promise((resolve) => {
        const child = spawn(command, args, { cwd, shell: false, env: process.env })
        let stdout = ''
        let stderr = ''
        child.stdout?.on('data', (chunk) => { stdout = (stdout + chunk).slice(-8000) })
        child.stderr?.on('data', (chunk) => { stderr = (stderr + chunk).slice(-8000) })
        child.on('error', (error) => resolve({ code: 127, stdout, stderr: `${stderr}${error.message}` }))
        child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }))
      })
    },
  }
}
