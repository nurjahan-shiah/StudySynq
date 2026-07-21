import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import SessionManager from "./components/SessionManager";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "StudySync - Sync Your Success",
  description: "Study groups, resources, and scheduling for university students.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* Inline script runs before paint to avoid theme flash */}
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var t = localStorage.getItem('ss-theme') || 'dark';
                  document.documentElement.setAttribute('data-theme', t);
                } catch(e) {}
              })();
            `,
          }}
        />
      </head>

      <body className="min-h-full flex flex-col">
        <SessionManager />
        {children}
      </body>
    </html>
  );
}
