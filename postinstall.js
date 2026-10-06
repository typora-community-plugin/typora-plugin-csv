import fs from 'node:fs'
import path from 'node:path'

const papaparsePath = path.join(process.cwd(), 'node_modules', 'papaparse', 'papaparse.js')
try {
  const content = fs.readFileSync(papaparsePath, 'utf8')
  if (content.includes("require('stream').Duplex")) {
    fs.writeFileSync(
      papaparsePath,
      content.replace("require('stream').Duplex", "void 0"),
      'utf8'
    )
    console.log('[postinstall] Patched papaparse to remove Node.js stream dependency')
  }
} catch (e) {
  // Ignore if papaparse not installed yet
}
