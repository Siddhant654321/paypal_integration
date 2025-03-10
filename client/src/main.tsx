import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.tsx';
import './index.css';
import { ThemeProvider } from "./components/theme-provider";
import { Toaster } from "./components/ui/toaster.tsx";
import { PayPalScriptProvider } from "@paypal/react-paypal-js";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 1
    },
  },
});

// Configure PayPal SDK with proper sandbox credentials
const paypalClientId = import.meta.env.VITE_PAYPAL_CLIENT_ID;

if (!paypalClientId) {
  throw new Error('Missing required environment variable: VITE_PAYPAL_CLIENT_ID');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="ui-theme">
        <PayPalScriptProvider options={{
          "client-id": paypalClientId,
          currency: "USD",
          intent: "capture"
        }}>
          <App />
          <Toaster />
        </PayPalScriptProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>
);