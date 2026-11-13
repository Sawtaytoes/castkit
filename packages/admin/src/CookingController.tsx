import { Card } from "@charcuterie/ui"
import { BookOpen } from "lucide-react"
import { useEffect, useState } from "react"
import {
  CookingPage,
  type CookingSession,
} from "./CookingPage.tsx"
import { api } from "./platformApi.ts"

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
  const [session, setSession] =
    useState<CookingSession | null>(null)
  const [error, setError] = useState("")
  const [isDone, setIsDone] = useState(false)
  const [isBusy, setIsBusy] = useState(false)
  const headers = { "x-castkit-cooking-key": key }
  useEffect(() => {
    if (isDone) return
    let isMounted = true
    const refresh = () =>
      void api<CookingSession>(`/api/cooking/${id}/state`, {
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
      const result = await api<{
        session: CookingSession | null
      }>(`/api/cooking/${id}/command`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          action,
          revision: session?.revision,
        }),
      })
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
