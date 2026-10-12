import { FuseV1Options, FuseVersion } from "@electron/fuses"
import { MakerSquirrel } from "@electron-forge/maker-squirrel"
import { MakerZIP } from "@electron-forge/maker-zip"
import { FusesPlugin } from "@electron-forge/plugin-fuses"
import type { ForgeConfig } from "@electron-forge/shared-types"

// The build (`scripts/build.mjs`) bundles every dependency into `dist/`, so
// the packaged app is `package.json` plus `dist/` and nothing else. That is
// what lets Forge package from a pnpm workspace, whose symlinked
// `node_modules` it cannot prune.
const packagedPaths = /^\/(package\.json$|dist(\/|$))/

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: "CastKit",
    executableName: "CastKit",
    icon: "dist/icon",
    prune: false,
    ignore: (path) =>
      path !== "" && !packagedPaths.test(path),
  },
  makers: [
    new MakerSquirrel({
      name: "castkit",
      setupIcon: "dist/icon.ico",
    }),
    new MakerZIP({}, ["win32", "linux"]),
  ],
  plugins: [
    // Electron Fuses harden the packaged app: no running it as plain Node,
    // no NODE_OPTIONS or inspector flags, and the app loads only from its
    // integrity-checked ASAR.
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
}

export default config
