import type { RecipeDisplay } from "@castkit/sdk/recipe"
import {
  Button,
  Card,
  Field,
  Picker,
} from "@charcuterie/ui"
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ClipboardList,
  Copy,
  ExternalLink,
  Link as LinkIcon,
  Monitor,
  Play,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import {
  api,
  inputClass,
  mutate,
  type Platform,
} from "./platformApi.ts"

type Session = {
  id: string
  revision: number
  sourceId: string
  deviceId: string
  display: RecipeDisplay
  targetId: string
  controlPath: string
}
const CookingPage = ({
  session,
  send,
  isBusy,
}: {
  session: Session
  send: (action: string) => void
  isBusy: boolean
}) => {
  const data = session.display
  return (
    <div className="grid min-w-0 gap-4">
      <Card>
        <div className="grid gap-3">
          <p className="text-sm text-content-secondary">
            COOKING · Page {data.pageIndex + 1} of{" "}
            {data.pageCount}
          </p>
          <h2 className="font-semibold text-2xl">
            {data.recipe.name}
          </h2>
          <p className="text-content-secondary">
            {data.recipe.yieldText}
          </p>
          <h3 className="font-semibold text-lg">
            {data.page.heading}
          </h3>
          <p className="whitespace-pre-wrap break-words font-mono text-lg leading-relaxed">
            {data.page.lines.join("\n")}
          </p>
          <a
            className="inline-flex items-center gap-2 underline"
            href={data.recipe.url}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={18} />
            Open in Mealie
          </a>
        </div>
      </Card>
      <div className="flex flex-wrap gap-2">
        <Button
          appearance="outline"
          isDisabled={isBusy || data.pageIndex === 0}
          onClick={() => send("previous")}
        >
          <ArrowLeft />
          Previous
        </Button>
        <Button
          isDisabled={
            isBusy || data.pageIndex + 1 === data.pageCount
          }
          onClick={() => send("next")}
        >
          <ArrowRight />
          Next
        </Button>
        <Button
          appearance="outline"
          isDisabled={isBusy}
          onClick={() => send("ingredients")}
        >
          <ClipboardList />
          Ingredients
        </Button>
        <Button
          appearance="outline"
          isDisabled={isBusy}
          onClick={() => send("instructions")}
        >
          <BookOpen />
          Instructions
        </Button>
        <Button
          appearance="outline"
          isDisabled={isBusy}
          onClick={() => send("done")}
        >
          <Check />
          Done cooking
        </Button>
      </div>
      <p className="text-sm text-content-secondary">
        The display stays on this page until you change it.
        ePaper needs power to receive another page; an
        unplugged panel retains its last image. Page changes
        can take a full screen refresh.
      </p>
    </div>
  )
}

/** A revocable cooking link can control one session without management access. */
export const CookingController = () => {
  const id =
    window.location.pathname.split("/").at(-1) ?? ""
  const [key] = useState(() => {
    const value =
      window.location.hash.slice(1) ||
      sessionStorage.getItem(`cooking:${id}`) ||
      ""
    if (value)
      sessionStorage.setItem(`cooking:${id}`, value)
    window.history.replaceState(
      null,
      "",
      window.location.pathname,
    )
    return value
  })
  const [session, setSession] = useState<Session | null>(
    null,
  )
  const [error, setError] = useState("")
  const [isDone, setIsDone] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const headers = { "x-castkit-cooking-key": key }
  useEffect(() => {
    if (isDone) return
    let isMounted = true
    const refresh = () =>
      void api<Session>(`/api/cooking/${id}/state`, {
        headers: { "x-castkit-cooking-key": key },
      })
        .then((value) => {
          if (isMounted) {
            setSession((previous) =>
              previous && previous.revision > value.revision
                ? previous
                : value,
            )
            setError("")
          }
        })
        .catch((error) => {
          if (isMounted) setError(String(error.message))
        })
    refresh()
    const timer = setInterval(refresh, 3000)
    return () => {
      isMounted = false
      clearInterval(timer)
    }
  }, [id, key, isDone])
  const send = async (action: string) => {
    setIsBusy(true)
    try {
      const result = await api<{ session: Session | null }>(
        `/api/cooking/${id}/command`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            action,
            revision: session?.revision,
          }),
        },
      )
      setSession(result.session)
      setIsDone(!result.session)
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
    <main className="mx-auto grid max-w-3xl gap-5 p-4 sm:p-6">
      <h1 className="flex items-center gap-2 font-semibold text-xl">
        <BookOpen />
        CastKit Recipes
      </h1>
      {isDone ? (
        <Card>
          Cooking finished. The display returns to its
          normal selection when connected.
        </Card>
      ) : (
        <>
          {error ? <p role="alert">{error}</p> : null}
          {session ? (
            <CookingPage
              session={session}
              send={(action) => void send(action)}
              isBusy={isBusy}
            />
          ) : !error ? (
            <p role="status">Loading recipe…</p>
          ) : null}
        </>
      )}
    </main>
  )
}

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
    }[]
  >([])
  const [recipes, setRecipes] = useState<
    { slug: string; name: string }[]
  >([])
  const [link, setLink] = useState("")
  const [sessions, setSessions] = useState<Session[]>([])
  const [error, setError] = useState("")
  const [isBusy, setIsBusy] = useState(false)
  const refresh = useCallback(
    async () =>
      setSessions(
        (
          await api<{ sessions: Session[] }>(
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
              item.width >= 320 && item.height >= 240,
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
    session: Session,
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
