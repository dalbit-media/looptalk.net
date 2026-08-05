import Script from "next/script";
import "./site.css";

export const metadata = {
  icons: { icon: "/site/app-icon.svg" },
  metadataBase: new URL(process.env.PUBLIC_URL || "http://localhost:3000"),
};

export const viewport = { themeColor: "#f4f1e8" };
export const dynamic = "force-dynamic";

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script src="/site/site-i18n.js" strategy="afterInteractive" />
        {children}
        <Script src="/site/site.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}