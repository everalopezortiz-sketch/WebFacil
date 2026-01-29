import './globals.css'
import { Toaster } from '@/components/ui/sonner'

export const metadata = {
  title: 'WebBuilder SaaS - Crea tu página web',
  description: 'Plataforma para crear tu tienda online, página personal o menú de restaurante',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body className="antialiased">
        {children}
        <Toaster position="top-right" richColors />
      </body>
    </html>
  )
}
