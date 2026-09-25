import {
  Card,
  EmptyState,
  Field,
  Header,
  Main,
  Shell,
} from "@charcuterie/ui"
import { useEffect, useState } from "react"
import { api, inputClass } from "./platformApi.ts"

type PublicItem = {
  id: string
  name: string
  access: "public" | "pin"
}

export const PublicPages = () => {
  const isLibrary =
    window.location.pathname.startsWith("/views")
  const [library, setLibrary] = useState<{
    views: PublicItem[]
    screens: PublicItem[]
  }>({ views: [], screens: [] })
  const [query, setQuery] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(isLibrary)
  useEffect(() => {
    if (!isLibrary) return
    void api<typeof library>("/api/views")
      .then(setLibrary)
      .catch((error) =>
        setError(
          error instanceof Error
            ? error.message
            : "Could not load views.",
        ),
      )
      .finally(() => setIsLoading(false))
  }, [isLibrary])
  return (
    <Shell contentWidth="full">
      <Header
        heading="CastKit"
        actions={
          <a href="/manage" className="underline">
            Manage CastKit
          </a>
        }
      />
      <Main className="p-4 md:p-8">
        <div className="mx-auto grid max-w-6xl gap-6">
          {isLibrary ? (
            <>
              <div>
                <a href="/" className="text-sm underline">
                  Home
                </a>
                <h1 className="mt-4 font-semibold text-3xl">
                  Views and screens
                </h1>
                <p className="mt-2 text-content-secondary">
                  Open a view in any browser. A screen can
                  change its view while its URL stays the
                  same.
                </p>
              </div>
              <Field label="Find a view or screen">
                <input
                  className={inputClass}
                  type="search"
                  value={query}
                  onChange={(event) =>
                    setQuery(event.target.value)
                  }
                />
              </Field>
              {isLoading ? (
                <p role="status">Loading views…</p>
              ) : error ? (
                <p role="alert">{error}</p>
              ) : (
                (["views", "screens"] as const).map(
                  (collection) => (
                    <section
                      key={collection}
                      className="grid gap-4"
                    >
                      <h2 className="font-semibold text-xl">
                        {collection === "views"
                          ? "Fixed views"
                          : "Browser screens"}
                      </h2>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {library[collection]
                          .filter((item) =>
                            item.name
                              .toLowerCase()
                              .includes(
                                query.toLowerCase(),
                              ),
                          )
                          .map((item) => (
                            <Card
                              key={item.id}
                              heading={item.name}
                            >
                              <p className="mb-4 text-content-secondary">
                                {item.access === "pin"
                                  ? "PIN protected"
                                  : "Public"}
                              </p>
                              <a
                                className="underline"
                                href={`/${collection === "views" ? "view" : "screen"}/${encodeURIComponent(item.id)}`}
                              >
                                Open{" "}
                                {collection === "views"
                                  ? "view"
                                  : "screen"}
                              </a>
                            </Card>
                          ))}
                      </div>
                      {!library[collection].length ? (
                        <Card>
                          <EmptyState
                            heading={
                              collection === "views"
                                ? "No saved views"
                                : "No browser screens"
                            }
                            description={
                              collection === "views"
                                ? "Create a view from the available components and data channels."
                                : "Create a screen to let automations select its view."
                            }
                            action={
                              <a
                                className="underline"
                                href={`/manage/${collection}`}
                              >
                                Create{" "}
                                {collection === "views"
                                  ? "a view"
                                  : "a screen"}
                              </a>
                            }
                          />
                        </Card>
                      ) : null}
                    </section>
                  ),
                )
              )}
            </>
          ) : (
            <>
              <div className="py-6">
                <h1 className="font-semibold text-4xl">
                  Your data, on any display.
                </h1>
                <p className="mt-4 max-w-2xl text-lg text-content-secondary">
                  Connect your services, choose view
                  components, and open a dashboard in a
                  browser or on a household display.
                </p>
              </div>
              <div className="grid gap-5 md:grid-cols-3">
                <Card heading="Open a view">
                  <p className="mb-5 text-content-secondary">
                    Use a saved view or browser screen on a
                    monitor, tablet, or kiosk.
                  </p>
                  <a className="underline" href="/views">
                    Browse views and screens
                  </a>
                </Card>
                <Card heading="Create your view">
                  <p className="mb-5 text-content-secondary">
                    Combine components and subscribe to the
                    data channels you need.
                  </p>
                  <a
                    className="underline"
                    href="/manage/views"
                  >
                    Create and manage views
                  </a>
                </Card>
                <Card heading="Manage CastKit">
                  <p className="mb-5 text-content-secondary">
                    Configure sources, channels, plugins,
                    devices, and access.
                  </p>
                  <a
                    className="underline"
                    href="/manage/sources"
                  >
                    Open management
                  </a>
                </Card>
              </div>
              <Card heading="Build with CastKit">
                <p className="mb-3 text-content-secondary">
                  Use the API to select views and connect
                  your own software.
                </p>
                <a className="underline" href="/api">
                  API reference
                </a>
              </Card>
            </>
          )}
        </div>
      </Main>
    </Shell>
  )
}
