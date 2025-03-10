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

// PayPal configuration
const initialOptions = {
  clientId: import.meta.env.VITE_PAYPAL_CLIENT_ID,
  currency: "USD",
  intent: "capture",
  components: ["buttons"]
};

if (!initialOptions.clientId) {
  throw new Error('Missing required environment variable: VITE_PAYPAL_CLIENT_ID');
}

console.log("[PayPal] Initializing SDK with client ID:", initialOptions.clientId.substring(0, 8) + "...");

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light" storageKey="ui-theme">
        <PayPalScriptProvider options={initialOptions}>
          <App />
          <Toaster />
        </PayPalScriptProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>
);