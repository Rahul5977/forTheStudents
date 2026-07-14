import './globals.css';
import { AppProvider } from '@/lib/store';
import Chrome from '@/components/Chrome';

export const metadata = {
  title: 'Student-Counselor — Predict, Plan, Talk',
  description:
    'Cleared JEE? Predict the colleges your rank can get, plan your JoSAA choice list with drag-and-drop, and talk 1:1 to a verified current student before you decide.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AppProvider>
          <Chrome>{children}</Chrome>
        </AppProvider>
      </body>
    </html>
  );
}
