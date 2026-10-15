import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"

// Exercise Electron's real Windows registry serialization, not a mocked API.
// A unique Run value and temporary launcher files keep the runner's own login
// settings untouched. No application window or actual sign-out is needed.
assert.equal(process.platform, "win32")
const packageDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
)
const temporaryDirectory = mkdtempSync(
  join(tmpdir(), "castkit login test "),
)
const entryPath = join(temporaryDirectory, "main.cjs")
const fixtureSource = String.raw`
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { app } from "electron"
import { migrateLaunchAtLogin, readLaunchAtLogin, writeLaunchAtLogin } from "./src/launchAtLogin.ts"

const directory = process.argv[2]
const executable = join(directory, "app-1.2.3", "CastKit.exe")
const launcher = join(directory, "CastKit.exe")
const updater = join(directory, "Update.exe")
mkdirSync(join(directory, "app-1.2.3"), { recursive: true })
;[executable, launcher, updater].forEach(path => writeFileSync(path, ""))
Object.defineProperty(process, "execPath", { value: executable })
const entryName = "CastKit.LoginTest." + process.pid
const nativeSet = app.setLoginItemSettings.bind(app)
app.setLoginItemSettings = settings => nativeSet({ ...settings, name: entryName })
const target = { path: launcher, args: [] }
const legacyTarget = { path: updater, args: ["--processStart", '"CastKit.exe"'] }
const registryCommand = () => execFileSync("reg.exe", ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "/v", entryName], { encoding: "utf8" })

app.disableHardwareAcceleration()
app.whenReady().then(() => {
  try {
    writeLaunchAtLogin(true)
    assert.equal(readLaunchAtLogin(), true)
    assert.ok(registryCommand().includes('"' + launcher + '"'))
    assert.ok(!registryCommand().includes("--processStart"))
    nativeSet({ ...target, name: entryName, openAtLogin: true, enabled: false })
    assert.equal(readLaunchAtLogin(), false)
    writeLaunchAtLogin(true)
    assert.equal(readLaunchAtLogin(), true)

    ;[true, false].forEach(isEnabled => {
      nativeSet({ ...legacyTarget, name: entryName, openAtLogin: true, enabled: isEnabled })
      migrateLaunchAtLogin()
      assert.equal(readLaunchAtLogin(), isEnabled)
      assert.ok(registryCommand().includes('"' + launcher + '"'))
      assert.ok(!registryCommand().includes("--processStart"))
    })
    writeLaunchAtLogin(false)
    assert.equal(readLaunchAtLogin(), false)
    migrateLaunchAtLogin()
    assert.equal(readLaunchAtLogin(), false)
    console.log("Windows login registration: launcher, approval, migration and removal passed")
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  } finally {
    nativeSet({ ...target, name: entryName, openAtLogin: false })
    app.exit(process.exitCode || 0)
  }
})
`

try {
  await build({
    stdin: {
      contents: fixtureSource,
      resolveDir: packageDirectory,
      loader: "ts",
    },
    outfile: entryPath,
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["electron"],
  })
  const electronPath = createRequire(import.meta.url)(
    "electron",
  )
  const result = spawnSync(
    electronPath,
    [entryPath, temporaryDirectory],
    {
      encoding: "utf8",
      timeout: 60_000,
      env: Object.fromEntries(
        Object.entries(process.env).filter(
          ([name]) => name !== "ELECTRON_RUN_AS_NODE",
        ),
      ),
    },
  )
  process.stdout.write(result.stdout ?? "")
  process.stderr.write(result.stderr ?? "")
  assert.ifError(result.error)
  assert.equal(
    result.status,
    0,
    "Electron's native Windows login check failed",
  )
} finally {
  rmSync(temporaryDirectory, {
    recursive: true,
    force: true,
  })
}
