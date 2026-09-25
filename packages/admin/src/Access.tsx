import { Button, Card, Field } from "@charcuterie/ui"
import { useState } from "react"
import { inputClass, mutate } from "./platformApi.ts"
export type AccessSession = {
  isAuthenticated: boolean
  isSetupRequired: boolean
}

export const Access = ({
  session,
  onChange,
}: {
  session: AccessSession
  onChange: () => Promise<void>
}) => {
  const [pin, setPin] = useState("")
  const [currentPin, setCurrentPin] = useState("")
  const [isSuccess, setIsSuccess] = useState(false)
  const [confirmation, setConfirmation] = useState("")
  const [hasSetupLink] = useState(
    () =>
      session.isSetupRequired &&
      new URLSearchParams(
        window.location.hash.slice(1),
      ).has("setup"),
  )
  const [setupToken, setSetupToken] = useState(() => {
    if (!session.isSetupRequired) return ""
    const fragment = new URLSearchParams(
      window.location.hash.slice(1),
    )
    const token = fragment.get("setup") ?? ""
    if (token)
      history.replaceState(
        history.state,
        "",
        `${window.location.pathname}${window.location.search}`,
      )
    return token
  })
  const [message, setMessage] = useState("")
  const [isBusy, setIsBusy] = useState(false)
  const submit = async () => {
    if (session.isSetupRequired && pin !== confirmation) {
      setMessage("The PINs do not match.")
      return
    }
    setIsBusy(true)
    setMessage("")
    setIsSuccess(false)
    try {
      await mutate(
        session.isSetupRequired
          ? "/api/access/setup"
          : "/api/access/login",
        { pin, ...(setupToken ? { setupToken } : {}) },
      )
      setPin("")
      setConfirmation("")
      setSetupToken("")
      await onChange()
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not sign in.",
      )
    } finally {
      setIsBusy(false)
    }
  }
  const changePin = async () => {
    if (pin !== confirmation) {
      setIsSuccess(false)
      setMessage("The PINs do not match.")
      return
    }
    setIsBusy(true)
    setIsSuccess(false)
    setMessage("")
    try {
      await mutate("/api/access/change-pin", {
        currentPin,
        newPin: pin,
      })
      setCurrentPin("")
      setPin("")
      setConfirmation("")
      await onChange()
      setIsSuccess(true)
      setMessage(
        "Management PIN changed. Other management sessions were signed out.",
      )
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not change the PIN.",
      )
    } finally {
      setIsBusy(false)
    }
  }
  const logout = async () => {
    try {
      await mutate("/api/access/logout", {})
      await onChange()
    } catch (error) {
      setMessage(String(error))
    }
  }
  return (
    <div className="grid gap-4 max-w-2xl">
      <Card
        heading={
          session.isSetupRequired
            ? "Set up management access"
            : session.isAuthenticated
              ? "Management session"
              : "Sign in to CastKit"
        }
      >
        {session.isAuthenticated &&
        !session.isSetupRequired ? (
          <div className="grid gap-4">
            <p>
              You can manage sources, views, screens, and
              devices from this browser.
            </p>
            <form
              className="grid gap-4 border-t border-border-subtle pt-4"
              onSubmit={(event) => {
                event.preventDefault()
                void changePin()
              }}
            >
              <h2 className="font-semibold">
                Change management PIN
              </h2>
              <Field
                label="Current management PIN"
                isRequired
              >
                <input
                  className={inputClass}
                  type="password"
                  inputMode="numeric"
                  autoComplete="current-password"
                  value={currentPin}
                  onChange={(event) =>
                    setCurrentPin(event.target.value)
                  }
                />
              </Field>
              <Field label="New management PIN" isRequired>
                <input
                  className={inputClass}
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  value={pin}
                  onChange={(event) =>
                    setPin(event.target.value)
                  }
                />
              </Field>
              <Field label="Confirm new PIN" isRequired>
                <input
                  className={inputClass}
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(event) =>
                    setConfirmation(event.target.value)
                  }
                />
              </Field>
              <Button type="submit" isLoading={isBusy}>
                Change PIN
              </Button>
            </form>
            <Button
              appearance="outline"
              onClick={() => void logout()}
            >
              Sign out
            </Button>
          </div>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <p className="text-content-secondary">
              {session.isSetupRequired
                ? "Choose a PIN to protect CastKit management. Each private view or screen can use its own PIN."
                : "Enter the management PIN. Unlock private views from their own pages."}
            </p>
            <Field
              label={
                session.isSetupRequired
                  ? "New management PIN"
                  : "Management PIN"
              }
              isRequired
            >
              <input
                className={inputClass}
                type="password"
                inputMode="numeric"
                autoComplete={
                  session.isSetupRequired
                    ? "new-password"
                    : "current-password"
                }
                value={pin}
                onChange={(event) =>
                  setPin(event.target.value)
                }
              />
            </Field>
            {session.isSetupRequired ? (
              <>
                <Field label="Confirm PIN" isRequired>
                  <input
                    className={inputClass}
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    value={confirmation}
                    onChange={(event) =>
                      setConfirmation(event.target.value)
                    }
                  />
                </Field>
                {!hasSetupLink || message ? (
                  <Field
                    label="Setup token"
                    description="Use the one-time setup link, or enter the setup token from the server."
                    isRequired
                  >
                    <input
                      className={inputClass}
                      type="password"
                      autoComplete="off"
                      value={setupToken}
                      onChange={(event) =>
                        setSetupToken(event.target.value)
                      }
                    />
                  </Field>
                ) : null}
              </>
            ) : null}
            <Button type="submit" isLoading={isBusy}>
              {session.isSetupRequired
                ? "Set management PIN"
                : "Sign in"}
            </Button>
          </form>
        )}
        {message ? (
          <p
            className={
              isSuccess
                ? "mt-4 text-content-secondary"
                : "mt-4 text-intent-danger-content"
            }
            role={isSuccess ? "status" : "alert"}
          >
            {message}
          </p>
        ) : null}
      </Card>
      <Card heading="View and screen access">
        <p>
          Set each view or screen to Public or PIN protected
          in its editor. A kiosk can unlock with its
          on-screen keypad and lock again after its session
          expires. View controls require their own
          permission.
        </p>
      </Card>
      <Card heading="Machine API access">
        <p>
          Automation clients use the server's configured
          bearer token. This credential is independent of
          kiosk PINs and management sessions. Integration
          credentials belong on their source connections.
        </p>
        <a
          className="mt-3 inline-block underline"
          href="/api"
        >
          Open API reference
        </a>
      </Card>
    </div>
  )
}
