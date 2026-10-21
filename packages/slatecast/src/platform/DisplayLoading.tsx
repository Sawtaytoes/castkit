/** Quiet first-load structure; later navigation keeps the last complete view. */
export const DisplayLoading = ({
  error = "",
}: {
  error?: string
}) => (
  <main
    class="platform platform-loading"
    aria-busy={!error}
  >
    <span
      class="platform-loading-label"
      role={error ? "alert" : "status"}
    >
      {error || "Loading view"}
    </span>
    <div class="platform-loading-panels" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <div class="platform-loading-panel" key={index}>
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  </main>
)
