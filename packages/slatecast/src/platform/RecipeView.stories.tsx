import { paginateRecipe } from "@castkit/sdk/recipe"
import type { StoryObj } from "@storybook/preact-vite"
import { RecipeView } from "./RecipeView.tsx"
import "../styles.css"
import "./platform.css"

const meta = {
  title: "Views/Recipe",
  parameters: { layout: "fullscreen" },
}
export default meta
type Story = StoryObj<typeof meta>
const recipe = {
  slug: "lemon-chickpea-skillet",
  name: "Lemon chickpea skillet",
  url: "https://recipes.example/g/home/r/lemon-chickpea-skillet",
  yieldText: "4 servings",
  ingredients: [
    "2 cans chickpeas, drained",
    "1 lemon",
    "2 tablespoons olive oil",
    "Salt, to taste",
  ],
  instructions: [
    "Warm the olive oil in a skillet. Add the chickpeas and stir gently until warmed through.",
    "Stir in the lemon juice. Season to taste and serve warm.",
  ],
  notes: [],
}
const { pages, ...geometry } = paginateRecipe(
  recipe,
  800,
  480,
)
const show = (index: number) => (
  <div style={{ width: "100vw", height: "100vh" }}>
    <RecipeView
      data={{
        ...geometry,
        recipe,
        page: pages[index]!,
        pageIndex: index,
        pageCount: pages.length,
      }}
    />
  </div>
)
export const Ingredients: Story = { render: () => show(0) }
export const Instructions: Story = { render: () => show(1) }
