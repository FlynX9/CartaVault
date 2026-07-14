import { Search } from 'lucide-react'

interface WorkspaceSearchFieldProps { value: string; placeholder: string; onChange: (value: string) => void }

export function WorkspaceSearchField({ value, placeholder, onChange }: WorkspaceSearchFieldProps) {
  return <label className="workspace-search-field cv-workspace-panel__search"><Search size={16} aria-hidden="true" /><span className="visually-hidden">{placeholder}</span><input type="search" maxLength={100} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></label>
}
