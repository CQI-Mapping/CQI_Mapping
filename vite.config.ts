// Vite config: this project only needs the React plugin.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    // The ExcelJS round-trip tests build a real workbook and read it back with
    // SheetJS. Individually they finish in ~2s, but they run in parallel with
    // each other and the rest of the suite, and on a loaded machine the two
    // ~900kB library loads together can push them past Vitest's 5s default.
    // That showed up as an intermittent failure that vanished when the files
    // were run alone -- contention, not a broken assertion.
    testTimeout: 20000,
  },
})
