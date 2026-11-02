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
    // Long enough that this recipe pages, so these stories show the paged layout.
    "Warm the olive oil in a skillet. Add the chickpeas and stir gently until warmed through. ".repeat(
      12,
    ),
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

const bananaCake = {
  slug: "banana-bread-snack-cake",
  name: "Banana Bread Snack Cake",
  url: "https://recipes.example/g/home/r/banana-bread-snack-cake",
  yieldText: "8–10 servings",
  ingredients: [
    "4–5 very ripe bananas, mashed",
    "2 eggs",
    "1¾ cups all-purpose flour",
    "1 tsp baking soda",
    "1 cup packed brown sugar",
    "¼ cup granulated sugar",
    "½ tsp salt",
    "2 tsp vanilla extract",
    "½ cup chopped pecans (optional)",
    "½ cup butter (1 stick), melted and cooled",
  ],
  instructions: [
    "Heat oven to 350°. Spray an 8- or 9-inch square pan with baking spray, or line with parchment.",
    "Beat butter, brown sugar, eggs, and vanilla with an electric mixer. Mix in mashed bananas.",
    "Whisk flour, baking soda, and salt in a bowl. Stir into the wet mixture just until combined. Fold in pecans, if using.",
    "Pour into the pan. Sprinkle the granulated sugar evenly over the top.",
    "Bake 45–50 minutes, until a toothpick in the center comes out clean. Cool slightly in the pan on a rack; cut into squares.",
  ],
  notes: [
    "Very ripe, heavily speckled bananas give the most flavor.",
  ],
}
const complete = paginateRecipe(bananaCake, 800, 480)
/** A recipe that fits: every ingredient and step on one white screen. */
export const CompleteRecipe: Story = {
  render: () => (
    <div style={{ width: "100vw", height: "100vh" }}>
      <RecipeView
        data={{
          ...complete,
          recipe: bananaCake,
          page: complete.pages[0]!,
          pageIndex: 0,
          pageCount: 1,
        }}
      />
    </div>
  ),
}
