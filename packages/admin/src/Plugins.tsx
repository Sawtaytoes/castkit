import { Button, Card } from "@charcuterie/ui"
import { useState } from "react"
import { PluginInstaller } from "./PluginInstaller.tsx"
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
  const removePlugin = async (id: string) => {
    setBusyId(id)
    setMessage("")
    setIsError(false)
    try {
      await mutate(
        `/api/manage/platform/plugin-packages/${encodeURIComponent(id)}`,
        {},
        "DELETE",
      )
      await onRefresh()
      setMessage("Plugin removed.")
    } catch (error) {
      setIsError(true)
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not remove the plugin.",
      )
    } finally {
      setBusyId(null)
    }
  }
  return (
    <div className="grid min-w-0 gap-4">
      <PluginInstaller
        isAvailable={
          platform.isPluginInstallationAvailable !== false
        }
        onRefresh={onRefresh}
      />
      {platform.pluginErrors?.map((error) => (
        <p role="alert" key={error.name}>
          {error.name}: {error.error}
        </p>
      ))}
      {platform.pluginPackages
        ?.filter(
          (item) =>
            !platform.plugins.some(
              (plugin) => plugin.id === item.pluginId,
            ),
        )
        .map((item) => (
          <Card key={item.pluginId} heading={item.name}>
            <p>
              The package could not load. Install a
              compatible version or remove its saved
              configuration before removing it.
            </p>
            <Button
              appearance="outline"
              isDisabled={busyId !== null}
              onClick={() =>
                void removePlugin(item.pluginId)
              }
            >
              Remove {item.name}
            </Button>
          </Card>
        ))}
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
            <div className="mt-4 flex flex-wrap gap-3">
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
              {platform.pluginPackages?.some(
                (item) => item.pluginId === plugin.id,
              ) ? (
                <Button
                  appearance="outline"
                  isDisabled={busyId !== null}
                  onClick={() =>
                    void removePlugin(plugin.id)
                  }
                >
                  Remove {plugin.name}
                </Button>
              ) : null}
            </div>
          </Card>
        ))}
      </div>
      <a
        className="underline"
        href="https://github.com/Sawtaytoes/castkit/blob/master/docs/plugins.md"
        target="_blank"
        rel="noreferrer"
      >
        Plugin authoring guide
      </a>
    </div>
  )
}
