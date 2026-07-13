import { NavLink, Outlet } from 'react-router-dom'

export function AdminLayout() {
  return (
    <div className="admin-layout">
      <nav className="admin-nav" aria-label="Navigation de l’administration">
        <NavLink to="/admin/categories">Catégories</NavLink>
        <NavLink to="/admin/tags">Tags</NavLink>
      </nav>
      <Outlet />
    </div>
  )
}
