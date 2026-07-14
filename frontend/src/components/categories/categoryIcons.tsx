import { Building2, Castle, Church, CircleHelp, Factory, House, Landmark, MapPin, Mountain, TreePine, Warehouse } from 'lucide-react'
import type { CategoryIconId } from './categoryIconCatalog'

const icons = { 'map-pin': MapPin, landmark: Landmark, 'building-2': Building2, church: Church, castle: Castle, factory: Factory, warehouse: Warehouse, school: Building2, hospital: Building2, hotel: Building2, house: House, theater: Building2, train: Building2, bridge: Building2, mountain: Mountain, 'tree-pine': TreePine, 'circle-help': CircleHelp } as const
export function CategoryIcon({ icon, size = 16 }: { icon?: string | null; size?: number }) { const Icon = icons[icon as CategoryIconId] ?? CircleHelp; return <Icon aria-hidden="true" size={size} strokeWidth={2} /> }
