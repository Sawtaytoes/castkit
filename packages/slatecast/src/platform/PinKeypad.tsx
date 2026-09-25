import { useState } from "preact/hooks"

/** Touch-only unlock; the browser stores a server session, never the PIN. */
export const PinKeypad = ({
  name,
  error,
  isPending,
  onUnlock,
}: {
  name: string
  error: string
  isPending: boolean
  onUnlock: (pin: string) => Promise<void>
}) => {
  const [pin, setPin] = useState("")
  return (
    <main class="platform-lock" data-castkit-ready="true">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void onUnlock(pin)
          setPin("")
        }}
      >
        <h1>{name}</h1>
        <p>Enter the PIN to unlock this display.</p>
        <input
          aria-label="PIN"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          maxLength={32}
          onInput={(event) =>
            setPin(
              event.currentTarget.value.replace(/\D/g, ""),
            )
          }
        />
        <div class="platform-keypad">
          {[
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7",
            "8",
            "9",
            "Clear",
            "0",
            "Delete",
          ].map((digit) => (
            <button
              type="button"
              key={digit}
              data-castkit-target={`pin:${digit}`}
              disabled={isPending}
              onClick={() =>
                setPin((current) =>
                  digit === "Clear"
                    ? ""
                    : digit === "Delete"
                      ? current.slice(0, -1)
                      : `${current}${digit}`.slice(0, 32),
                )
              }
            >
              {digit}
            </button>
          ))}
        </div>
        <button
          type="submit"
          data-castkit-target="pin:unlock"
          disabled={isPending || pin.length === 0}
        >
          {isPending ? "Unlocking…" : "Unlock"}
        </button>
        {error ? <p role="alert">{error}</p> : null}
      </form>
    </main>
  )
}
