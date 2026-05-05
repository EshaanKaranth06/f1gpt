import "./global.css"
import { ReactNode } from "react"

export const metadata = {
  title: "F1GPT",
  description: "Your ultimate Formula 1 guide - Ask anything about drivers, races, and the latest news"
}

export const viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
}

interface RootLayoutProps {
  children: ReactNode;
}

const RootLayout = ({ children }: RootLayoutProps) => {
  return (
    <html lang="en" className="bg-background">
      <body>{children}</body>
    </html>
  )
}

export default RootLayout
