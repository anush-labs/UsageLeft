const { cpSync, existsSync, mkdirSync, readdirSync, renameSync } = require("fs")
const { spawnSync } = require("child_process")
const { tmpdir } = require("os")
const { join } = require("path")

const root = __dirname
const exclude = new Set(["mock"])
const srcDir = join(root, "plugins")
const dstDir = join(root, "src-tauri", "resources", "bundled_plugins")

function trashPath(path) {
  if (!existsSync(path)) return
  const commands = [
    ["gio", ["trash", path]],
    ["trash", [path]],
  ]
  for (const [cmd, args] of commands) {
    const result = spawnSync(cmd, args, { stdio: "inherit" })
    if (!result.error && result.status === 0) return
  }
  const moved = join(tmpdir(), `usageleft-bundled_plugins-${process.pid}-${Date.now()}`)
  renameSync(path, moved)
  console.warn(`Moved existing bundled plugins to ${moved}`)
}

trashPath(dstDir)
mkdirSync(dstDir, { recursive: true })

const plugins = readdirSync(srcDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !exclude.has(d.name))
  .map((d) => d.name)

for (const id of plugins) {
  cpSync(join(srcDir, id), join(dstDir, id), { recursive: true })
}

console.log(`Bundled ${plugins.length} plugins: ${plugins.join(", ")}`)
