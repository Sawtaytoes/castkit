import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import sharp from "sharp"
import { build as buildPage } from "vite"

// Bundle the desktop app into `dist/`. Every dependency is bundled, so the
// packaged app ships no `node_modules` at all — which is also what lets
// Electron Forge package it straight out of a pnpm workspace. The settings
// page is React with Charcuterie, built by Vite into `dist/settings/`.

const packageDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
)
const distDirectory = join(packageDirectory, "dist")
const sourceDirectory = join(packageDirectory, "src")

rmSync(distDirectory, { recursive: true, force: true })
mkdirSync(join(distDirectory, "settings"), {
  recursive: true,
})

const shared = {
  bundle: true,
  sourcemap: true,
  target: "es2024",
  logLevel: "warning",
}

// The main process and both preloads are CommonJS: a sandboxed preload must be
// one self-contained script, and `require("electron")` is what it may call.
await Promise.all([
  build({
    ...shared,
    entryPoints: [join(sourceDirectory, "main.ts")],
    outfile: join(distDirectory, "main.cjs"),
    platform: "node",
    format: "cjs",
    external: ["electron"],
  }),
  build({
    ...shared,
    entryPoints: [join(sourceDirectory, "viewPreload.ts")],
    outfile: join(distDirectory, "viewPreload.cjs"),
    platform: "node",
    format: "cjs",
    external: ["electron"],
  }),
  build({
    ...shared,
    entryPoints: [
      join(
        sourceDirectory,
        "settings",
        "settingsPreload.ts",
      ),
    ],
    outfile: join(distDirectory, "settingsPreload.cjs"),
    platform: "node",
    format: "cjs",
    external: ["electron"],
  }),
  buildPage({
    configFile: join(
      packageDirectory,
      "vite.settings.config.ts",
    ),
    logLevel: "warn",
  }),
])

// The app icon is CastKit's canonical mark, rasterized — never redrawn. The
// admin page's favicon is the byte-identical copy of that mark.
const mark = readFileSync(
  join(
    packageDirectory,
    "..",
    "admin",
    "public",
    "favicon.svg",
  ),
)
const renderMark = (size) =>
  sharp(mark, { density: Math.ceil((72 * size) / 24) })
    .resize(size, size)
    .png()
    .toBuffer()

const iconSizes = [16, 24, 32, 48, 64, 128, 256]
const pngBySize = new Map(
  await Promise.all(
    iconSizes.map(async (size) => [
      size,
      await renderMark(size),
    ]),
  ),
)
writeFileSync(
  join(distDirectory, "icon.png"),
  pngBySize.get(256),
)
// The tray icon is drawn at 16 px; Electron takes `tray@2x.png` beside it on
// a high-density display, which is every Mac and most laptops.
writeFileSync(
  join(distDirectory, "tray.png"),
  pngBySize.get(16),
)
writeFileSync(
  join(distDirectory, "tray@2x.png"),
  pngBySize.get(32),
)

// A Windows `.ico` may hold PNG images directly: a 6-byte header, one 16-byte
// directory entry per image, then the images. A size of 256 is written as 0.
const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(iconSizes.length, 4)
const directoryLength = 6 + 16 * iconSizes.length
const entries = iconSizes.map((size, index) => {
  const offset =
    directoryLength +
    iconSizes
      .slice(0, index)
      .reduce(
        (total, earlier) =>
          total + pngBySize.get(earlier).length,
        0,
      )
  const entry = Buffer.alloc(16)
  entry.writeUInt8(size >= 256 ? 0 : size, 0)
  entry.writeUInt8(size >= 256 ? 0 : size, 1)
  entry.writeUInt8(0, 2)
  entry.writeUInt8(0, 3)
  entry.writeUInt16LE(1, 4)
  entry.writeUInt16LE(32, 6)
  entry.writeUInt32LE(pngBySize.get(size).length, 8)
  entry.writeUInt32LE(offset, 12)
  return entry
})
writeFileSync(
  join(distDirectory, "icon.ico"),
  Buffer.concat([
    header,
    ...entries,
    ...iconSizes.map((size) => pngBySize.get(size)),
  ]),
)

// A macOS `.icns` holds PNG images directly too: the 4-byte `icns` magic and
// the file's length, then per image a 4-byte type code, the entry's length
// (header included), and the PNG. Every length is big-endian.
const icnsTypes = [
  ["icp4", 16],
  ["icp5", 32],
  ["icp6", 64],
  ["ic07", 128],
  ["ic08", 256],
  ["ic09", 512],
  ["ic10", 1024],
  ["ic11", 32],
  ["ic12", 64],
  ["ic13", 256],
  ["ic14", 512],
]
const icnsPngBySize = new Map(
  await Promise.all(
    [...new Set(icnsTypes.map(([, size]) => size))].map(
      async (size) => [size, await renderMark(size)],
    ),
  ),
)
const icnsEntries = icnsTypes.map(([type, size]) => {
  const png = icnsPngBySize.get(size)
  const entryHeader = Buffer.alloc(8)
  entryHeader.write(type, 0, "ascii")
  entryHeader.writeUInt32BE(8 + png.length, 4)
  return Buffer.concat([entryHeader, png])
})
const icnsHeader = Buffer.alloc(8)
icnsHeader.write("icns", 0, "ascii")
icnsHeader.writeUInt32BE(
  8 +
    icnsEntries.reduce(
      (total, entry) => total + entry.length,
      0,
    ),
  4,
)
writeFileSync(
  join(distDirectory, "icon.icns"),
  Buffer.concat([icnsHeader, ...icnsEntries]),
)
