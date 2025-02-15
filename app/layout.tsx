import "./global.css"

export const metadata ={
    title: "F1GPT",
    description: "All your F1 queries in one place"
}

const RootLayout = ({ children }) => {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    )
}

export default RootLayout