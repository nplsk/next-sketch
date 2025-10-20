import RuntimeProvider from "@/app/providers/RuntimeProvider";
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <RuntimeProvider>{children}</RuntimeProvider>
      </body>
    </html>
  );
}
