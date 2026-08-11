import { lazy, Suspense, useRef, useState } from 'react'

import { DEFAULT_CATEGORY_ICON_ID } from '../../icons/categoryIconRuntime'
import { CategoryIconPreview } from './CategoryIconPreview'

const CategoryIconPicker = lazy(() => import('./CategoryIconPicker').then((module) => ({ default: module.CategoryIconPicker })))

interface CategoryIconFieldProps {
  value: string | null | undefined
  onChange: (iconId: string) => void
}

export function CategoryIconField({ value, onChange }: CategoryIconFieldProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false)
  const changeButton = useRef<HTMLButtonElement>(null)
  const iconId = value ?? DEFAULT_CATEGORY_ICON_ID

  const closePicker = () => {
    setIsPickerOpen(false)
    window.setTimeout(() => changeButton.current?.focus(), 0)
  }

  return (
    <fieldset className="category-icon-field">
      <legend>Icône</legend>
      <div>
        <CategoryIconPreview iconId={iconId} />
        <button ref={changeButton} className="secondary-button" type="button" onClick={() => setIsPickerOpen(true)}>Changer</button>
      </div>
      {isPickerOpen && <Suspense fallback={<p className="category-icon-picker-loading" role="status">Chargement des icônes…</p>}><CategoryIconPicker initialIconId={iconId} onCancel={closePicker} onChoose={(selectedIconId) => { onChange(selectedIconId); closePicker() }} /></Suspense>}
    </fieldset>
  )
}
