import type { Metadata, Viewport } from "next";
import { BottomNavigation } from "@/components/navigation/bottom-navigation";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker-registration";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "BrainBook",
  title: {
    default: "BrainBook",
    template: "%s · BrainBook",
  },
  description:
    "Votre bibliothèque personnelle pour conserver vos lectures, notes et idées.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "BrainBook",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#F5F1E9",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>
        <div className="app-shell">
          <main>{children}</main>
          <BottomNavigation />
        </div>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
