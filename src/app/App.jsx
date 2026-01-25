import React, { useEffect, useMemo, useState } from "react";
import { CssBaseline } from "@mui/material";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import PlannerPage from "../pages/PlannerPage";
import "../App.css";

const THEME_MODE_KEY = "ui_theme_mode_v2";

export default function App() {
  const [themeMode, setThemeMode] = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_MODE_KEY);
      return saved === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(THEME_MODE_KEY, themeMode);
    } catch {
      // ignore
    }
    document.body.classList.toggle("dark", themeMode === "dark");
  }, [themeMode]);

  function toggleThemeMode() {
    setThemeMode((prev) => (prev === "dark" ? "light" : "dark"));
  }

  // ===== THEME (light / warm dark) =====
  const theme = useMemo(() => {
    const isDark = themeMode === "dark";

    return createTheme({
      palette: {
        mode: isDark ? "dark" : "light",
        primary: { main: isDark ? "#DAC95D" : "#F4D06F" },
        secondary: { main: isDark ? "#6D8EEA" : "#7AA2F7" },
        success: { main: isDark ? "#00BF8E" : "#7ED7B5" },
        warning: { main: isDark ? "#D08C5E" : "#E09F6B" },
        background: {
          default: isDark ? "#222428" : "#F6F2E8",
          paper: isDark ? "#4A4C54" : "#FFFFFF",
        },
        text: {
          primary: isDark ? "#F4F1E8" : "#121212",
          secondary: isDark ? "#B8B3A8" : "#4B4B4B",
        },
      },
      shape: { borderRadius: 14 },
      typography: {
        fontFamily: '"Inter", "Manrope", system-ui, -apple-system, Segoe UI, sans-serif',
        h1: {
          fontFamily: '"Space Grotesk", "Unbounded", sans-serif',
          fontWeight: 800,
          fontSize: "clamp(2.75rem, 4vw, 3.75rem)",
          lineHeight: 1.05,
        },
        h2: {
          fontFamily: '"Space Grotesk", "Unbounded", sans-serif',
          fontWeight: 800,
          fontSize: "clamp(2rem, 3vw, 2.6rem)",
          lineHeight: 1.1,
        },
        h3: {
          fontFamily: '"Space Grotesk", "Unbounded", sans-serif',
          fontWeight: 700,
          fontSize: "clamp(1.4rem, 2.2vw, 1.75rem)",
          lineHeight: 1.2,
        },
        subtitle1: { fontWeight: 600 },
        body1: { fontSize: 16 },
        body2: { fontSize: 14 },
      },
      components: {
        MuiAppBar: {
          styleOverrides: {
            root: {
              backgroundImage: "none",
              borderBottom: "3px solid var(--border-color)",
            },
          },
        },
        MuiPaper: {
          styleOverrides: {
            root: {
              border: "3px solid var(--border-color)",
              boxShadow: "var(--shadow-strong)",
            },
          },
        },
        MuiButton: {
          styleOverrides: {
            root: {
              borderRadius: 12,
              border: "3px solid var(--border-color)",
              boxShadow: "var(--shadow-strong)",
              textTransform: "none",
              fontWeight: 700,
              transition: "all 180ms ease",
              "&:hover": {
                boxShadow: "var(--shadow-hover)",
                transform: "translate(-1px, -1px)",
              },
              "&:active": {
                boxShadow: "var(--shadow-active)",
                transform: "translate(2px, 2px)",
              },
            },
            outlined: {
              backgroundColor: "var(--surface)",
            },
            contained: {
              color: "#121212",
            },
          },
        },
        MuiChip: {
          styleOverrides: {
            root: {
              border: "2px solid var(--border-color)",
              fontWeight: 700,
            },
          },
        },
        MuiOutlinedInput: {
          styleOverrides: {
            root: {
              borderRadius: 12,
              backgroundColor: "var(--surface)",
              "& .MuiOutlinedInput-notchedOutline": {
                border: "3px solid var(--border-color)",
              },
              "&:hover .MuiOutlinedInput-notchedOutline": {
                borderColor: "var(--border-color)",
              },
              "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                borderColor: "var(--border-color)",
              },
              "&.Mui-focused": {
                boxShadow: isDark ? "0 0 0 3px rgba(231, 197, 90, 0.3)" : "0 0 0 3px rgba(122, 162, 247, 0.3)",
              },
            },
            input: {
              padding: "12px 14px",
            },
          },
        },
        MuiTableCell: {
          styleOverrides: {
            head: {
              fontWeight: 700,
            },
          },
        },
      },
    });
  }, [themeMode]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <PlannerPage themeMode={themeMode} onToggleTheme={toggleThemeMode} />
    </ThemeProvider>
  );
}
