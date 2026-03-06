import { defineConfig } from 'rollup'
import typescript from '@rollup/plugin-typescript'
import terser from '@rollup/plugin-terser'

export default defineConfig({
  input: {
    index: 'src/index.ts',
    cli: 'src/cli.ts',
    server: 'src/server.ts'
  },
  output:[
    {
      format: 'es',
      dir: 'dist/es',
    },
  ],
  plugins: [
    typescript(),
    terser()
  ],
  // 不设置 external，将所有依赖都打包到输出文件中
})


