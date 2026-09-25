import {
  Button,
  Card,
  EmptyState,
  Header,
  Main,
  Nav,
  Shell,
} from "@charcuterie/ui"
import { useCallback, useEffect, useState } from "react"
import { useLocation } from "react-router"
import { Access, type AccessSession } from "./Access.tsx"
import { CollectionPage } from "./CollectionPage.tsx"
import { Devices } from "./Devices.tsx"
import { Plugins } from "./Plugins.tsx"
import {
  ApiError,
  api,
  type Collection,
  type Platform,
} from "./platformApi.ts"

const destinations = [
  "All screens",
  "Sources",
  "Channels",
  "Views",
  "Screens",
  "Devices",
  "Plugins",
  "Access",
].map((label) => ({
  label,
  href: `/${label.toLowerCase().replaceAll(" ", "-")}`,
}))

export const App = () => {
  const location = useLocation()
  const routeSection =
    location.pathname.split("/")[1] || "views"
  const section = [
    "device",
    "photos",
    "clock",
    "image",
    "updates",
  ].includes(routeSection)
    ? "devices"
    : routeSection
  const [session, setSession] =
    useState<AccessSession | null>(null)
  const [platform, setPlatform] = useState<Platform | null>(
    null,
  )
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const refreshSession = useCallback(async () => {
    const next = await api<AccessSession>(
      "/api/access/session",
    )
    setSession(next)
    if (!next.isAuthenticated) setPlatform(null)
  }, [])
  const refreshPlatform = useCallback(async () => {
    try {
      const next = await api<Platform>(
        "/api/manage/platform",
      )
      setPlatform(next)
      setError("")
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 401
      ) {
        setSession({
          isAuthenticated: false,
          isSetupRequired: false,
        })
        setPlatform(null)
      }
      throw error
    }
  }, [])
  useEffect(() => {
    void refreshSession()
      .catch((error) =>
        setError(
          error instanceof Error
            ? error.message
            : "Could not load access settings.",
        ),
      )
      .finally(() => setIsLoading(false))
  }, [refreshSession])
  useEffect(() => {
    if (
      !session?.isAuthenticated ||
      session.isSetupRequired
    )
      return
    let isMounted = true
    const refresh = () =>
      void refreshPlatform().catch((error) => {
        if (isMounted)
          setError(
            error instanceof Error
              ? error.message
              : "Could not load CastKit.",
          )
      })
    refresh()
    const timer = setInterval(refresh, 5000)
    return () => {
      isMounted = false
      clearInterval(timer)
    }
  }, [session, refreshPlatform])
  const title =
    destinations.find((item) => item.href === `/${section}`)
      ?.label ?? "Views"
  const collection = (
    section === "sources" ||
    section === "channels" ||
    section === "screens"
      ? section
      : "views"
  ) as Collection
  return (
    <Shell contentWidth="full">
      <Header
        heading="CastKit"
        isSticky
        actions={
          <a className="underline" href="/">
            Home
          </a>
        }
      />
      <Main className="p-4 md:p-6">
        <div
          className={`mx-auto grid gap-6 ${section === "devices" || section === "all-screens" ? "w-full" : "max-w-7xl"}`}
        >
          <Nav
            activeHref={`/${section}`}
            items={destinations}
            label="CastKit management"
          />
          {section !== "devices" &&
          section !== "all-screens" ? (
            <h1 className="font-semibold text-2xl">
              {title}
            </h1>
          ) : null}
          {error ? (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p
                  role="alert"
                  className="text-intent-danger-content"
                >
                  {error}
                </p>
                <Button
                  appearance="outline"
                  onClick={() =>
                    void refreshSession()
                      .then(() =>
                        session?.isAuthenticated
                          ? refreshPlatform()
                          : undefined,
                      )
                      .catch((error) =>
                        setError(String(error)),
                      )
                  }
                >
                  Retry connection
                </Button>
              </div>
            </Card>
          ) : null}
          {isLoading ? (
            <p role="status">Loading CastKit…</p>
          ) : session &&
            (section === "access" ||
              !session.isAuthenticated ||
              session.isSetupRequired) ? (
            <Access
              session={session}
              onChange={refreshSession}
            />
          ) : (section === "devices" ||
              section === "all-screens") &&
            platform ? (
            <Devices
              platform={platform}
              onRefresh={refreshPlatform}
            />
          ) : platform && section === "plugins" ? (
            <Plugins
              platform={platform}
              onRefresh={refreshPlatform}
            />
          ) : platform ? (
            <CollectionPage
              key={collection}
              collection={collection}
              platform={platform}
              onRefresh={refreshPlatform}
            />
          ) : !error ? (
            <EmptyState
              heading="Connecting to CastKit"
              description="The available sources and views will appear here."
            />
          ) : null}
        </div>
      </Main>
    </Shell>
  )
}
