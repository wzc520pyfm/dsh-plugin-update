import path from 'node:path'

export function createMemoryIo(spawn) {
  const files = new Map()
  const api = {
    files,
    async readFile(file) {
      if (!files.has(file)) throw new Error(`ENOENT ${file}`)
      return files.get(file)
    },
    async writeFile(file, content) {
      files.set(file, content)
    },
    async copyFile(from, to) {
      if (!files.has(from)) throw new Error(`ENOENT ${from}`)
      files.set(to, files.get(from))
    },
    async exists(file) {
      return files.has(file)
    },
    async listDir(dir) {
      const prefix = dir.endsWith(path.sep) ? dir : `${dir}${path.sep}`
      const names = new Set()
      for (const key of files.keys()) {
        if (!key.startsWith(prefix)) continue
        const rest = key.slice(prefix.length)
        if (rest !== '') names.add(rest.split(path.sep)[0])
      }
      return [...names]
    },
    async makeTempDir() {
      return `/tmp/stage-${files.size}-${Math.random().toString(16).slice(2)}`
    },
    async removeDir(dir) {
      const prefix = dir.endsWith(path.sep) ? dir : `${dir}${path.sep}`
      for (const key of [...files.keys()]) {
        if (key === dir || key.startsWith(prefix)) files.delete(key)
      }
    },
    async removeFile(file) {
      files.delete(file)
    },
    spawn: (command, args, options) => spawn(command, args, options, api),
  }
  return api
}
