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
  external: [
    'log4js',
    'cli-progress',
    'axios',
    'mdast-util-from-markdown',
    'mdast-util-to-markdown',
    'ora',
    'pull-md-img',
    'markdown-toc',
    'pako',
    'semver',
    'vitepress'
  ]
})


