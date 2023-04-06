const ram = require('random-access-memory')
const Corestore = require('corestore')

const Autobase = require('../..')

module.exports = {
  create,
  sync,
  addWriter,
  apply,
  confirm,
  compare,
  setupContinuousSync
}

async function create (n, apply, open) {
  const opts = { apply, open, valueEncoding: 'json' }
  const bases = [new Autobase(new Corestore(ram, { primaryKey: Buffer.alloc(32).fill(0) }), null, opts)]
  await bases[0].ready()
  if (n === 1) return bases
  for (let i = 1; i < n; i++) {
    const base = new Autobase(new Corestore(ram, { primaryKey: Buffer.alloc(32).fill(i) }), bases[0].local.key, opts)
    await base.ready()
    bases.push(base)
  }
  return bases
}

async function sync (bases) {
  const streams = []
  const missing = bases.slice()

  while (missing.length) {
    const a = missing.pop()

    for (const b of missing) {
      const s1 = a.store.replicate(true)
      const s2 = b.store.replicate(false)

      s1.on('error', () => {})
      s2.on('error', () => {})

      s1.pipe(s2).pipe(s1)

      streams.push(s1)
      streams.push(s2)
    }
  }

  await Promise.all(bases.map(b => b.update({ wait: true })))

  const closes = []

  for (const stream of streams) {
    stream.destroy()
    closes.push(new Promise(resolve => stream.on('close', resolve)))
  }

  await Promise.all(closes)
}

async function setupContinuousSync (t, bases) {
  const streams = []
  const missing = bases.slice()

  while (missing.length) {
    const a = missing.pop()

    for (const b of missing) {
      const s1 = a.store.replicate(true)
      const s2 = b.store.replicate(false)

      s1.on('error', () => {})
      s2.on('error', () => {})

      s1.pipe(s2).pipe(s1)

      streams.push(s1)
      streams.push(s2)
    }
  }

  t.teardown(async () => {
    const closes = []

    for (const stream of streams) {
      stream.destroy()
      closes.push(new Promise(resolve => stream.on('close', resolve)))
    }

    await Promise.all(closes)
  })
}

async function addWriter (base, add) {
  return base.append({ add: add.local.key.toString('hex') })
}

async function confirm (bases) {
  await sync(bases)

  const writers = bases.filter(b => !!b.localWriter)
  const maj = Math.floor(writers.length / 2) + 1

  for (let i = 0; i < maj; i++) await writers[i].append(null)
  await sync(bases)
  for (let i = 0; i < maj; i++) await writers[i].append(null)
  return sync(bases)
}

async function compare (a, b, full = false) {
  const alen = full ? a.view.length : a.view.indexedLength
  const blen = full ? b.view.length : b.view.indexedLength

  if (alen !== blen) throw new Error('Views are different lengths')

  for (let i = 0; i < alen; i++) {
    const left = await a.view.get(i)
    const right = await b.view.get(i)

    if (!equal(left, right)) throw new Error('Views differ at block' + i)
  }
}

function equal (a, b) {
  if (typeof a !== typeof b) return false
  if (a === null) return b === null
  if (typeof a === 'object') {
    const entries = Object.entries(a)

    if (entries.length !== Object.entries(b).length) return false

    for (const [k, v] of entries) {
      if (!equal(b[k], v)) return false
    }

    return true
  }

  return a === b
}

async function apply (batch, view, base) {
  for (const { value } of batch) {
    if (value === null) continue
    if (value.add) {
      return base.system.addWriter(Buffer.from(value.add, 'hex'))
    }

    if (view) await view.append(value)
  }
}
