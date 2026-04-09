export const metadata = {
  title: "LeadFlow API",
  description: "Next.js API routes for LeadFlow",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui", margin: 24 }}>{children}</body>
    </html>
  );
}
