
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
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

// Configure PayPal SDK
const paypalClientId = import.meta.env.VITE_PAYPAL_CLIENT_ID || "ASZElLfpU3DpC6dyDJDstkUZ_aQ_YXxvMfVHWO3z9QnIOUQkKiLLLmB77lRXF30LLTz4_LG9PW8v05MI";

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider defaultTheme="light" storageKey="ui-theme">
          <PayPalScriptProvider options={{
            "client-id": paypalClientId,
            currency: "USD",
            components: "buttons"
          }}>
            <App />
            <Toaster />
          </PayPalScriptProvider>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
