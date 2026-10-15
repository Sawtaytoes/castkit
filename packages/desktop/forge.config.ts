import { FuseV1Options, FuseVersion } from "@electron/fuses"
import { MakerDeb } from "@electron-forge/maker-deb"
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
    // No extension: Forge adds .ico on Windows, .icns on macOS, and .png on
    // Linux, and `scripts/build.mjs` writes all three.
    icon: "dist/icon",
    appBundleId: "io.github.sawtaytoes.castkit",
    appCategoryType: "public.app-category.utilities",
    prune: false,
    ignore: (path) =>
      path !== "" && !packagedPaths.test(path),
  },
  makers: [
    new MakerSquirrel({
      name: "castkit",
      // NuGet, which Squirrel builds its package with, requires an author.
      // package.json has none, so name the project rather than a person.
      authors: "CastKit contributors",
      setupIcon: "dist/icon.ico",
    }),
    // Linux: a .deb for Debian and Ubuntu. The maker sets Electron's
    // `chrome-sandbox` helper setuid root, which Ubuntu 24.04 needs because
    // it blocks the unprivileged namespaces the sandbox would otherwise use.
    new MakerDeb({
      options: {
        name: "castkit",
        productName: "CastKit",
        genericName: "Display viewer",
        bin: "CastKit",
        icon: "dist/icon.png",
        categories: ["Utility"],
        maintainer: "CastKit contributors",
        homepage: "https://github.com/Sawtaytoes/castkit",
      },
    }),
    // Every platform gets a .zip that runs without installing; it is the
    // only macOS package, because an unsigned .dmg adds nothing to it.
    new MakerZIP({}, ["win32", "linux", "darwin"]),
  ],
  plugins: [
    // Electron Fuses harden the packaged app: no running it as plain Node,
    // no NODE_OPTIONS or inspector flags, and the app loads only from its
    // integrity-checked ASAR.
    new FusesPlugin({
      version: FuseVersion.V1,
      // Flipping a fuse edits the Electron binary, which breaks its ad-hoc
      // signature, and Apple silicon refuses to start an unsigned binary.
      // Re-sign ad hoc after the edit. This needs `codesign`, so only on a Mac.
      resetAdHocDarwinSignature:
        process.platform === "darwin",
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
