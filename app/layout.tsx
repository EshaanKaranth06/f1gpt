import "./global.css"
import { ReactNode } from "react"

export const metadata = {
    title: "F1GPT",
    description: "All your F1 queries in one place"
}

interface RootLayoutProps {
    children: ReactNode;
}

const RootLayout = ({ children }: RootLayoutProps) => {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    )
}

export default RootLayout