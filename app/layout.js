import Script from "next/script";
import "./site.css";

export const metadata = {
  icons: {
    icon: [
      { url: "/site/app-icon.svg", type: "image/svg+xml" },
      { url: "/site/app-icon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
    ],
    apple: "/site/app-icon-180.png",
  },
  metadataBase: new URL(process.env.PUBLIC_URL || "http://localhost:3000"),
};

export const viewport = { themeColor: "#f4f1e8" };
export const dynamic = "force-dynamic";

export default function RootLayout({ children }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script src="/site/theme.js" />
      </head>
      <body>
        <Script src="/site/site-i18n.js" strategy="afterInteractive" />
        {children}
        <Script src="/site/site.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}