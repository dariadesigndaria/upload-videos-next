'use client';

import { CssBaseline, ThemeProvider } from '@mui/material';

import { theme } from '@yachtway/design-system/src/theme';

type ProvidersProps = {
  children: React.ReactNode;
};

export default function Providers({ children }: ProvidersProps) {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
