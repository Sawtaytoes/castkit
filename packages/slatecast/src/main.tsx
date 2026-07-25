import { render } from "preact"
import { App } from "./App.tsx"
import { connect } from "./state.ts"
import "./styles.css"

render(<App />, document.getElementById("app")!)
connect()
