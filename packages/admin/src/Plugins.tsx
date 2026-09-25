import { Button, Card } from "@charcuterie/ui"
import { useState } from "react"
import { mutate, type Platform } from "./platformApi.ts"
export const Plugins = ({
  platform,
  onRefresh,
}: {
  platform: Platform
  onRefresh: () => Promise<void>
}) => {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [isError, setIsError] = useState(false)
  const setPluginEnabled = async (
    id: string,
    isEnabled: boolean,
  ) => {
    setBusyId(id)
    setMessage("")
    setIsError(false)
    try {
      await mutate(
        `/api/manage/platform/plugins/${encodeURIComponent(id)}`,
        { isEnabled },
        "PUT",
      )
      await onRefresh()
      setMessage(
        isEnabled
          ? "Plugin enabled. Its components are available in the library."
          : "Plugin disabled.",
      )
    } catch (error) {
      setIsError(true)
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not update the plugin.",
      )
    } finally {
      setBusyId(null)
    }
  }
  return (
    <div className="grid gap-4">
      <p className="text-content-secondary">
        Installed plugins provide source adapters, view
        components, and data contracts. Configure their
        connections in Sources and use their components in
        Views.
      </p>
      {message ? (
        <p
          role={isError ? "alert" : "status"}
          className={
            isError
              ? "text-intent-danger-content"
              : "text-content-secondary"
          }
        >
          {message}
        </p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {platform.plugins.map((plugin) => (
          <Card key={plugin.id} heading={plugin.name}>
            <p className="text-content-secondary">
              Version {plugin.version}
            </p>
            <p className="mt-2 text-sm">
              {plugin.isEnabled === false
                ? "Disabled"
                : "Enabled"}
            </p>
            <div className="mt-4">
              <Button
                appearance="outline"
                isLoading={busyId === plugin.id}
                isDisabled={
                  busyId !== null && busyId !== plugin.id
                }
                onClick={() =>
                  void setPluginEnabled(
                    plugin.id,
                    plugin.isEnabled === false,
                  )
                }
              >
                {plugin.isEnabled === false
                  ? `Enable ${plugin.name}`
                  : `Disable ${plugin.name}`}
              </Button>
            </div>
          </Card>
        ))}
      </div>
      <Card heading="Add a plugin">
        <div className="grid gap-3">
          <p>
            Install a trusted npm package at a pinned
            version in your CastKit deployment. Register its
            server module and renderer entries, then rebuild
            and restart CastKit. Installed components appear
            here and in the view editor.
          </p>
          <p>
            Local packages use the same extension interface.
            The CastKit SDK supplies data subscriptions and
            actions without requiring a specific UI library.
          </p>
          <a
            className="underline"
            href="https://github.com/Sawtaytoes/castkit/blob/master/docs/plugins.md"
            target="_blank"
            rel="noreferrer"
          >
            Plugin installation and authoring guide
          </a>
        </div>
      </Card>
      <Card heading="Available components">
        <div className="grid gap-4 sm:grid-cols-2">
          {platform.viewSpecs.map((spec) => (
            <div key={spec.id}>
              <h2 className="font-semibold">{spec.name}</h2>
              <p className="text-content-secondary text-sm">
                {spec.description}
              </p>
              <p className="mt-1 text-sm">
                {spec.renderers.join(" · ")}
              </p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
