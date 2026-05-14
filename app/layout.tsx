import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { AuthProvider } from '@/lib/auth-context'
import { Toaster } from '@/components/ui/sonner'
import { FloatingChatWidget } from '@/components/ai-chat/floating-chat-widget'
import './globals.css'

const inter = Inter({ 
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: 'CSEDU Digital Knowledge Platform',
    template: '%s | CSEDU',
  },
  description: 'Digital Knowledge Platform for the Department of Computer Science and Engineering, University of Dhaka. Access library catalog, research repository, student projects, and AI-powered search.',
  keywords: ['CSEDU', 'University of Dhaka', 'Computer Science', 'Digital Library', 'Research Repository', 'Student Projects'],
  authors: [{ name: 'Team Devops' }],
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8fafc' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-background">
      <body className={`${inter.variable} font-sans antialiased min-h-screen`}>
        <AuthProvider>
          {children}
          <Toaster />
          <FloatingChatWidget />
        </AuthProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
