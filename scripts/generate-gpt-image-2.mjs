import fs from 'node:fs'
import path from 'node:path'

function printUsage() {
  console.log(`
Usage:
  node scripts/generate-gpt-image-2.mjs --prompt "a red bicycle in a studio" [options]

Options:
  --prompt, -p         Text prompt for image generation
  --prompt-file        Read prompt text from a file
  --out, -o            Output file path (default: ./tmp/gpt-image-2-output.png)
  --model              Image model (default: gpt-image-2)
  --size               Image size, e.g. 1024x1024, 1536x1024, auto
  --quality            low | medium | high | auto (default: auto)
  --background         auto | opaque (default: auto)
  --format             png | jpeg | webp (default: png)
  --compression        0-100, only for jpeg/webp
  --moderation         auto | low (optional)
  --n                  Number of images to generate (default: 1)
  --help, -h           Show this help

Examples:
  node scripts/generate-gpt-image-2.mjs \\
    --prompt "A photorealistic steel bridge at sunrise" \\
    --out ./tmp/bridge.png \\
    --size 1536x1024 \\
    --quality high

  node scripts/generate-gpt-image-2.mjs \\
    --prompt "A robot mascot in three styles" \\
    --n 3 \\
    --out ./tmp/mascot.png

  npm run openai:image -- --prompt "A mascot in watercolor style"
`.trim())
}

function parseArgs(argv) {
  const args = {
    model: 'gpt-image-2',
    size: undefined,
    quality: 'auto',
    background: 'auto',
    format: 'png',
    compression: undefined,
    moderation: undefined,
    n: 1,
    out: path.resolve(process.cwd(), 'tmp', 'gpt-image-2-output.png'),
  }

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    const next = argv[i + 1]

    switch (token) {
      case '--prompt':
      case '-p':
        args.prompt = next
        i += 1
        break
      case '--prompt-file':
        args.promptFile = next
        i += 1
        break
      case '--out':
      case '-o':
        args.out = path.resolve(process.cwd(), next)
        i += 1
        break
      case '--model':
        args.model = next
        i += 1
        break
      case '--size':
        args.size = next
        i += 1
        break
      case '--quality':
        args.quality = next
        i += 1
        break
      case '--background':
        args.background = next
        i += 1
        break
      case '--format':
        args.format = next
        i += 1
        break
      case '--compression':
        args.compression = next
        i += 1
        break
      case '--moderation':
        args.moderation = next
        i += 1
        break
      case '--n':
        args.n = next
        i += 1
        break
      case '--help':
      case '-h':
        args.help = true
        break
      default:
        if (!token.startsWith('-') && !args.prompt) {
          args.prompt = token
        } else {
          throw new Error(`Unknown argument: ${token}`)
        }
    }
  }

  return args
}

function readPrompt(args) {
  if (args.promptFile) {
    return fs.readFileSync(path.resolve(process.cwd(), args.promptFile), 'utf8').trim()
  }
  return String(args.prompt ?? '').trim()
}

function assertValidArgs(args) {
  if (args.help) return

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY in environment.')
  }

  const prompt = readPrompt(args)
  if (!prompt) {
    throw new Error('Missing prompt. Use --prompt or --prompt-file.')
  }

  if (!['png', 'jpeg', 'webp'].includes(args.format)) {
    throw new Error(`Unsupported format: ${args.format}`)
  }

  if (!['low', 'medium', 'high', 'auto'].includes(args.quality)) {
    throw new Error(`Unsupported quality: ${args.quality}`)
  }

  if (!['auto', 'opaque'].includes(args.background)) {
    throw new Error(`Unsupported background: ${args.background}`)
  }

  if (args.compression !== undefined) {
    const compression = Number(args.compression)
    if (!Number.isInteger(compression) || compression < 0 || compression > 100) {
      throw new Error('--compression must be an integer between 0 and 100.')
    }
    if (args.format === 'png') {
      throw new Error('--compression is only supported for jpeg and webp output.')
    }
  }

  const n = Number(args.n)
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error('--n must be a positive integer.')
  }
}

function buildRequestBody(args) {
  const body = {
    model: args.model,
    prompt: readPrompt(args),
    n: Number(args.n),
    quality: args.quality,
    background: args.background,
    output_format: args.format,
  }

  if (args.size) {
    body.size = args.size
  }

  if (args.compression !== undefined) {
    body.output_compression = Number(args.compression)
  }

  if (args.moderation) {
    body.moderation = args.moderation
  }

  return body
}

async function generateImage(args) {
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(buildRequestBody(args)),
  })

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    const message =
      payload?.error?.message ||
      `OpenAI request failed with status ${response.status}`
    throw new Error(message)
  }

  const imageItems = Array.isArray(payload?.data) ? payload.data : []
  if (imageItems.length === 0 || !imageItems[0]?.b64_json) {
    throw new Error('No image data returned from OpenAI.')
  }

  return {
    images: imageItems,
    requestId: response.headers.get('x-request-id'),
  }
}

function ensureOutputPath(outputPath, format) {
  const extension = path.extname(outputPath)
  if (extension) return outputPath
  return `${outputPath}.${format}`
}

function buildOutputPaths(outputPath, count, format) {
  const resolvedPath = ensureOutputPath(outputPath, format)
  if (count <= 1) return [resolvedPath]

  const parsed = path.parse(resolvedPath)
  return Array.from({ length: count }, (_, index) =>
    path.join(parsed.dir, `${parsed.name}-${index + 1}${parsed.ext}`),
  )
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (args.help) {
    printUsage()
    return
  }

  assertValidArgs(args)

  const { images, requestId } = await generateImage(args)
  const outputPaths = buildOutputPaths(args.out, images.length, args.format)
  fs.mkdirSync(path.dirname(outputPaths[0]), { recursive: true })

  const revisedPrompts = []
  for (let index = 0; index < images.length; index += 1) {
    const item = images[index]
    fs.writeFileSync(outputPaths[index], Buffer.from(item.b64_json, 'base64'))
    revisedPrompts.push(item.revised_prompt ?? null)
  }

  console.log(JSON.stringify({
    ok: true,
    model: args.model,
    output: images.length === 1 ? outputPaths[0] : outputPaths,
    requestId,
    revisedPrompt: images.length === 1 ? revisedPrompts[0] : revisedPrompts,
  }, null, 2))
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2))
  process.exit(1)
})
