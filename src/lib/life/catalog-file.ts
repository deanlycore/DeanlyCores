import file from "../../../data/recipes.json"

import { toCatalogRecipes, type CatalogSourceFile } from "@/lib/life/catalog-seed"

export const catalogFileRecipes = toCatalogRecipes(file as CatalogSourceFile)
