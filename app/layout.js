import Script from "next/script";
import { headers } from "next/headers";
import "./site.css";

const themeScript = `try{const t=localStorage.getItem("themeMode");document.documentElement.dataset.theme=t==="light"||t==="dark"?t:(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light")}catch{}`;

export const metadata = {
  icons: { icon: "/site/app-icon.svg" },
  metadataBase: new URL(process.env.PUBLIC_URL || "http://localhost:3000"),
};

export const viewport = { themeColor: "#f4f1e8" };
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }) {
  const nonce = (await headers()).get("x-nonce") || undefined;

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script id="looptalk-theme" nonce={nonce} strategy="beforeInteractive">
          {themeScript}
        </Script>
        <Script src="/site/site-i18n.js" nonce={nonce} strategy="beforeInteractive" />
        {children}
        <Script src="/site/site.js" nonce={nonce} strategy="afterInteractive" />
      </body>
    </html>
  );
}