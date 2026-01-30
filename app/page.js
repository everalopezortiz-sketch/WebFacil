'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { Loader2, Store, User, Utensils, Eye, EyeOff } from 'lucide-react'

// Dashboard imports
import Dashboard from '@/app/components/Dashboard'
import AdminPanel from '@/app/components/AdminPanel'

export default function App() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authLoading, setAuthLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const supabaseRef = useRef(null)
  
  // Get software settings from localStorage
  const [softwareSettings, setSoftwareSettings] = useState({
    name: 'webFácil',
    logo_url: '',
    whatsapp_number: ''
  })

  // Auth form state
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [registerForm, setRegisterForm] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    city: '',
    country: '',
    phone: '',
    businessType: 'ecommerce'
  })

  // Initialize Supabase client once
  if (!supabaseRef.current) {
    supabaseRef.current = createClient()
  }
  const supabase = supabaseRef.current

  // Load software settings from localStorage AND fetch global settings from API
  useEffect(() => {
    const loadSoftwareSettings = async () => {
      // First try localStorage
      const saved = localStorage.getItem('softwareSettings')
      if (saved) {
        try {
          setSoftwareSettings(JSON.parse(saved))
        } catch (e) {}
      }
      
      // Also fetch from API for latest global settings (for non-admin users)
      try {
        const res = await fetch('/api/global-settings')
        if (res.ok) {
          const data = await res.json()
          if (data && (data.name || data.logo_url)) {
            setSoftwareSettings(prev => ({
              ...prev,
              ...data
            }))
          }
        }
      } catch (e) {
        console.log('Could not fetch global settings')
      }
    }
    loadSoftwareSettings()
  }, [])

  const fetchProfile = useCallback(async (userId) => {
    try {
      const res = await fetch('/api/auth/user')
      if (res.ok) {
        const data = await res.json()
        if (data.profile) {
          setProfile(data.profile)
          return data.profile
        }
      }
    } catch (error) {
      console.error('Profile fetch error:', error)
    }
    return null
  }, [])

  useEffect(() => {
    let isMounted = true
    
    const initAuth = async () => {
      try {
        // Get initial session
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error('Session error:', error)
          if (isMounted) setLoading(false)
          return
        }
        
        if (session?.user && isMounted) {
          setUser(session.user)
          const profileData = await fetchProfile(session.user.id)
          if (!profileData && isMounted) {
            // If no profile, sign out
            await supabase.auth.signOut()
            setUser(null)
            setProfile(null)
          }
        }
      } catch (error) {
        console.error('Auth init error:', error)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    initAuth()
    
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return
      
      console.log('Auth event:', event)
      
      if (event === 'SIGNED_OUT') {
        setUser(null)
        setProfile(null)
        return
      }
      
      if (session?.user) {
        setUser(session.user)
        if (!profile) {
          await fetchProfile(session.user.id)
        }
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [supabase, fetchProfile])

  const handleLogin = async (e) => {
    e.preventDefault()
    setAuthLoading(true)
    
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: loginForm.email,
        password: loginForm.password
      })
      
      if (authError) {
        toast.error(authError.message || 'Error al iniciar sesión')
        setAuthLoading(false)
        return
      }
      
      // Get profile from API
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm)
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        toast.error(data.error || 'Error al obtener perfil')
        setAuthLoading(false)
        return
      }
      
      toast.success('¡Bienvenido de nuevo!')
      setUser(authData.user)
      setProfile(data.profile)
    } catch (error) {
      console.error('Login error:', error)
      toast.error('Error de conexión')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setAuthLoading(true)
    
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registerForm)
      })
      
      const data = await res.json()
      
      if (!res.ok) {
        toast.error(data.error || 'Error al registrarse')
        setAuthLoading(false)
        return
      }
      
      toast.success('¡Cuenta creada exitosamente!')
      
      // Auto login
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: registerForm.email,
        password: registerForm.password
      })
      
      if (!error && authData?.user) {
        setUser(authData.user)
        // Fetch profile
        const profileRes = await fetch('/api/auth/signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: registerForm.email, password: registerForm.password })
        })
        const profileData = await profileRes.json()
        if (profileData.profile) setProfile(profileData.profile)
      }
    } catch (error) {
      toast.error('Error de conexión')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
      setUser(null)
      setProfile(null)
      toast.success('Sesión cerrada')
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Cargando...</p>
        </div>
      </div>
    )
  }

  if (user && profile) {
    if (profile.role === 'DESARROLLADOR') {
      return <AdminPanel user={user} profile={profile} onLogout={handleLogout} />
    }
    return <Dashboard user={user} profile={profile} onLogout={handleLogout} />
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          {softwareSettings.logo_url ? (
            <img 
              src={softwareSettings.logo_url} 
              alt="Logo" 
              className="w-16 h-16 mx-auto mb-4 object-contain"
            />
          ) : (
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-2xl mb-4 shadow-lg">
              <Store className="w-8 h-8 text-primary-foreground" />
            </div>
          )}
          <h1 className="text-3xl font-bold text-foreground">{softwareSettings.name || 'WebBuilder'}</h1>
          <p className="text-muted-foreground mt-2">Crea tu página web en minutos</p>
        </div>

        <Card className="shadow-xl border-0">
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Iniciar Sesión</TabsTrigger>
              <TabsTrigger value="register">Registrarse</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin}>
                <CardHeader>
                  <CardTitle>Bienvenido</CardTitle>
                  <CardDescription>Ingresa a tu cuenta para continuar</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="tu@email.com"
                      value={loginForm.email}
                      onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Contraseña</Label>
                    <div className="relative">
                      <Input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={loginForm.password}
                        onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                        required
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={authLoading}>
                    {authLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Iniciar Sesión
                  </Button>
                </CardContent>
              </form>
            </TabsContent>

            <TabsContent value="register">
              <form onSubmit={handleRegister}>
                <CardHeader>
                  <CardTitle>Crear Cuenta</CardTitle>
                  <CardDescription>Completa tus datos para comenzar</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">Nombre</Label>
                      <Input
                        id="firstName"
                        placeholder="Juan"
                        value={registerForm.firstName}
                        onChange={(e) => setRegisterForm({ ...registerForm, firstName: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Apellido</Label>
                      <Input
                        id="lastName"
                        placeholder="Pérez"
                        value={registerForm.lastName}
                        onChange={(e) => setRegisterForm({ ...registerForm, lastName: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="city">Ciudad</Label>
                      <Input
                        id="city"
                        placeholder="Asunción"
                        value={registerForm.city}
                        onChange={(e) => setRegisterForm({ ...registerForm, city: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="country">País</Label>
                      <Input
                        id="country"
                        placeholder="Paraguay"
                        value={registerForm.country}
                        onChange={(e) => setRegisterForm({ ...registerForm, country: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Teléfono</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+595 991 123456"
                      value={registerForm.phone}
                      onChange={(e) => setRegisterForm({ ...registerForm, phone: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Tipo de Cuenta</Label>
                    <Select
                      value={registerForm.businessType}
                      onValueChange={(value) => setRegisterForm({ ...registerForm, businessType: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ecommerce">
                          <div className="flex items-center gap-2">
                            <Store className="w-4 h-4" />
                            Tienda / Ecommerce
                          </div>
                        </SelectItem>
                        <SelectItem value="personal">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4" />
                            Página Personal
                          </div>
                        </SelectItem>
                        <SelectItem value="restaurant">
                          <div className="flex items-center gap-2">
                            <Utensils className="w-4 h-4" />
                            Local Gastronómico
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reg-email">Email</Label>
                    <Input
                      id="reg-email"
                      type="email"
                      placeholder="tu@email.com"
                      value={registerForm.email}
                      onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reg-password">Contraseña</Label>
                    <Input
                      id="reg-password"
                      type="password"
                      placeholder="Mínimo 6 caracteres"
                      value={registerForm.password}
                      onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                      minLength={6}
                      required
                    />
                  </div>

                  <Button type="submit" className="w-full" disabled={authLoading}>
                    {authLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Crear Cuenta
                  </Button>
                </CardContent>
              </form>
            </TabsContent>
          </Tabs>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Al registrarte, aceptas nuestros términos y condiciones
        </p>
        
        {/* Footer with Contact */}
        {softwareSettings.whatsapp_number && (
          <div className="text-center mt-8">
            <Button
              variant="outline"
              size="sm"
              className="text-green-600 border-green-300 hover:bg-green-50"
              onClick={() => window.open(`https://wa.me/${softwareSettings.whatsapp_number.replace(/\D/g, '')}`, '_blank')}
            >
              <span className="mr-2">💬</span> Contacto
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
