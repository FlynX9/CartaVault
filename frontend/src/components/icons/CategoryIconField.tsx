import { useRef, useState } from 'react'

import { DEFAULT_CATEGORY_ICON_ID } from '../../icons/categoryIconCatalog'
import { CategoryIconPicker } from './CategoryIconPicker'
import { CategoryIconPreview } from './CategoryIconPreview'

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
      {isPickerOpen && <CategoryIconPicker initialIconId={iconId} onCancel={closePicker} onChoose={(selectedIconId) => { onChange(selectedIconId); closePicker() }} />}
    </fieldset>
  )
}
