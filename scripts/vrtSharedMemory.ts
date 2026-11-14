import { join } from "node:path"
import { pathToFileURL } from "node:url"

/**
 * Where a VRT capture's Chromium keeps its shared memory.
 *
 * Playwright launches Chromium with `--disable-dev-shm-usage`, so Chromium
 * keeps its shared memory in deleted files under `/tmp`. On the VRT runner
 * `/tmp` is the container's overlay on a ZFS pool, so every rendered frame
 * was written to disk. The runner has a 2 GiB tmpfs at `/dev/shm`.
 *
 * In CI the shared `vrt` workflow puts its tools at `$VRT_TOOLS`. Their
 * `sharedMemory.js` drops the flag when `/dev/shm` has at least 512 MiB
 * free and says which one it chose; the pixels do not change. Outside CI,
 * or with tools that lack the module, Playwright's default stays.
 *
 * Returns the `ignoreDefaultArgs` for `chromium.launch`.
 */
interface SharedMemoryChoice {
  ignoreDefaultArgs: string[]
  message: string
}

interface SharedMemoryModule {
  chooseSharedMemory: (
    availableBytes: number | null,
  ) => SharedMemoryChoice
  readAvailableSharedMemory: () => Promise<number | null>
}

export const chooseVrtSharedMemory = async (): Promise<
  string[]
> => {
  const tools = process.env.VRT_TOOLS

  if (!tools) {
    return []
  }

  let sharedMemory: SharedMemoryModule

  try {
    sharedMemory = (await import(
      pathToFileURL(join(tools, "sharedMemory.js")).href
    )) as SharedMemoryModule
  } catch {
    console.log(
      "[vrt] Chromium shared memory: temp files, because the shared tools have no sharedMemory.js.",
    )

    return []
  }

  const choice = sharedMemory.chooseSharedMemory(
    await sharedMemory.readAvailableSharedMemory(),
  )

  console.log(choice.message)

  return choice.ignoreDefaultArgs
}
