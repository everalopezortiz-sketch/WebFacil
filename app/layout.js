import './globals.css'
import { Inter } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata = {
  title: 'webFácil - Crea tu tienda online',
  description: 'Plataforma para crear tu tienda online, página personal o menú de restaurante',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="antialiased font-sans">
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  )
}
