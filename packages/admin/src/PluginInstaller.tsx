import type { PluginManifest } from "@castkit/sdk/plugin"
import {
  Button,
  Card,
  Field,
  FileDropZone,
} from "@charcuterie/ui"
import { useState } from "react"
import { api, inputClass, mutate } from "./platformApi.ts"

type Inspection = {
  inspectionId: string
  name: string
  version: string
  manifest: PluginManifest
  description?: string
  license?: string
}
/** Review a compatible package before activating its sources and views. */
export const PluginInstaller = ({
  isAvailable,
  onRefresh,
}: {
  isAvailable: boolean
  onRefresh: () => Promise<void>
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [name, setName] = useState("")
  const [version, setVersion] = useState("")
  const [inspection, setInspection] =
    useState<Inspection | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [message, setMessage] = useState("")
  const [isError, setIsError] = useState(false)
  const run = async (operation: () => Promise<void>) => {
    setIsBusy(true)
    setMessage("")
    setIsError(false)
    try {
      await operation()
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not install the plugin.",
      )
      setIsError(true)
    } finally {
      setIsBusy(false)
    }
  }
  const inspectPackage = () =>
    run(async () => {
      setInspection(null)
      setInspection(
        await mutate<Inspection>(
          "/api/manage/platform/plugin-packages/inspect",
          {
            name: name.trim(),
            ...(version.trim()
              ? { version: version.trim() }
              : {}),
          },
        ),
      )
    })
  const inspectFile = (file: File) =>
    run(async () => {
      setInspection(null)
      if (file.size > 20 * 1024 * 1024)
        throw new Error(
          "Choose a package smaller than 20 MB.",
        )
      setInspection(
        await api<Inspection>(
          "/api/manage/platform/plugin-packages/inspect-file",
          {
            method: "POST",
            headers: { "Content-Type": "application/gzip" },
            body: file,
          },
        ),
      )
    })
  const install = () =>
    run(async () => {
      if (!inspection) return
      await mutate(
        "/api/manage/platform/plugin-packages/install",
        { inspectionId: inspection.inspectionId },
      )
      await onRefresh()
      setMessage(`${inspection.manifest.name} installed.`)
      setInspection(null)
    })
  return (
    <div className="grid min-w-0 gap-4">
      <div>
        <Button
          onClick={() => setIsOpen(!isOpen)}
          isDisabled={!isAvailable || isBusy}
        >
          {isOpen ? "Close installer" : "Add plugin"}
        </Button>
      </div>
      {!isAvailable ? (
        <p>
          Plugin installation requires persistent CastKit
          storage.
        </p>
      ) : null}
      {message ? (
        <p role={isError ? "alert" : "status"}>{message}</p>
      ) : null}
      {isOpen ? (
        <Card heading="Add plugin">
          <div className="grid min-w-0 gap-5">
            {inspection ? (
              <>
                <div>
                  <h2 className="text-lg font-semibold">
                    {inspection.manifest.name}
                  </h2>
                  <p className="break-words text-content-secondary">
                    {inspection.name} · {inspection.version}
                  </p>
                </div>
                {inspection.description ? (
                  <p>{inspection.description}</p>
                ) : null}
                {inspection.manifest.viewSpecs.length ? (
                  <p>
                    <strong>Views: </strong>
                    {inspection.manifest.viewSpecs
                      .map((spec) => spec.name)
                      .join(", ")}
                  </p>
                ) : null}
                {inspection.manifest.adapters.length ? (
                  <p>
                    <strong>Sources: </strong>
                    {inspection.manifest.adapters
                      .map((adapter) => adapter.name)
                      .join(", ")}
                  </p>
                ) : null}
                <p className="text-content-secondary">
                  Plugins run code in CastKit. Install
                  packages you trust.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button
                    isLoading={isBusy}
                    onClick={() => void install()}
                  >
                    Install plugin
                  </Button>
                  <Button
                    appearance="outline"
                    isDisabled={isBusy}
                    onClick={() => setInspection(null)}
                  >
                    Choose another package
                  </Button>
                </div>
              </>
            ) : (
              <>
                <form
                  className="grid min-w-0 gap-4"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void inspectPackage()
                  }}
                >
                  <Field label="npm package" isRequired>
                    <input
                      className={inputClass}
                      required
                      value={name}
                      disabled={isBusy}
                      onChange={(event) =>
                        setName(event.target.value)
                      }
                      placeholder="@example/castkit-weather"
                    />
                  </Field>
                  <Field
                    label="Version"
                    description="Leave empty to review the latest version."
                  >
                    <input
                      className={inputClass}
                      value={version}
                      disabled={isBusy}
                      onChange={(event) =>
                        setVersion(event.target.value)
                      }
                      placeholder="Latest"
                    />
                  </Field>
                  <div>
                    <Button
                      type="submit"
                      isLoading={isBusy}
                    >
                      Review package
                    </Button>
                  </div>
                </form>
                <FileDropZone
                  label="Upload a plugin package"
                  description="Choose a CastKit .tgz package, up to 20 MB."
                  accept=".tgz,.tar.gz,application/gzip"
                  isDisabled={isBusy}
                  onDropFiles={(files) => {
                    const file = files[0]
                    if (file) void inspectFile(file)
                  }}
                />
              </>
            )}
          </div>
        </Card>
      ) : null}
    </div>
  )
}
