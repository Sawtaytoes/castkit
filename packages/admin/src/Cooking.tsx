import {
  Button,
  Card,
  Field,
  Picker,
} from "@charcuterie/ui"
import {
  Copy,
  Link as LinkIcon,
  Monitor,
  Play,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import {
  CookingPage,
  type CookingSession,
} from "./CookingPage.tsx"
import {
  api,
  inputClass,
  mutate,
  type Platform,
} from "./platformApi.ts"

/** Management owns source setup and the explicit choice of a recipe and target. */
export const Cooking = ({
  platform,
}: {
  platform: Platform
}) => {
  const sources = platform.sources.filter(
    (source) =>
      source.adapter === "mealie" && source.isEnabled,
  )
  const [sourceId, setSourceId] = useState(
    sources[0]?.id ?? "",
  )
  const [phoneId] = useState(() => {
    const saved =
      sessionStorage.getItem("castkit-recipe-phone") ||
      `phone-only/${crypto.randomUUID()}`
    sessionStorage.setItem("castkit-recipe-phone", saved)
    return saved
  })
  const [deviceId, setDeviceId] = useState(phoneId)
  const [devices, setDevices] = useState<
    {
      id: string
      label: string
      width: number
      height: number
      renderer?: "browser"
    }[]
  >([])
  const [recipes, setRecipes] = useState<
    { slug: string; name: string }[]
  >([])
  const [link, setLink] = useState("")
  const [sessions, setSessions] = useState<
    CookingSession[]
  >([])
  const [error, setError] = useState("")
  const [isBusy, setIsBusy] = useState(false)
  const refresh = useCallback(
    async () =>
      setSessions(
        (
          await api<{ sessions: CookingSession[] }>(
            "/api/manage/cooking",
          )
        ).sessions,
      ),
    [],
  )
  useEffect(() => {
    void api<{ devices: typeof devices }>(
      "/api/manage/devices",
    )
      .then((value) =>
        setDevices(
          value.devices.filter(
            (item) =>
              item.renderer !== "browser" &&
              item.width >= 320 &&
              item.height >= 240,
          ),
        ),
      )
      .catch((error) => setError(String(error.message)))
  }, [])
  useEffect(() => {
    if (!sourceId) return
    setRecipes([])
    void api<{ items: typeof recipes }>(
      `/api/manage/cooking/sources/${encodeURIComponent(sourceId)}/recipes`,
    )
      .then((value) => setRecipes(value.items))
      .catch((error) => setError(String(error.message)))
  }, [sourceId])
  useEffect(() => {
    void refresh().catch((error) =>
      setError(String(error.message)),
    )
    const timer = setInterval(
      () => void refresh().catch(() => {}),
      3000,
    )
    return () => clearInterval(timer)
  }, [refresh])
  const start = async () => {
    setIsBusy(true)
    setError("")
    try {
      await mutate("/api/manage/cooking", {
        sourceId,
        deviceId,
        link,
      })
      await refresh()
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not start cooking.",
      )
    } finally {
      setIsBusy(false)
    }
  }
  const command = async (
    session: CookingSession,
    action: string,
  ) => {
    setIsBusy(true)
    try {
      await mutate(`/api/cooking/${session.id}/command`, {
        action,
        revision: session.revision,
      })
      await refresh()
      setError("")
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not update the recipe.",
      )
    } finally {
      setIsBusy(false)
    }
  }
  return (
    <div className="grid min-w-0 gap-6">
      <p className="text-content-secondary">
        Send a recipe to a display. Keep your place until
        you are done.
      </p>
      {error ? <p role="alert">{error}</p> : null}
      {!sources.length ? (
        <Card>
          <p>
            Add a Mealie source with its service URL and API
            token in{" "}
            <a className="underline" href="/manage/sources">
              Sources
            </a>{" "}
            to begin.
          </p>
        </Card>
      ) : (
        <Card>
          <div className="grid max-w-3xl gap-4">
            <Picker
              label="Mealie source"
              value={sourceId}
              onChange={setSourceId}
              options={sources.map((source) => ({
                value: source.id,
                label: source.name,
              }))}
            />
            <Picker
              label="Display"
              value={deviceId}
              onChange={setDeviceId}
              options={[
                {
                  value: phoneId,
                  label:
                    "Phone only, no display assignment",
                },
                ...devices.map((device) => ({
                  value: device.id,
                  label: device.label,
                })),
              ]}
            />
            <Picker
              label="Saved recipe"
              value={link}
              onChange={setLink}
              options={recipes.map((recipe) => ({
                value: recipe.slug,
                label: recipe.name,
              }))}
            />
            <Field
              label="Or paste a recipe link"
              description="A saved Mealie recipe or a recipe website. External recipes are imported into Mealie."
            >
              <input
                className={inputClass}
                type="text"
                value={link}
                onChange={(event) =>
                  setLink(event.target.value)
                }
                placeholder="https://…"
              />
            </Field>
            <Button
              isDisabled={
                !sourceId || !deviceId || !link || isBusy
              }
              onClick={() => void start()}
            >
              <Play />
              Show recipe
            </Button>
          </div>
        </Card>
      )}
      {sessions.map((session) => (
        <section key={session.id} className="grid gap-3">
          <h2 className="flex items-center gap-2 font-semibold">
            <Monitor />
            {devices.find(
              (device) => device.id === session.deviceId,
            )?.label ??
              (session.deviceId.startsWith("phone-only/")
                ? "Phone only"
                : session.deviceId)}
          </h2>
          <details>
            <summary className="cursor-pointer font-semibold">
              800 × 480 display preview
            </summary>
            <iframe
              title="Recipe display preview"
              src={`/view/${session.targetId}`}
              style={{
                width: "100%",
                maxWidth: 800,
                aspectRatio: "800 / 480",
                border: 0,
              }}
            />
          </details>
          <CookingPage
            session={session}
            send={(action) => void command(session, action)}
            isBusy={isBusy}
          />
          <div className="flex flex-wrap gap-3">
            <a
              href={session.controlPath}
              className="inline-flex items-center gap-2 underline"
            >
              <LinkIcon size={18} />
              Open phone controls
            </a>
            <Button
              appearance="outline"
              onClick={() =>
                void navigator.clipboard
                  .writeText(
                    new URL(
                      session.controlPath,
                      window.location.origin,
                    ).href,
                  )
                  .catch(() =>
                    setError(
                      "Could not copy the link. Try copying again in a supported browser.",
                    ),
                  )
              }
            >
              <Copy />
              Copy cooking link
            </Button>
          </div>
        </section>
      ))}
    </div>
  )
}
