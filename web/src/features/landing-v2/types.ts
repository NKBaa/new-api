/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/

export type ModelCategory = 'all' | 'reasoning' | 'coding' | 'cost-effective' | 'multimodal'

export interface ModelCatalogItem {
  id: string
  name: string
  provider: string
  context: string
  availability: string
  availabilityRate?: number
  latency: string
  category: ModelCategory[]
  description: string
  badge?: string
}

export interface CompatibleTool {
  id: string
  name: string
  category: string
  tagline: string
  configTip: string
  website: string
}
