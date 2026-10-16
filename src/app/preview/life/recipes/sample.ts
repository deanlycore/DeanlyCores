import type { RecipeRow, StarterRecipe } from "@/lib/life/recipes"

export const previewRecipes: RecipeRow[] = [
  {
    id: "tacos",
    name: "Weeknight tacos",
    category: "Dinner",
    servings: 4,
    steps: ["Warm the tortillas.", "Cook the filling until browned.", "Top with salsa and serve."],
    notes: "Use beans when you want a meatless night.",
    visibility: "shared",
    catalog_recipe_id: "starter-tacos",
    created_by: "preview",
    updated_at: "2026-10-16T00:00:00.000Z",
    ingredients: [
      { id: "chicken", name: "Chicken thighs", quantity: "500", unit: "g", category: "meat", sort_order: 0 },
      { id: "tortillas", name: "Tortillas", quantity: "8", unit: "each", category: "bakery", sort_order: 1 },
      { id: "onion", name: "Onion", quantity: "1", unit: "each", category: "produce", sort_order: 2 },
      { id: "salsa", name: "Salsa", quantity: "1", unit: "cup", category: "pantry", sort_order: 3 },
      { id: "lime", name: "Lime", quantity: "1", unit: "each", category: "produce", sort_order: 4 },
    ],
  },
  {
    id: "soup",
    name: "Tomato soup",
    category: "Soup",
    servings: 4,
    steps: ["Simmer the tomatoes with the stock.", "Blend until smooth."],
    notes: null,
    visibility: "shared",
    catalog_recipe_id: null,
    created_by: "preview",
    updated_at: "2026-10-16T00:00:00.000Z",
    ingredients: [
      { id: "tomatoes", name: "Tomatoes", quantity: "800", unit: "g", category: "produce", sort_order: 0 },
      { id: "stock", name: "Vegetable stock", quantity: "1", unit: "l", category: "pantry", sort_order: 1 },
    ],
  },
  {
    id: "omelette",
    name: "Herb omelette",
    category: "Breakfast",
    servings: 1,
    steps: ["Beat the eggs with the herbs.", "Cook gently in butter."],
    notes: null,
    visibility: "private",
    catalog_recipe_id: null,
    created_by: "preview",
    updated_at: "2026-10-16T00:00:00.000Z",
    ingredients: [{ id: "eggs", name: "Eggs", quantity: "3", unit: "each", category: "dairy", sort_order: 0 }],
  },
]

export const previewStarters: StarterRecipe[] = [
  {
    id: "starter-pancakes",
    name: "Pancakes",
    category: "Breakfast",
    servings: 4,
    steps: ["Mix the batter.", "Cook until bubbles form."],
    notes: null,
    copiedId: null,
    ingredients: [{ id: "flour", name: "Flour", quantity: "200", unit: "g", category: "pantry", sort_order: 0 }],
  },
  {
    id: "starter-salad",
    name: "Greek salad",
    category: "Salad",
    servings: 4,
    steps: ["Chop the vegetables.", "Toss with oil and lemon."],
    notes: null,
    copiedId: null,
    ingredients: [{ id: "cucumber", name: "Cucumber", quantity: "1", unit: "each", category: "produce", sort_order: 0 }],
  },
]

export const previewShopping = [
  { name: "Tortillas", checked_at: null },
  { name: "Milk", checked_at: "2026-10-15T00:00:00.000Z" },
]

export const previewPantry = [{ name: "Lime" }]
