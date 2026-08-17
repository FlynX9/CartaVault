(() => {
  try {
    const preference = localStorage.getItem('cartavault.theme')
    const dark = preference === 'dark'
      || ((preference === null || preference === 'system')
        && matchMedia('(prefers-color-scheme: dark)').matches)
    const theme = dark ? 'dark' : 'light'
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    const density = localStorage.getItem('cartavault.display-density')
    document.documentElement.dataset.density = density === 'comfortable' || density === 'spacious'
      ? density
      : 'compact'
  } catch {
    document.documentElement.dataset.theme = 'light'
    document.documentElement.style.colorScheme = 'light'
    document.documentElement.dataset.density = 'compact'
  }
})()
