import {
  Button,
  Card,
  EmptyState,
  Header,
  IconButton,
  Main,
  Nav,
  type NavRailItem,
  Rail,
  Shell,
  useNavLayout,
} from "@charcuterie/ui"
import {
  Cpu,
  KeyRound,
  LayoutGrid,
  LayoutTemplate,
  Menu,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Puzzle,
  Radio,
} from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useLocation } from "react-router"
import { Access, type AccessSession } from "./Access.tsx"
import { Brand } from "./Brand.tsx"
import { CollectionPage } from "./CollectionPage.tsx"
import { Devices } from "./Devices.tsx"
import { Plugins } from "./Plugins.tsx"
import {
  ApiError,
  api,
  type Collection,
  type Platform,
} from "./platformApi.ts"

/**
 * The destinations, with a glyph each: the rail's icon-only state shows
 * nothing else, so an item with no glyph would be a blank square that still
 * navigates (`NavRailItem` makes the type checker say so).
 */
const destinations: NavRailItem[] = [
  {
    label: "Device overview",
    href: "/all-screens",
    icon: <LayoutGrid />,
  },
  { label: "Sources", icon: <Plug /> },
  { label: "Channels", icon: <Radio /> },
  { label: "Views", icon: <LayoutTemplate /> },
  { label: "Screens", icon: <Monitor /> },
  { label: "Devices", icon: <Cpu /> },
  { label: "Plugins", icon: <Puzzle /> },
  { label: "Access", icon: <KeyRound /> },
].map((item) => ({
  ...item,
  href:
    item.href ??
    `/${item.label.toLowerCase().replaceAll(" ", "-")}`,
}))

export const App = () => {
  const location = useLocation()
  const navLayout = useNavLayout({
    storageKey: "castkit-management-navigation",
  })
  const [isNavVisible, setIsNavVisible] = useState(false)
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
  const title = session?.isSetupRequired
    ? "Set up CastKit"
    : session?.isAuthenticated
      ? (destinations.find(
          (item) => item.href === `/${section}`,
        )?.label ?? "Views")
      : "Sign in"
  const collection = (
    section === "sources" ||
    section === "channels" ||
    section === "screens"
      ? section
      : "views"
  ) as Collection
  return (
    <Shell
      contentWidth={
        session?.isAuthenticated ? "full" : "xl"
      }
    >
      <Header isSticky>
        {session?.isAuthenticated &&
        navLayout.layout === "menu" ? (
          <Nav
            activeHref={`/${section}`}
            isVisible={isNavVisible}
            items={destinations}
            label="CastKit management"
            layout="menu"
            onDismiss={() => setIsNavVisible(false)}
            trigger={
              <IconButton
                appearance="outline"
                label="Open navigation"
                onClick={() =>
                  setIsNavVisible((isVisible) => !isVisible)
                }
              >
                <Menu
                  aria-hidden="true"
                  className="size-5"
                />
              </IconButton>
            }
          />
        ) : null}
        <Brand />
      </Header>
      {session?.isAuthenticated &&
      navLayout.layout !== "menu" ? (
        <Rail
          label="CastKit management"
          landmark="navigation"
          style={{
            width: navLayout.isCollapsed
              ? "5rem"
              : undefined,
          }}
        >
          <Nav
            activeHref={`/${section}`}
            items={destinations}
            label="Sections"
            layout={navLayout.layout}
          />
          <div className="mt-auto hidden justify-end md:flex">
            <IconButton
              appearance="ghost"
              label={
                navLayout.isCollapsed
                  ? "Expand navigation"
                  : "Collapse navigation"
              }
              onClick={navLayout.toggle}
            >
              {navLayout.isCollapsed ? (
                <PanelLeftOpen aria-hidden="true" />
              ) : (
                <PanelLeftClose aria-hidden="true" />
              )}
            </IconButton>
          </div>
        </Rail>
      ) : null}
      <Main>
        <div className="grid min-w-0 gap-6">
          {!session?.isAuthenticated ||
          (section !== "devices" &&
            section !== "all-screens") ? (
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
