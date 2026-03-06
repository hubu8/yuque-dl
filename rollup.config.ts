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
  // 移除所有外部依赖配置，将所有依赖打包到输出文件中
  // external: [
  //   'node:fs/promises',
  //   'node:path',
  //   'node:fs',
  //   'node:url',
  //   'node:process',
  //   'node:crypto',
  //   'node:stream',
  //   'node:util'
  // ]
})


