import "./globals.css";

export const metadata = {
  title: "Document Q&A Chatbot",
  description: "A LangChain.js document question answering app."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
